export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:albin@localhost:5433/rag_db",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen3.5:4b",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  retrievalLimit: Number(process.env.RETRIEVAL_LIMIT ?? 5),
  generationTimeoutMs: Number(process.env.GENERATION_TIMEOUT_MS ?? 60000),
  generationMaxTokens: Number(process.env.GENERATION_MAX_TOKENS ?? 384),
};
