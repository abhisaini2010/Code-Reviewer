import { API_BASE_URL } from "./api";

export interface GitHubRepositoryTestGenerationResponse {
  success: boolean;
  message: string;
  tests: {
    filePath: string;
    language: string | null;
    testFramework: string;
    testFileName: string;
    testCode: string;
    explanation: string;
    testCases: Array<{
      name: string;
      purpose: string;
    }>;
    limitations: string[];
  };
}

export const generateGitHubRepositoryTests = async (
  indexId: string,
  fileId: string
): Promise<GitHubRepositoryTestGenerationResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/github/repositories/index/${encodeURIComponent(
      indexId
    )}/files/${encodeURIComponent(fileId)}/tests`,
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
        "Unable to generate tests for the selected file."
    );
  }

  return data as GitHubRepositoryTestGenerationResponse;
};
