/**
 * Test doubles for the engine tests. Every SDK accepts a custom fetch, so the
 * request shape and the error paths are tested offline against the real SDK
 * code. Not a test file itself (vitest only picks up *.test.ts).
 */

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

export type FakeFetch = typeof fetch & { requests: CapturedRequest[] };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ?? null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export function fakeFetch(
  handler: (req: CapturedRequest, init?: RequestInit) => Response | Promise<Response>
): FakeFetch {
  const requests: CapturedRequest[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const req: CapturedRequest = {
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers),
      body: parseBody(init?.body),
    };
    requests.push(req);
    return handler(req, init);
  }) as typeof fetch;
  return Object.assign(impl, { requests });
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/** Never answers; rejects with an AbortError once the caller's signal fires (the timeout path). */
export function hangingFetch(): FakeFetch {
  return fakeFetch(
    (_req, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener("abort", () => reject(abortError()), { once: true });
      })
  );
}

export const tick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
