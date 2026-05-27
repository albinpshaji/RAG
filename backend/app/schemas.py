from typing import Any

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    text: str = Field(min_length=1)
    source: str | None = None


class IngestResponse(BaseModel):
    source: str
    chunks: int


class UploadResponse(BaseModel):
    source: str
    chunks: int
    pages: int


class StoredSource(BaseModel):
    source: str
    chunks: int
    pages: list[int]
    last_ingested_at: str | None = None


class SourceListResponse(BaseModel):
    sources: list[StoredSource]


class StoredChunk(BaseModel):
    id: int
    content: str
    metadata: dict[str, Any] | None
    embedding: str | None
    embedding_dimensions: int | None


class ChunkListResponse(BaseModel):
    source: str
    chunks: list[StoredChunk]


class DeleteSourceResponse(BaseModel):
    source: str
    deleted_chunks: int


class ChatRequest(BaseModel):
    question: str = Field(min_length=1)


class RetrievedChunk(BaseModel):
    id: int
    content: str
    metadata: dict[str, Any] | None
    similarity: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[RetrievedChunk]


class ErrorResponse(BaseModel):
    error: str
