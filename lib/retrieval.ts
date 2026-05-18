import { config } from "./config";
import { pool } from "./db";
import { createEmbedding } from "./ollama";
import { toPgVector } from "./vector";

export type RetrievedChunk = {
  id: number;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

export async function retrieveRelevantChunks(question: string) {
  const embedding = await createEmbedding(question);
  const vector = toPgVector(embedding);

  const result = await pool.query<RetrievedChunk>(
    `
      SELECT
        id,
        content,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `,
    [vector, config.retrievalLimit],
  );

  return result.rows;
}
