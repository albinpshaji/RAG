import { NextResponse } from "next/server";
import { chunkText } from "@/lib/chunking";
import { pool } from "@/lib/db";
import { createEmbedding } from "@/lib/ollama";
import { toPgVector } from "@/lib/vector";

export const runtime = "nodejs";

type IngestRequest = {
  text?: string;
  source?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestRequest;
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json({ error: "Document text is required." }, { status: 400 });
    }

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No usable text chunks were found." }, { status: 400 });
    }

    const source = body.source?.trim() || "pasted text";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const chunk of chunks) {
        const embedding = await createEmbedding(chunk.content);

        await client.query(
          `
            INSERT INTO documents (content, metadata, embedding)
            VALUES ($1, $2::jsonb, $3::vector)
          `,
          [
            chunk.content,
            JSON.stringify({
              source,
              chunkIndex: chunk.chunkIndex,
              ingestedAt: new Date().toISOString(),
            }),
            toPgVector(embedding),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      source,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to ingest document." },
      { status: 500 },
    );
  }
}
