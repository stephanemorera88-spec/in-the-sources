import "@/lib/server-only";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import type { License } from "@/lib/contracts";
import { requireLicense, UnauthorizedError } from "@/lib/license";

/*
 * License gate and error mapping for every route handler that needs a
 * license (src/app/api/projects/**, src/app/api/settings/**); the activate
 * route reuses readJson, errorToResponse and jsonUnauthorized so every API
 * error body has the same shape, { error: <plain sentence> }, which the
 * client components show as-is. This is the only route wrapper in the tree
 * (integration decision 2026-10-01: builder B's positional withLicense in
 * src/lib/license was removed because its handler shape and code-style
 * bodies differed). License first, UnauthorizedError -> 401 JSON, ZodError
 * and malformed JSON bodies -> 400 JSON, data-layer InvalidInputError -> 400,
 * NotFoundError -> 404, anything else -> 500 JSON.
 */

export type RouteParams = Record<string, string>;

export interface LicensedContext<P extends RouteParams> {
  license: License;
  request: NextRequest;
  params: P;
}

export type LicensedHandler<P extends RouteParams> = (ctx: LicensedContext<P>) => Promise<Response>;

/** The shape Next 16 expects from a route.ts export: `params` is a Promise
 *  (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md, "context"). */
export type RouteHandler<P extends RouteParams> = (
  request: NextRequest,
  context: { params: Promise<P> }
) => Promise<Response>;

/** Thrown by route code for a user-fixable problem; becomes a 400 through withLicense. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export function json(data: unknown, status = 200): Response {
  // Response.json(data, init): node_modules/typescript/lib/lib.dom.d.ts line 26381.
  return Response.json(data, { status });
}

export function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}

export function jsonUnauthorized(): Response {
  return jsonError("unauthorized", 401);
}

export function jsonNotFound(): Response {
  return jsonError("not found", 404);
}

/** Reads a JSON body. A missing or malformed body becomes a 400 through withLicense. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("The request body must be JSON.");
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "unknown error";
}

/**
 * Masks anything shaped like a provider API key before an upstream error
 * message reaches a response. OpenAI and Anthropic keys start with "sk-",
 * Gemini keys with "AIza". The character class includes "*" because OpenAI
 * echoes a rejected key back partly masked ("sk-test-****7890"), and the
 * prefix is still key material. Defense in depth: no route here ever puts a
 * key in a message on purpose.
 */
export function scrubSecrets(text: string): string {
  return text.replace(/\bsk-[A-Za-z0-9_*-]{6,}/g, "sk-[hidden]").replace(/\bAIza[A-Za-z0-9_*-]{8,}/g, "AIza[hidden]");
}

/** One plain line per issue, prefixed with the field path when there is one. */
export function formatZodError(err: ZodError): string {
  // ZodError.issues: node_modules/zod/v4/core/errors.d.ts line 73.
  return err.issues
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(" ");
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof UnauthorizedError || (err instanceof Error && err.name === "UnauthorizedError")) {
    return jsonUnauthorized();
  }
  if (err instanceof ZodError) return jsonError(formatZodError(err), 400);
  if (err instanceof BadRequestError) return jsonError(err.message, 400);
  if (err instanceof Error) {
    // The data layer (src/lib/db/errors.ts) throws these for a value it cannot
    // use or a row that is not on this license. Matched by name so the mapping
    // holds whichever module instance created the class.
    if (err.name === "InvalidInputError") return jsonError(err.message, 400);
    if (err.name === "NotFoundError") return jsonNotFound();
  }
  console.error("[api] unhandled error:", err);
  return jsonError("Something went wrong on our side. Try again in a moment.", 500);
}

/**
 * Wraps a route handler: resolves the license from the cookie first, awaits
 * the params Promise, and maps thrown errors to JSON responses.
 *
 *   export const GET = withLicense<{ id: string }>(async ({ license, params }) => ...)
 */
export function withLicense<P extends RouteParams = Record<string, never>>(handler: LicensedHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      const license = await requireLicense();
      const params = context?.params ? await context.params : ({} as P);
      return await handler({ license, request, params });
    } catch (err) {
      return errorToResponse(err);
    }
  };
}
