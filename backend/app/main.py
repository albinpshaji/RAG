from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg.types.json import Jsonb

from app.chunking import chunk_text
from app.config import settings
from app.db import close_pool, open_pool, pool
from app.ollama import create_embedding, generate_answer
from app.prompts import build_rag_prompt
from app.retrieval import retrieve_relevant_chunks
from app.schemas import ChatRequest, ChatResponse, IngestRequest, IngestResponse
from app.vector import to_pg_vector


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


@app.post("/api/ingest", response_model=IngestResponse)
def ingest_document(request: IngestRequest) -> IngestResponse:
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Document text is required.")

    chunks = chunk_text(text)

    if not chunks:
        raise HTTPException(status_code=400, detail="No usable text chunks were found.")

    source = request.source.strip() if request.source else "pasted text"

    try:
        with pool.connection() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for chunk in chunks:
                        embedding = create_embedding(chunk.content)
                        cursor.execute(
                            """
                            INSERT INTO documents (content, metadata, embedding)
                            VALUES (%s, %s::jsonb, %s::vector)
                            """,
                            (
                                chunk.content,
                                Jsonb(
                                    {
                                        "source": source,
                                        "chunkIndex": chunk.chunk_index,
                                        "ingestedAt": datetime.now(timezone.utc).isoformat(),
                                    }
                                ),
                                to_pg_vector(embedding),
                            ),
                        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return IngestResponse(source=source, chunks=len(chunks))


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
