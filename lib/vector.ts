export function toPgVector(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
