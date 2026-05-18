import type { RetrievedChunk } from "./retrieval";

export function buildRagPrompt(question: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map((chunk, index) => {
      const source = chunk.metadata?.source ?? "pasted text";
      const chunkIndex = chunk.metadata?.chunkIndex ?? chunk.id;

      return `Source ${index + 1} (${source}, chunk ${chunkIndex}, similarity ${chunk.similarity.toFixed(
        3,
      )}):\n${chunk.content}`;
    })
    .join("\n\n---\n\n");

  return `You are a careful document question-answering assistant.

Use only the provided context to answer the user's question.
If the context does not contain enough information, say that the document context does not provide enough information.
Be concise, specific, and cite the source numbers you used.

Context:
${context}

Question:
${question}

Answer:`;
}
