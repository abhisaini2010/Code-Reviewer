export interface GitHubEmbeddingSearchResult {
  id: string;
  repositoryFileId: string;
  path: string;
  chunkIndex: number;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}

export interface GitHubEmbeddingSearchResponse {
  success: boolean;
  message: string;
  query: string;
  results: GitHubEmbeddingSearchResult[];
}

export const searchGitHubRepositoryEmbeddings = async (
  indexId: string,
  query: string,
  limit = 5
): Promise<GitHubEmbeddingSearchResponse> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}/embeddings/search`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || "Unable to search repository embeddings."
    );
  }

  return data as GitHubEmbeddingSearchResponse;
};