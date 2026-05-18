import { NextResponse } from "next/server";
import { generateAnswer } from "@/lib/ollama";
import { buildRagPrompt } from "@/lib/prompts";
import { retrieveRelevantChunks } from "@/lib/retrieval";

export const runtime = "nodejs";

type ChatRequest = {
  question?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const sources = await retrieveRelevantChunks(question);

    if (sources.length === 0) {
      return NextResponse.json({
        answer: "I could not find any document chunks to search. Ingest a document first.",
        sources: [],
      });
    }

    const prompt = buildRagPrompt(question, sources);
    const answer = await generateAnswer(prompt);

    return NextResponse.json({
      answer,
      sources,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to answer question." },
      { status: 500 },
    );
  }
}
