export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR"
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}