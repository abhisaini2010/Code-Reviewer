import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type { ZodType } from "zod";

export const validateBody = (
  schema: ZodType
) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Invalid request body.",
        code: "VALIDATION_ERROR",
        errors: result.error.issues.map(
          (issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })
        ),
      });

      return;
    }

    req.body = result.data;
    next();
  };
};