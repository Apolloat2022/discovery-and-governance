/** Error carrying the HTTP status and machine code the API contract specifies. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string): ApiError => new ApiError(400, "BAD_REQUEST", message);
export const unauthorized = (message = "Authentication required"): ApiError =>
  new ApiError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this resource"): ApiError =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found"): ApiError => new ApiError(404, "NOT_FOUND", message);
