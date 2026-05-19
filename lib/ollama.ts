import { config } from "./config";

type OllamaEmbeddingResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

type OllamaGenerateResponse = {
  response?: string;
};

export async function createEmbedding(input: string) {
  const response = await fetch(`${config.ollamaBaseUrl}/api/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.ollamaEmbedModel,
      prompt: input,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding request failed: ${response.status}`);
  }

  const data = (await response.json()) as OllamaEmbeddingResponse;
  const embedding = data.embedding ?? data.embeddings?.[0];

  if (!embedding || embedding.length !== 768) {
    throw new Error(
      `Expected a 768-dimensional embedding, received ${embedding?.length ?? 0}`,
    );
  }

  return embedding;
}

export async function generateAnswer(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.generationTimeoutMs);

  const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: config.ollamaChatModel,
      prompt,
      stream: false,
      think: false,
      options: {
        num_predict: config.generationMaxTokens,
        temperature: 0.2,
      },
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Ollama generation request failed: ${response.status}`);
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  const answer = data.response?.trim();

  if (!answer) {
    throw new Error("Ollama returned an empty answer.");
  }

  return answer;
}
