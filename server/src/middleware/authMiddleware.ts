import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { AppError } from "../errors/AppError";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const payload = verifyAccessToken(token);

   if (
  typeof payload.userId !== "string" ||
  payload.userId.trim().length === 0
) {
  throw new AppError(
    "Invalid authentication token.",
    401,
    "INVALID_TOKEN"
  );
}

    req.userId = payload.userId;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(
      new AppError(
        "Invalid or expired authentication token.",
        401,
        "INVALID_TOKEN"
      )
    );
  }
};