// Thrown from route handlers; the error middleware turns it into { error } JSON.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
