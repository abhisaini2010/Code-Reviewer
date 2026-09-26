import { Request, Response, NextFunction } from "express";

import {
  FixRequest,
  ReviewLanguage,
} from "../types/review";

import { fixCode } from "../services/fixService";

const supportedLanguages: ReviewLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
];

const supportedActions: FixRequest["action"][] = [
  "fix",
  "optimize",
  "refactor",
  "alternative",
];

export const fix = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      code,
      language,
      issue,
      action,
    } = req.body as Partial<FixRequest>;

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
          message:
            "The selected programming language is not supported.",
        },
      });

      return;
    }

    if (!issue || typeof issue !== "object") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ISSUE",
          message:
            "A review issue must be provided.",
        },
      });

      return;
    }

    if (
      typeof issue.title !== "string" ||
      typeof issue.description !== "string" ||
      typeof issue.severity !== "string" ||
      !["low", "medium", "high", "critical"].includes(
        issue.severity
      ) ||
      (issue.line !== null &&
        typeof issue.line !== "number") ||
      (issue.suggestion !== null &&
        typeof issue.suggestion !== "string")
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ISSUE",
          message:
            "The provided review issue has an invalid format.",
        },
      });

      return;
    }

    if (typeof action !== "string") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ACTION",
          message:
            "A fix action must be provided.",
        },
      });

      return;
    }

    if (
      !supportedActions.includes(
        action as FixRequest["action"]
      )
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "UNSUPPORTED_ACTION",
          message:
            "The requested fix action is not supported.",
        },
      });

      return;
    }

    const fixRequest: FixRequest = {
      code,
      language: language as ReviewLanguage,
      issue: {
        title: issue.title,
        description: issue.description,
        severity:
          issue.severity as
            | "low"
            | "medium"
            | "high"
            | "critical",
        line: issue.line ?? null,
        suggestion: issue.suggestion ?? null,
      },
      action: action as FixRequest["action"],
    };

    const fixResult = await fixCode(fixRequest);

    res.status(200).json({
      success: true,
      message: "AI code fix generated successfully.",
      fix: fixResult,
    });
  } catch (error) {
    next(error);
  }
};