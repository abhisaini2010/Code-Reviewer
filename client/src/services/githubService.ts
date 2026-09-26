export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  language: string | null;
  updatedAt: string | null;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commitSha: string | null;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: string;
  size: number | null;
  sha: string;
  url: string | null;
}

export interface GitHubRepositoryTree {
  branch: string;
  truncated: boolean;
  entries: GitHubTreeEntry[];
  sourceFiles: GitHubTreeEntry[];
}

interface GitHubRepositoriesResponse {
  success: true;
  message: string;
  repositories: GitHubRepository[];
}

interface GitHubBranchesResponse {
  success: true;
  message: string;
  branches: GitHubBranch[];
}

interface GitHubRepositoryTreeResponse {
  success: true;
  message: string;
  tree: GitHubRepositoryTree;
}

interface GitHubErrorResponse {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface RepositoryIndexResult {
  indexId: string;
  status: string;
  tree: GitHubRepositoryTree;
}

interface RepositoryIndexResponse {
  success: true;
  message: string;
  indexId: string;
  status: string;
  tree: GitHubRepositoryTree;
}

export interface GitHubRepositoryIndexStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";

  repositoryName: string;
  repositoryFullName: string;
  branch: string;

  totalEntries: number;
  sourceFileCount: number;
  skippedFileCount: number;

  processedFileCount: number;
  completedFileCount: number;
  failedFileCount: number;

  treeTruncated: boolean;

  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

interface GitHubRepositoryIndexStatusResponse {
  success: true;
  message: string;
  index: GitHubRepositoryIndexStatus;
}

export interface GitHubRepositoryIndexFile {
  _id: string;
  path: string;
  sha: string;
  size: number;
  extension: string;
  language: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  parsedData: {
    totalLines: number;
    nonEmptyLines: number;
    commentLines: number;
    importCount: number;
    exportCount: number;
    functionCount: number;
    classCount: number;
    imports: string[];
    exports: string[];
    functions: string[];
    classes: string[];
  } | null;
  parsedAt: string | null;
}

export interface GitHubRepositoryIndexFileDetail
  extends GitHubRepositoryIndexFile {
  content: string;
}

interface GitHubRepositoryIndexFilesResponse {
  success: true;
  message: string;
  files: GitHubRepositoryIndexFile[];
}

interface GitHubRepositoryIndexFileResponse {
  success: true;
  message: string;
  file: GitHubRepositoryIndexFileDetail;
}

const getErrorMessage = (
  data: GitHubErrorResponse
): string => {
  return data.error?.message
    ? data.error.message
    : "Unable to complete the GitHub request.";
};

export const getGitHubRepositories =
  async (): Promise<GitHubRepository[]> => {
    const response = await fetch(
      "http://localhost:5000/api/v1/github/repositories",
      {
        method: "GET",
        credentials: "include",
      }
    );

    const data = (await response.json()) as
      | GitHubRepositoriesResponse
      | GitHubErrorResponse;

    if (!response.ok || !data.success) {
      throw new Error(
        getErrorMessage(data as GitHubErrorResponse)
      );
    }

    return data.repositories;
  };

export const getGitHubBranches = async (
  owner: string,
  repository: string
): Promise<GitHubBranch[]> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(repository)}/branches`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubBranchesResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      getErrorMessage(data as GitHubErrorResponse)
    );
  }

  return data.branches;
};

export const getGitHubConnectUrl = (): string => {
  return "http://localhost:5000/api/v1/github/connect";
};


export const getGitHubRepositoryTree = async (
  owner: string,
  repository: string,
  branch: string
): Promise<GitHubRepositoryTree> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repository
    )}/tree?branch=${encodeURIComponent(branch)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubRepositoryTreeResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      getErrorMessage(data as GitHubErrorResponse)
    );
  }

  return data.tree;
};

export const startGitHubRepositoryIndex = async (
  owner: string,
  repository: string,
  githubRepositoryId: number,
  branch: string
): Promise<RepositoryIndexResult> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(repository)}/index`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        githubRepositoryId,
        branch,
      }),
    }
  );

  const data = (await response.json()) as
    | RepositoryIndexResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    const message =
      "error" in data && data.error?.message
        ? data.error.message
        : "Unable to index GitHub repository.";

    throw new Error(message);
  }

  return {
    indexId: data.indexId,
    status: data.status,
    tree: data.tree,
  };
};

export const getGitHubRepositoryIndexStatus = async (
  indexId: string
): Promise<GitHubRepositoryIndexStatus> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubRepositoryIndexStatusResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    const message =
      "error" in data && data.error?.message
        ? data.error.message
        : "Unable to retrieve repository indexing status.";

    throw new Error(message);
  }

  return data.index;
};
export const getGitHubRepositoryIndexFiles = async (
  indexId: string
): Promise<GitHubRepositoryIndexFile[]> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}/files`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubRepositoryIndexFilesResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      getErrorMessage(data as GitHubErrorResponse)
    );
  }

  return data.files;
};
export const getGitHubRepositoryIndexFile = async (
  indexId: string,
  fileId: string
): Promise<GitHubRepositoryIndexFileDetail> => {
  const response = await fetch(
    `http://localhost:5000/api/v1/github/repositories/index/${encodeURIComponent(
      indexId
    )}/files/${encodeURIComponent(fileId)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = (await response.json()) as
    | GitHubRepositoryIndexFileResponse
    | GitHubErrorResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      getErrorMessage(data as GitHubErrorResponse)
    );
  }

  return data.file;
};