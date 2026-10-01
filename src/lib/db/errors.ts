/*
 * Error classes thrown by the data layer (builder B). They carry no
 * dependencies so any module can import them without a cycle.
 * `withLicense` in src/app/api/_lib/with-license.ts maps them to JSON responses:
 * InvalidInputError -> 400, NotFoundError -> 404.
 */

/** A caller-supplied value is unusable (empty domain, blank API key, ...). */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/** The row does not exist for this license (never reveals whether it exists for another). */
export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
