from typing import Any

from app.config import settings
from app.db import pool
from app.ollama import create_embedding
from app.schemas import RetrievedChunk
from app.vector import to_pg_vector


def retrieve_relevant_chunks(question: str) -> list[RetrievedChunk]:
    embedding = create_embedding(question)
    vector = to_pg_vector(embedding)

    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    content,
                    metadata,
                    1 - (embedding <=> %s::vector) AS similarity
                FROM documents
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (vector, vector, settings.retrieval_limit),
            )
            rows: list[tuple[int, str, dict[str, Any] | None, float]] = cursor.fetchall()

    return [
        RetrievedChunk(
            id=row[0],
            content=row[1],
            metadata=row[2],
            similarity=float(row[3]),
        )
        for row in rows
    ]
