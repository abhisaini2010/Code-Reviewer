import { API_BASE_URL } from "./api";

export type ReviewLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp";

export interface ReviewIssue {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  line: number | null;
  suggestion: string | null;
}

export interface ComplexityAnalysis {
  time: string;
  space: string;
  explanation: string;
}

export interface CodeReviewResult {
  overallScore: number;
  bugs: ReviewIssue[];
  security: ReviewIssue[];
  performance: ReviewIssue[];
  codeQuality: ReviewIssue[];
  complexity: ComplexityAnalysis;
}

export interface ReviewResponse {
  success: boolean;
  message: string;
  review: CodeReviewResult;
}

export const reviewCode = async (
  code: string,
  language: ReviewLanguage
): Promise<ReviewResponse> => {
  const response = await fetch(`${API_BASE_URL}/reviews`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    credentials: "include",

    body: JSON.stringify({
      code,
      language,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Unable to complete the code review."
    );
  }

  return data as ReviewResponse;
};