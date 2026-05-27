from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from psycopg.types.json import Jsonb

from app.chunking import chunk_text
from app.config import settings
from app.db import close_pool, open_pool, pool
from app.ollama import create_embedding, generate_answer
from app.pdf import extract_pdf_chunks
from app.prompts import build_rag_prompt
from app.retrieval import retrieve_relevant_chunks
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ChunkListResponse,
    DeleteSourceResponse,
    IngestRequest,
    IngestResponse,
    SourceListResponse,
    StoredChunk,
    StoredSource,
    UploadResponse,
)
from app.vector import to_pg_vector


@dataclass(frozen=True)
class ChunkToStore:
    content: str
    metadata: dict[str, Any]


@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()
    try:
        yield
    finally:
        close_pool()


app = FastAPI(
    title="Local RAG Engine API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):[0-9]+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sources", response_model=SourceListResponse)
def list_sources() -> SourceListResponse:
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COALESCE(NULLIF(metadata->>'source', ''), 'pasted text') AS source,
                    COUNT(*)::int AS chunks,
                    COALESCE(
                        ARRAY_AGG(DISTINCT (metadata->>'page')::int ORDER BY (metadata->>'page')::int)
                        FILTER (WHERE metadata ? 'page'),
                        ARRAY[]::int[]
                    ) AS pages,
                    MAX(metadata->>'ingestedAt') AS last_ingested_at
                FROM documents
                GROUP BY source
                ORDER BY last_ingested_at DESC NULLS LAST, source ASC
                """
            )
            rows = cursor.fetchall()

    return SourceListResponse(
        sources=[
            StoredSource(
                source=row[0],
                chunks=row[1],
                pages=row[2],
                last_ingested_at=row[3],
            )
            for row in rows
        ]
    )


@app.get("/api/chunks", response_model=ChunkListResponse)
def list_chunks(source: str = Query(min_length=1)) -> ChunkListResponse:
    source_name = clean_source(source)

    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    content,
                    metadata,
                    embedding::text AS embedding,
                    vector_dims(embedding) AS embedding_dimensions
                FROM documents
                WHERE COALESCE(NULLIF(metadata->>'source', ''), 'pasted text') = %s
                ORDER BY
                    COALESCE((metadata->>'page')::int, 0),
                    COALESCE((metadata->>'chunkIndex')::int, id),
                    id
                """,
                (source_name,),
            )
            rows = cursor.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f'No chunks found for source "{source_name}".')

    return ChunkListResponse(
        source=source_name,
        chunks=[
            StoredChunk(
                id=row[0],
                content=row[1],
                metadata=row[2],
                embedding=row[3],
                embedding_dimensions=row[4],
            )
            for row in rows
        ],
    )


@app.delete("/api/sources/{source:path}", response_model=DeleteSourceResponse)
def delete_source(source: str) -> DeleteSourceResponse:
    source_name = clean_source(source)

    with pool.connection() as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM documents
                    WHERE COALESCE(NULLIF(metadata->>'source', ''), 'pasted text') = %s
                    """,
                    (source_name,),
                )
                deleted_chunks = cursor.rowcount

    if deleted_chunks == 0:
        raise HTTPException(status_code=404, detail=f'No chunks found for source "{source_name}".')

    return DeleteSourceResponse(source=source_name, deleted_chunks=deleted_chunks)


def clean_source(source: str | None, fallback: str = "pasted text") -> str:
    value = source.strip() if source else ""
    return value or fallback


def store_chunks(chunks: list[ChunkToStore]) -> None:
    ingested_at = datetime.now(timezone.utc).isoformat()
    embedded_chunks: list[tuple[str, Jsonb, str]] = []

    for chunk in chunks:
        embedding = create_embedding(chunk.content)
        embedded_chunks.append(
            (
                chunk.content,
                Jsonb({**chunk.metadata, "ingestedAt": ingested_at}),
                to_pg_vector(embedding),
            )
        )

    with pool.connection() as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO documents (content, metadata, embedding)
                    VALUES (%s, %s::jsonb, %s::vector)
                    """,
                    embedded_chunks,
                )


@app.post("/api/ingest", response_model=IngestResponse)
def ingest_document(request: IngestRequest) -> IngestResponse:
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Document text is required.")

    chunks = chunk_text(text)

    if not chunks:
        raise HTTPException(status_code=400, detail="No usable text chunks were found.")

    source = clean_source(request.source)
    chunks_to_store = [
        ChunkToStore(
            content=chunk.content,
            metadata={
                "source": source,
                "chunkIndex": chunk.chunk_index,
            },
        )
        for chunk in chunks
    ]

    try:
        store_chunks(chunks_to_store)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return IngestResponse(source=source, chunks=len(chunks))


@app.post("/api/upload", response_model=UploadResponse)
def upload_pdf(file: UploadFile = File(...)) -> UploadResponse:
    source, pages, pdf_chunks = extract_pdf_chunks(file)
    chunks_to_store = [
        ChunkToStore(
            content=chunk.content,
            metadata={
                "source": chunk.source,
                "page": chunk.page,
                "chunkIndex": chunk.chunk_index,
                "pageChunkIndex": chunk.page_chunk_index,
            },
        )
        for chunk in pdf_chunks
    ]

    try:
        store_chunks(chunks_to_store)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return UploadResponse(source=source, chunks=len(pdf_chunks), pages=pages)


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    try:
        sources = retrieve_relevant_chunks(question)

        if not sources:
            return ChatResponse(
                answer="I could not find any document chunks to search. Ingest a document first.",
                sources=[],
            )

        prompt = build_rag_prompt(question, sources)
        answer = generate_answer(prompt)

        return ChatResponse(answer=answer, sources=sources)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
