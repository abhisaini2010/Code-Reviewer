import crypto from "crypto";
import { AppError } from "../errors/AppError";
import jwt from "jsonwebtoken";

const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not defined in the environment variables.`);
  }

  return value;
};

const getJwtSecret = (): string => {
  return getRequiredEnv("JWT_SECRET");
};

interface GitHubOAuthStatePayload {
  userId: string;
  nonce: string;
}

export interface GitHubOAuthData {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  authorizationUrl: string;
}

export interface GitHubTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string;
}

interface GitHubAccessTokenApiResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

interface GitHubUserApiResponse {
  id?: number;
  login?: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface GitHubUser {
  id: number;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

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

interface GitHubRepositoryApiResponse {
  id?: number;
  name?: string;
  full_name?: string;
  owner?: {
    login?: string;
  };
  description?: string | null;
  private?: boolean;
  default_branch?: string;
  html_url?: string;
  language?: string | null;
  updated_at?: string | null;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commitSha: string | null;
}

interface GitHubBranchApiResponse {
  name?: string;
  protected?: boolean;
  commit?: {
    sha?: string;
  };
}

export interface GitHubFileContent {
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
}

export const createGitHubOAuthData = (
  userId: string
): GitHubOAuthData => {
  const nonce = crypto.randomBytes(32).toString("hex");

  const state = jwt.sign(
    {
      userId,
      nonce,
    } satisfies GitHubOAuthStatePayload,
    getJwtSecret(),
    {
      expiresIn: "10m",
    }
  );

  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const clientId = getRequiredEnv("GITHUB_CLIENT_ID");
  const callbackUrl = getRequiredEnv("GITHUB_CALLBACK_URL");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "repo read:user offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authorizationUrl =
    `${GITHUB_OAUTH_URL}?${params.toString()}`;

  return {
    state,
    codeVerifier,
    codeChallenge,
    authorizationUrl,
  };
};

export const verifyGitHubOAuthState = (
  state: string
): GitHubOAuthStatePayload => {
  try {
    return jwt.verify(
      state,
      getJwtSecret()
    ) as GitHubOAuthStatePayload;
  } catch {
    throw new AppError(
      "GitHub authentication session expired or is invalid.",
      400,
      "GITHUB_OAUTH_STATE_INVALID"
    );
  }
};

export const exchangeGitHubCode = async (
  code: string,
  codeVerifier: string
): Promise<GitHubTokenResponse> => {
  const clientId = getRequiredEnv("GITHUB_CLIENT_ID");
  const clientSecret = getRequiredEnv("GITHUB_CLIENT_SECRET");
  const callbackUrl = getRequiredEnv("GITHUB_CALLBACK_URL");

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "AI-Code-Reviewer",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new AppError(
      "GitHub token exchange failed.",
      502,
      "GITHUB_TOKEN_EXCHANGE_FAILED"
    );
  }

  const data =
    (await response.json()) as GitHubAccessTokenApiResponse;

  if (!data.access_token) {
    throw new AppError(
      "GitHub did not return an access token.",
      502,
      "GITHUB_ACCESS_TOKEN_MISSING"
    );
  }

  const accessTokenExpiresAt =
    typeof data.expires_in === "number"
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

  const refreshTokenExpiresAt =
    typeof data.refresh_token_expires_in === "number"
      ? new Date(
          Date.now() +
            data.refresh_token_expires_in * 1000
        )
      : null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    scope: data.scope ?? "",
  };
};

export const getGitHubUser = async (
  accessToken: string
): Promise<GitHubUser> => {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-Code-Reviewer",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new AppError(
        "GitHub authentication failed.",
        401,
        "GITHUB_USER_UNAUTHORIZED"
      );
    }

    throw new AppError(
      "Unable to retrieve your GitHub profile.",
      502,
      "GITHUB_USER_REQUEST_FAILED"
    );
  }

  const data =
    (await response.json()) as GitHubUserApiResponse;

  if (
    typeof data.id !== "number" ||
    typeof data.login !== "string"
  ) {
    throw new AppError(
      "GitHub returned an invalid user response.",
      502,
      "GITHUB_USER_INVALID_RESPONSE"
    );
  }

  return {
    id: data.id,
    username: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? null,
  };
};

export const getGitHubRepositories = async (
  accessToken: string
): Promise<GitHubRepository[]> => {
  const repositories: GitHubRepository[] = [];
  const perPage = 100;

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      visibility: "all",
      affiliation:
        "owner,collaborator,organization_member",
      sort: "updated",
      direction: "desc",
      per_page: String(perPage),
      page: String(page),
    });

    const response = await fetch(
      `${GITHUB_API_URL}/user/repos?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AI-Code-Reviewer",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new AppError(
          "Your GitHub connection is no longer valid. Please reconnect GitHub.",
          401,
          "GITHUB_TOKEN_INVALID"
        );
      }

      if (response.status === 403) {
        throw new AppError(
          "GitHub denied access to your repositories.",
          403,
          "GITHUB_REPOSITORY_ACCESS_DENIED"
        );
      }

      throw new AppError(
        "Unable to retrieve GitHub repositories.",
        502,
        "GITHUB_REPOSITORIES_REQUEST_FAILED"
      );
    }

    const data =
      (await response.json()) as GitHubRepositoryApiResponse[];

    if (!Array.isArray(data)) {
      throw new AppError(
        "GitHub returned an invalid repository response.",
        502,
        "GITHUB_REPOSITORIES_INVALID_RESPONSE"
      );
    }

    for (const repository of data) {
      if (
        typeof repository.id !== "number" ||
        typeof repository.name !== "string" ||
        typeof repository.full_name !== "string" ||
        typeof repository.owner?.login !== "string" ||
        typeof repository.default_branch !== "string" ||
        typeof repository.html_url !== "string"
      ) {
        continue;
      }

      repositories.push({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        owner: repository.owner.login,
        description: repository.description ?? null,
        private: repository.private === true,
        defaultBranch: repository.default_branch,
        htmlUrl: repository.html_url,
        language: repository.language ?? null,
        updatedAt: repository.updated_at ?? null,
      });
    }

    if (data.length < perPage) {
      break;
    }
  }

  return repositories;
};

export const getGitHubBranches = async (
  accessToken: string,
  owner: string,
  repository: string
): Promise<GitHubBranch[]> => {
  const branches: GitHubBranch[] = [];
  const perPage = 100;

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });

    const response = await fetch(
      `${GITHUB_API_URL}/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repository
      )}/branches?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AI-Code-Reviewer",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new AppError(
          "Your GitHub connection is no longer valid. Please reconnect GitHub.",
          401,
          "GITHUB_TOKEN_INVALID"
        );
      }

      if (response.status === 403) {
        throw new AppError(
          "GitHub denied access to this repository.",
          403,
          "GITHUB_BRANCH_ACCESS_DENIED"
        );
      }

      if (response.status === 404) {
        throw new AppError(
          "The selected GitHub repository could not be found.",
          404,
          "GITHUB_REPOSITORY_NOT_FOUND"
        );
      }

      throw new AppError(
        "Unable to retrieve GitHub branches.",
        502,
        "GITHUB_BRANCHES_REQUEST_FAILED"
      );
    }

    const data =
      (await response.json()) as GitHubBranchApiResponse[];

    if (!Array.isArray(data)) {
      throw new AppError(
        "GitHub returned an invalid branch response.",
        502,
        "GITHUB_BRANCHES_INVALID_RESPONSE"
      );
    }

    for (const branch of data) {
      if (typeof branch.name !== "string") {
        continue;
      }

      branches.push({
        name: branch.name,
        protected: branch.protected === true,
        commitSha:
          typeof branch.commit?.sha === "string"
            ? branch.commit.sha
            : null,
      });
    }

    if (data.length < perPage) {
      break;
    }
  }

  return branches;
};

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | string;
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

interface GitHubTreeApiResponse {
  sha?: string;
  truncated?: boolean;
  tree?: Array<{
    path?: string;
    mode?: string;
    type?: string;
    size?: number;
    sha?: string;
    url?: string;
  }>;
}

const SOURCE_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".swift",
  ".kt",
  ".kts",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".r",
  ".dart",
  ".vue",
  ".svelte",
    ".html",
  ".css"
]);

const isSourceFile = (path: string): boolean => {
  const normalizedPath = path.toLowerCase();
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return false;
  }

  return SOURCE_FILE_EXTENSIONS.has(
    fileName.slice(dotIndex)
  );
};

export const getGitHubRepositoryTree = async (
  accessToken: string,
  owner: string,
  repository: string,
  branch: string
): Promise<GitHubRepositoryTree> => {
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repository
    )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Code-Reviewer",
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new AppError(
        "Your GitHub connection is no longer valid. Please reconnect GitHub.",
        401,
        "GITHUB_TOKEN_INVALID"
      );
    }

    if (response.status === 403) {
      throw new AppError(
        "GitHub denied access to this repository.",
        403,
        "GITHUB_TREE_ACCESS_DENIED"
      );
    }

    if (response.status === 404) {
      throw new AppError(
        "The selected repository or branch could not be found.",
        404,
        "GITHUB_TREE_NOT_FOUND"
      );
    }

    if (response.status === 409) {
      throw new AppError(
        "GitHub cannot retrieve the tree because the repository is empty or temporarily unavailable.",
        409,
        "GITHUB_TREE_CONFLICT"
      );
    }

    if (response.status === 422) {
      throw new AppError(
        "GitHub rejected the repository tree request.",
        422,
        "GITHUB_TREE_INVALID_REQUEST"
      );
    }

    throw new AppError(
      "Unable to retrieve the GitHub repository tree.",
      502,
      "GITHUB_TREE_REQUEST_FAILED"
    );
  }

  const data =
    (await response.json()) as GitHubTreeApiResponse;

  if (!Array.isArray(data.tree)) {
    throw new AppError(
      "GitHub returned an invalid repository tree response.",
      502,
      "GITHUB_TREE_INVALID_RESPONSE"
    );
  }

  const entries: GitHubTreeEntry[] = [];

  for (const entry of data.tree) {
    if (
      typeof entry.path !== "string" ||
      typeof entry.mode !== "string" ||
      typeof entry.type !== "string" ||
      typeof entry.sha !== "string"
    ) {
      continue;
    }

    entries.push({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      size:
        typeof entry.size === "number"
          ? entry.size
          : null,
      sha: entry.sha,
      url:
        typeof entry.url === "string"
          ? entry.url
          : null,
    });
  }

  const sourceFiles = entries.filter(
    (entry) => entry.type === "blob" && isSourceFile(entry.path)
  );

  return {
    branch,
    truncated: data.truncated === true,
    entries,
    sourceFiles,
  };
};

export const getGitHubFileContent = async (
  accessToken: string,
  owner: string,
  repository: string,
  path: string,
  sha: string
): Promise<GitHubFileContent> => {
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repository
    )}/git/blobs/${encodeURIComponent(sha)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Code-Reviewer",
      },
    }
  );

  if (response.status === 401) {
    throw new Error(
      "GitHub authentication is invalid or expired."
    );
  }

  if (response.status === 403) {
    throw new Error(
      "GitHub denied access to this file."
    );
  }

  if (response.status === 404) {
    throw new Error(
      `GitHub blob not found for file: ${path}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `GitHub blob request failed with status ${response.status} for ${path}.`
    );
  }

  const data = (await response.json()) as {
    sha?: string;
    size?: number;
    content?: string;
    encoding?: string;
  };

  if (
    typeof data.sha !== "string" ||
    typeof data.size !== "number" ||
    typeof data.content !== "string" ||
    data.encoding !== "base64"
  ) {
    throw new Error(
      `Invalid GitHub blob response for file: ${path}`
    );
  }

  const content = Buffer.from(
    data.content.replace(/\n/g, ""),
    "base64"
  ).toString("utf-8");

  return {
    path,
    sha: data.sha,
    size: data.size,
    content,
    encoding: "base64",
  };
};