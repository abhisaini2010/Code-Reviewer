export interface GitHubRepositoryChatResponse {
  success: boolean;
  message: string;
  chat: {
    question: string;
    answer: string;
    sources: string[];
  };
}

export const chatWithGitHubRepository = async (
  indexId: string,
  query: string
): Promise<GitHubRepositoryChatResponse> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}/chat`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Unable to get an answer from the repository AI."
    );
  }

  return data as GitHubRepositoryChatResponse;
};