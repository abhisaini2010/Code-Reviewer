type ReviewLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp";

type ReviewSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

interface ReviewIssue {
  title: string;
  description: string;
  severity: ReviewSeverity;
  line: number | null;
  suggestion: string | null;
}

type FixAction =
  | "fix"
  | "optimize"
  | "refactor"
  | "alternative";

interface CodeFixResult {
  fixedCode: string;
  explanation: string;
}

interface FixResponse {
  success: boolean;
  message: string;
  fix: CodeFixResult;
}

export const fixCode = async (
  code: string,
  language: ReviewLanguage,
  issue: ReviewIssue,
  action: FixAction
): Promise<FixResponse> => {
  const response = await fetch(
    "http://localhost:5000/api/v1/reviews/fix",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        language,
        issue,
        action,
      }),
    }
  );

  const data = (await response.json()) as
    | FixResponse
    | {
        success: false;
        error?: {
          message?: string;
        };
      };

  if (!response.ok || !data.success) {
    const message =
      "error" in data && data.error?.message
        ? data.error.message
        : "Unable to generate an AI code fix.";

    throw new Error(message);
  }

  return data;
};