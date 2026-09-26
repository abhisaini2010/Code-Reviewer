import {
  Request,
  Response,
  NextFunction,
} from "express";
import { ZodType } from "zod";

import { AppError } from "../errors/AppError";

export const validateBody = (
  schema: ZodType
) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path =
            issue.path.length > 0
              ? issue.path.join(".")
              : "body";

          return `${path}: ${issue.message}`;
        })
        .join("; ");

      next(
        new AppError(
          `Invalid request body. ${message}`,
          400,
          "VALIDATION_ERROR"
        )
      );

      return;
    }

    req.body = result.data;
    next();
  };
};

export const validateParams = (
  schema: ZodType
) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse(
      req.params
    );

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path =
            issue.path.length > 0
              ? issue.path.join(".")
              : "params";

          return `${path}: ${issue.message}`;
        })
        .join("; ");

      next(
        new AppError(
          `Invalid request parameters. ${message}`,
          400,
          "VALIDATION_ERROR"
        )
      );

      return;
    }

    next();
  };
};

export const validateQuery = (
  schema: ZodType
) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse(
      req.query
    );

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path =
            issue.path.length > 0
              ? issue.path.join(".")
              : "query";

          return `${path}: ${issue.message}`;
        })
        .join("; ");

      next(
        new AppError(
          `Invalid query parameters. ${message}`,
          400,
          "VALIDATION_ERROR"
        )
      );

      return;
    }

    next();
  };
};