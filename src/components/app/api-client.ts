/*
 * Small fetch wrapper for the client components. Sends JSON, reads JSON,
 * and turns every failure into a plain message the component can show.
 * The license cookie is httpOnly and travels with every same-origin fetch.
 * Components inside the app use the useApi hook (./use-api.ts), which adds
 * the redirect to /activate on a 401; the activate form and the logout
 * button call this directly.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; fromServer: boolean };

export interface ApiFetchInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export async function apiFetch<T = unknown>(url: string, init: ApiFetchInit = {}): Promise<ApiResult<T>> {
  const { method = "GET", body } = init;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
      status: 0,
      fromServer: false,
    };
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const serverMessage = messageFrom(data);
    return {
      ok: false,
      error: serverMessage ?? fallbackMessage(response.status),
      status: response.status,
      fromServer: serverMessage !== null,
    };
  }

  return { ok: true, data: data as T };
}

function messageFrom(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return null;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Your license is not active on this browser. Activate your key again.";
  if (status === 404) return "We could not find that. It may have been deleted.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 504) return "The server took too long to answer. Refresh the page in a minute to see what finished.";
  return `Request failed (${status}).`;
}
