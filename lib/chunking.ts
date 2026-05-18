export type DocumentChunk = {
  content: string;
  chunkIndex: number;
};

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

export function normalizeText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(text: string): DocumentChunk[] {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const targetEnd = Math.min(start + CHUNK_SIZE, normalized.length);
    let end = targetEnd;

    if (targetEnd < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", targetEnd);
      const sentenceBreak = normalized.lastIndexOf(". ", targetEnd);
      const wordBreak = normalized.lastIndexOf(" ", targetEnd);
      const bestBreak = Math.max(paragraphBreak, sentenceBreak, wordBreak);

      if (bestBreak > start + CHUNK_SIZE * 0.5) {
        end = bestBreak + 1;
      }
    }

    const content = normalized.slice(start, end).trim();

    if (content) {
      chunks.push({
        content,
        chunkIndex: chunks.length,
      });
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}
