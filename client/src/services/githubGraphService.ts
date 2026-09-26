export interface GitHubRepositoryIndexGraphNode {
  id: string;
  path: string;
  language: string | null;
  extension: string;
  status: "pending" | "processing" | "completed" | "failed";
}

export interface GitHubRepositoryIndexGraphEdge {
  id: string;
  source: string;
  target: string;
  sourcePath: string;
  targetPath: string;
  dependency: string;
  relationshipType: string;
  sourceRole: string;
  targetRole: string;
}

export interface GitHubRepositoryIndexGraph {
  nodes: GitHubRepositoryIndexGraphNode[];
  edges: GitHubRepositoryIndexGraphEdge[];
}

interface GitHubRepositoryIndexGraphResponse {
  success: true;
  message: string;
  graph: GitHubRepositoryIndexGraph;
}

interface GitHubErrorResponse {
  success: false;
  message?: string;
  error?: {
    message?: string;
  };
}

const getErrorMessage = (data: GitHubErrorResponse): string => {
  return (
    data.message ||
    data.error?.message ||
    "Unable to retrieve the repository dependency graph."
  );
};

export const getGitHubRepositoryIndexGraph = async (
  indexId: string
): Promise<GitHubRepositoryIndexGraph> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}/graph`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubRepositoryIndexGraphResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    throw new Error(getErrorMessage(data as GitHubErrorResponse));
  }

  return data.graph;
};
