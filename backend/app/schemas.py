from typing import Any

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    text: str = Field(min_length=1)
    source: str | None = None


class IngestResponse(BaseModel):
    source: str
    chunks: int


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
