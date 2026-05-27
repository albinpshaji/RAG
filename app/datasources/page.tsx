"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function getApiErrorMessage(data: unknown, fallback: string) {
  if (typeof data !== "object" || data === null) {
    return fallback;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.detail === "string") {
    return record.detail;
  }

  if (typeof record.error === "string") {
    return record.error;
  }

  return fallback;
}

type StoredSource = {
  source: string;
  chunks: number;
  pages: number[];
  last_ingested_at: string | null;
};

type StoredChunk = {
  id: number;
  content: string;
  metadata: Record<string, unknown> | null;
  embedding: string | null;
  embedding_dimensions: number | null;
};

export default function DatasourcesPage() {
  const [sourcesStatus, setSourcesStatus] = useState("");
  const [storedSources, setStoredSources] = useState<StoredSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [storedChunks, setStoredChunks] = useState<StoredChunk[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

  async function loadSources(showLoading = true) {
    if (showLoading) {
      setIsLoadingSources(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/sources`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Could not load stored sources."));
      }

      const sources = (data.sources ?? []) as StoredSource[];

      setStoredSources(sources);
      if (selectedSource && !sources.some((item) => item.source === selectedSource)) {
        setSelectedSource(null);
        setStoredChunks([]);
      }
      setSourcesStatus("");
    } catch (error) {
      setSourcesStatus(error instanceof Error ? error.message : "Could not load stored sources.");
    } finally {
      if (showLoading) {
        setIsLoadingSources(false);
      }
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      async function loadInitialSources() {
        try {
          const response = await fetch(`${API_BASE_URL}/api/sources`);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(getApiErrorMessage(data, "Could not load stored sources."));
          }

          setStoredSources(data.sources ?? []);
          setSourcesStatus("");
        } catch (error) {
          setSourcesStatus(error instanceof Error ? error.message : "Could not load stored sources.");
        }
      }

      void loadInitialSources();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function loadChunksForSource(sourceName: string) {
    if (selectedSource === sourceName && storedChunks.length > 0) {
      setSelectedSource(null);
      setStoredChunks([]);
      return;
    }

    setSelectedSource(sourceName);
    setIsLoadingChunks(true);
    setSourcesStatus(`Loading chunks from "${sourceName}"...`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chunks?source=${encodeURIComponent(sourceName)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Could not load chunks."));
      }

      setStoredChunks(data.chunks ?? []);
      setSourcesStatus(`Loaded ${data.chunks?.length ?? 0} chunks from "${data.source}".`);
    } catch (error) {
      setStoredChunks([]);
      setSourcesStatus(error instanceof Error ? error.message : "Could not load chunks.");
    } finally {
      setIsLoadingChunks(false);
    }
  }

  async function deleteStoredSource(sourceName: string) {
    const confirmed = window.confirm(`Delete all stored chunks from "${sourceName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingSource(sourceName);
    setSourcesStatus(`Deleting "${sourceName}"...`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/${encodeURIComponent(sourceName)}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, "Could not delete source."));
      }

      setStoredSources((current) => current.filter((item) => item.source !== data.source));
      if (selectedSource === data.source) {
        setSelectedSource(null);
        setStoredChunks([]);
      }
      setSourcesStatus(`Deleted ${data.deleted_chunks} chunks from "${data.source}".`);
    } catch (error) {
      setSourcesStatus(error instanceof Error ? error.message : "Could not delete source.");
    } finally {
      setDeletingSource(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#171717]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-[#d9d6cc] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#5f6f52]">
              Local RAG Engine
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#111] md:text-4xl">
              Datasources
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadSources()}
              disabled={isLoadingSources}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#c8c3b8] px-4 text-sm font-semibold text-[#243d30] transition hover:bg-[#f4f6f1] disabled:cursor-not-allowed disabled:text-[#87877f]"
            >
              {isLoadingSources ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#243d30] px-4 text-sm font-semibold text-white transition hover:bg-[#1a2f24]"
            >
              Back to Chat
            </Link>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(300px,0.75fr)_minmax(520px,1.25fr)]">
          <section className="rounded-lg border border-[#d9d6cc] bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Sources</h2>
            <div className="mt-3 grid gap-3">
              {storedSources.length === 0 ? (
                <p className="rounded-md bg-[#f6f5ef] px-3 py-3 text-sm text-[#65655f]">
                  No stored sources found.
                </p>
              ) : (
                storedSources.map((storedSource) => (
                  <article
                    key={storedSource.source}
                    className={`rounded-md border p-3 ${
                      selectedSource === storedSource.source
                        ? "border-[#57735a] bg-[#f4f7f1]"
                        : "border-[#e3e0d8] bg-[#fcfcfa]"
                    }`}
                  >
                    <div className="grid gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-[#252520]">
                          {storedSource.source}
                        </h3>
                        <p className="mt-1 text-xs text-[#66665f]">
                          {storedSource.chunks} chunks
                          {storedSource.pages.length > 0
                            ? ` · pages ${storedSource.pages[0]}-${storedSource.pages[storedSource.pages.length - 1]}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void loadChunksForSource(storedSource.source)}
                          disabled={isLoadingChunks && selectedSource === storedSource.source}
                          className="h-9 flex-1 rounded-md border border-[#c8c3b8] px-3 text-sm font-medium text-[#243d30] transition hover:bg-white disabled:cursor-not-allowed disabled:text-[#87877f]"
                        >
                          {isLoadingChunks && selectedSource === storedSource.source
                            ? "Loading..."
                            : selectedSource === storedSource.source && storedChunks.length > 0
                              ? "Hide"
                              : "View details"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteStoredSource(storedSource.source)}
                          disabled={deletingSource === storedSource.source}
                          className="h-9 rounded-md border border-[#b97b73] px-3 text-sm font-medium text-[#8b2d23] transition hover:bg-[#fff1ef] disabled:cursor-not-allowed disabled:border-[#d2b9b5] disabled:text-[#9a817d]"
                        >
                          {deletingSource === storedSource.source ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
            {sourcesStatus ? <p className="mt-3 text-sm text-[#6b5c20]">{sourcesStatus}</p> : null}
          </section>

          <section className="rounded-lg border border-[#d9d6cc] bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">Stored Chunk Details</h2>
            {!selectedSource ? (
              <p className="mt-3 rounded-md bg-[#f6f5ef] px-3 py-3 text-sm text-[#65655f]">
                Select a source to view its stored chunks, metadata, and embedding vectors.
              </p>
            ) : (
              <div className="mt-3">
                <h3 className="truncate text-sm font-semibold text-[#252520]">{selectedSource}</h3>
                <div className="mt-3 grid max-h-[calc(100vh-220px)] gap-3 overflow-y-auto pr-1">
                  {storedChunks.length === 0 ? (
                    <p className="rounded-md bg-[#f6f5ef] px-3 py-3 text-sm text-[#65655f]">
                      {isLoadingChunks ? "Loading chunk rows..." : "No chunk rows loaded."}
                    </p>
                  ) : (
                    storedChunks.map((chunk) => (
                      <details
                        key={chunk.id}
                        className="rounded-md border border-[#e3e0d8] bg-[#fcfcfa] p-3"
                      >
                        <summary className="cursor-pointer text-sm font-medium text-[#252520]">
                          Row {chunk.id} · chunk {String(chunk.metadata?.chunkIndex ?? chunk.id)}
                          {chunk.metadata?.page ? ` · page ${String(chunk.metadata.page)}` : ""}
                        </summary>
                        <dl className="mt-3 grid gap-2 text-xs text-[#5f5f58]">
                          <div>
                            <dt className="font-semibold text-[#34342f]">Database id</dt>
                            <dd>{chunk.id}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[#34342f]">Embedding dimensions</dt>
                            <dd>{chunk.embedding_dimensions ?? "unknown"}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[#34342f]">Metadata JSON</dt>
                            <dd>
                              <pre className="mt-1 max-h-36 overflow-auto rounded-md bg-[#f6f5ef] p-2 text-[11px] leading-5 text-[#252520]">
                                {JSON.stringify(chunk.metadata, null, 2)}
                              </pre>
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[#34342f]">Chunk content</dt>
                            <dd className="mt-1 rounded-md bg-white p-2 text-sm leading-6 text-[#252520]">
                              {chunk.content}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[#34342f]">Embedding vector</dt>
                            <dd>
                              <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#111] p-2 text-[11px] leading-5 text-[#f4f4ed]">
                                {chunk.embedding ?? "null"}
                              </pre>
                            </dd>
                          </div>
                        </dl>
                      </details>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
