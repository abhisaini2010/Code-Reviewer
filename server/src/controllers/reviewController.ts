import { Request, Response, NextFunction } from "express";
import {
  ReviewLanguage,
  ReviewRequest,
} from "../types/review";
import { reviewCode } from "../services/reviewService";

const supportedLanguages: ReviewLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
];

export const review = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, language } = req.body as Partial<ReviewRequest>;

    if (typeof code !== "string") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CODE",
          message: "Code must be provided as a string.",
        },
      });

      return;
    }

    if (!code.trim()) {
      res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_CODE",
          message: "Code cannot be empty.",
        },
      });

      return;
    }

    if (typeof language !== "string") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_LANGUAGE",
          message: "Programming language must be provided.",
        },
      });

      return;
    }

    if (
      !supportedLanguages.includes(
        language as ReviewLanguage
      )
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "UNSUPPORTED_LANGUAGE",
          message: "The selected programming language is not supported.",
        },
      });

      return;
    }

    const reviewRequest: ReviewRequest = {
      code,
      language: language as ReviewLanguage,
    };

    const reviewResult = await reviewCode(reviewRequest);

    res.status(200).json({
      success: true,
      message: "Code review completed successfully.",
      review: reviewResult,
    });
  } catch (error) {
    next(error);
  }
};