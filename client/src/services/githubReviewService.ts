import { API_BASE_URL } from "./api";
export interface GitHubRepositoryReviewResponse {
  success: boolean;
  message: string;

  review: {
    repository: {
      indexId: string;
      name: string;
      fullName: string;
      branch: string;
      totalEntries: number;
      sourceFileCount: number;
      completedFileCount: number;
      failedFileCount: number;
    };

    repositoryHealth: {
      codeQuality: {
        score: number;
        summary: string;
      };

      security: {
        score: number;
        summary: string;
      };

      performance: {
        score: number;
        summary: string;
      };

      architecture: {
        score: number;
        summary: string;
      };

      maintainability: {
        score: number;
        summary: string;
      };

      overall: number;
    };

    issues: Array<{
      category:
        | "codeQuality"
        | "security"
        | "performance"
        | "architecture"
        | "maintainability"
        | "dependency";

      severity:
        | "low"
        | "medium"
        | "high"
        | "critical";

      title: string;
      description: string;
      files: string[];
      recommendation: string;
    }>;

    overview: string;

    analyzedFiles: string[];

    limitations: string[];

    statistics: {
      totalFiles: number;
      totalLines: number;
      totalFunctions: number;
      totalClasses: number;
      totalImports: number;
      totalExports: number;
      totalDependencies: number;
      relationshipCount: number;
    };
  };
}

export const reviewGitHubRepository = async (
  indexId: string
): Promise<GitHubRepositoryReviewResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/github/repositories/index/${encodeURIComponent(
      indexId
    )}/review`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Unable to complete the repository-wide AI review."
    );
  }

  return data as GitHubRepositoryReviewResponse;
};