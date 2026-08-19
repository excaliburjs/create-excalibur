import { FETCH_TIMEOUT_MS } from "./constants.js";
import { DocsNetworkError, DocsNotFoundError } from "./errors.js";

export function githubHeaders(extra = {}) {
  const headers = {
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
export async function request(url, init = {}, { timeout = FETCH_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeout),
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause; // caller cancelled — not a network failure
    const reason =
      cause?.name === "TimeoutError" ? "timed out" : cause?.message ?? "failed";
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

export async function requestJson(url, init, opts) {
  const response = await request(url, init, opts);
  return response.json();
}

export async function requestText(url, init, opts) {
  const response = await request(url, init, opts);
  return response.text();
}

/** Run `fn` over `items` with at most `concurrency` in flight. Preserves order. */
export async function mapConcurrent(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
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
