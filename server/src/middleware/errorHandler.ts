import {
  Request,
  Response,
  NextFunction,
} from "express";

import { AppError } from "../errors/AppError";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Known application error
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });

    return;
  }

  // Unexpected error
  console.error("Unhandled error:", error);

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};