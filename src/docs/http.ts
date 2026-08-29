import { FETCH_TIMEOUT_MS } from "./constants.ts";
import { DocsNetworkError, DocsNotFoundError } from "./errors.ts";

export function githubHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "create-excalibur (ex docs)",
    ...extra,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * fetch() with a timeout and uniform error translation.
 * 404 → DocsNotFoundError, other failures → DocsNetworkError.
 */
export async function request(
  url: string,
  init: RequestInit = {},
  { timeout = FETCH_TIMEOUT_MS }: { timeout?: number } = {}
): Promise<Response> {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeout),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "";
    if (name === "AbortError") throw cause; // caller cancelled — not a network failure
    const reason =
      name === "TimeoutError" ? "timed out" : cause instanceof Error ? cause.message : "failed";
    throw new DocsNetworkError(`Request to ${new URL(url).host} ${reason}`, {
      cause,
    });
  }
  if (response.status === 404) {
    throw new DocsNotFoundError(`Not found: ${url}`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.text();
      detail = body ? `: ${body.slice(0, 200)}` : "";
    } catch {
      /* ignore */
    }
    throw new DocsNetworkError(
      `${new URL(url).host} responded ${response.status}${detail}`
    );
  }
  return response;
}

export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit,
  opts?: { timeout?: number }
): Promise<T> {
  const response = await request(url, init, opts);
  return response.json() as Promise<T>;
}

export async function requestText(
  url: string,
  init?: RequestInit,
  opts?: { timeout?: number }
): Promise<string> {
  const response = await request(url, init, opts);
  return response.text();
}

/** Run `fn` over `items` with at most `concurrency` in flight. Preserves order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R> | R
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker
  );
  await Promise.all(workers);
  return results;
}
