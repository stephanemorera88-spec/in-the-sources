import { vi } from "vitest";
import type { NextRequest } from "next/server";
import type { License } from "@/lib/contracts";

/*
 * Shared pieces for the route handler tests under src/app/api/projects and
 * src/app/api/settings. Each test file still declares its own vi.mock calls
 * (they are hoisted per file); this module supplies the module shapes and
 * request helpers so the mocks stay identical across files.
 */

/** Same name as the real class so withLicense's `err.name` fallback also matches. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export const testLicense: License = {
  id: "lic_test",
  email: "tester@example.com",
  plan: "dev",
  status: "active",
  createdAt: "2026-10-01T00:00:00.000Z",
};

export const licenseMock = {
  requireLicense: vi.fn<() => Promise<License>>(),
  getCurrentLicense: vi.fn<() => Promise<License | null>>(),
};

/** Module shape for `vi.mock("@/lib/license", ...)`. */
export function licenseModuleMock() {
  return {
    LICENSE_COOKIE: "its_license",
    UnauthorizedError,
    requireLicense: licenseMock.requireLicense,
    getCurrentLicense: licenseMock.getCurrentLicense,
    licenseCookieOptions: vi.fn(),
  };
}

export function grantLicense(): void {
  licenseMock.requireLicense.mockResolvedValue(testLicense);
  licenseMock.getCurrentLicense.mockResolvedValue(testLicense);
}

export function denyLicense(): void {
  licenseMock.requireLicense.mockRejectedValue(new UnauthorizedError());
  licenseMock.getCurrentLicense.mockResolvedValue(null);
}

/** A Web Request cast to NextRequest: the handlers only use `.json()` and `.url`. A string body is sent raw. */
export function jsonRequest(path: string, method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init) as unknown as NextRequest;
}

/** Route context with the params Promise Next 16 passes. */
export function ctx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

export async function readBody<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
