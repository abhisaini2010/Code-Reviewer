export type ReviewLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp";

export interface ReviewRequest {
  code: string;
  language: ReviewLanguage;
}

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
export type FixAction =
  | "fix"
  | "optimize"
  | "refactor"
  | "alternative";

export interface FixRequest {
  code: string;
  language: ReviewLanguage;
  issue: ReviewIssue;
  action: FixAction;
}

export interface CodeFixResult {
  fixedCode: string;
  explanation: string;
}

export interface FixResponse {
  success: boolean;
  message: string;
  fix: CodeFixResult;
}