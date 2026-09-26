import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  History,
  Lightbulb,
  LogOut,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Lock,
  Search,
  Zap,
} from "lucide-react";

import CodeEditor from "../components/CodeEditor";
import { useAuth } from "../context/AuthContext";

import {
  reviewCode,
  type CodeReviewResult,
  type ReviewLanguage,
} from "../services/reviewApi";
import {
  searchGitHubRepositoryEmbeddings,
  type GitHubEmbeddingSearchResult,
} from "../services/githubEmbeddingService";
import { fixCode } from "../services/fixService";
import {
  getGitHubConnectUrl,
  getGitHubRepositories,
  getGitHubBranches,
  getGitHubRepositoryTree,
  startGitHubRepositoryIndex,
  getGitHubRepositoryIndexStatus,
  getGitHubRepositoryIndexFiles,
  getGitHubRepositoryIndexFile,
  type GitHubRepository,
  type GitHubBranch,
  type GitHubRepositoryTree,
  type GitHubRepositoryIndexStatus,
  type GitHubRepositoryIndexFile,
  type GitHubRepositoryIndexFileDetail,
} from "../services/githubService";
import {
  getGitHubRepositoryIndexGraph,
  type GitHubRepositoryIndexGraph,
} from "../services/githubGraphService";

import {
  chatWithGitHubRepository,
  type GitHubRepositoryChatResponse,
} from "../services/githubChatService";
import {
  reviewGitHubRepository,
  type GitHubRepositoryReviewResponse,
} from "../services/githubReviewService";
import {
  generateGitHubRepositoryTests,
  type GitHubRepositoryTestGenerationResponse,
} from "../services/githubTestService";


const languages: {
  label: string;
  value: ReviewLanguage;
}[] = [
  {
    label: "JavaScript",
    value: "javascript",
  },
  {
    label: "TypeScript",
    value: "typescript",
  },
  {
    label: "Python",
    value: "python",
  },
  {
    label: "Java",
    value: "java",
  },
  {
    label: "C++",
    value: "cpp",
  },
];

const defaultCode = `function calculateTotal(items) {
  let total = 0;

  for (const item of items) {
    total += item.price;
  }

  return total;
}`;

interface ReviewHistoryItem {
  id: string;
  createdAt: string;
  code: string;
  language: ReviewLanguage;
  review: CodeReviewResult;
}

const REVIEW_HISTORY_KEY = "ai-code-reviewer-history";

type FixAction =
  | "fix"
  | "optimize"
  | "refactor"
  | "alternative";

/*
 * Code comparison
 *
 * The diff is calculated using a simple LCS-based
 * line comparison so inserted/deleted/replaced lines
 * are highlighted without marking every following line
 * as changed.
 */

interface DiffLine {
  text: string;
  changed: boolean;
}

const getCodeDiff = (
  originalCode: string,
  fixedCode: string
): {
  before: DiffLine[];
  after: DiffLine[];
} => {
  const beforeLines = originalCode.split("\n");
  const afterLines = fixedCode.split("\n");

  const rows = beforeLines.length + 1;
  const columns = afterLines.length + 1;

  const lcs: number[][] = Array.from(
    { length: rows },
    () => Array(columns).fill(0)
  );

  for (
    let beforeIndex = beforeLines.length - 1;
    beforeIndex >= 0;
    beforeIndex--
  ) {
    for (
      let afterIndex = afterLines.length - 1;
      afterIndex >= 0;
      afterIndex--
    ) {
      if (
        beforeLines[beforeIndex] ===
        afterLines[afterIndex]
      ) {
        lcs[beforeIndex][afterIndex] =
          1 + lcs[beforeIndex + 1][afterIndex + 1];
      } else {
        lcs[beforeIndex][afterIndex] = Math.max(
          lcs[beforeIndex + 1][afterIndex],
          lcs[beforeIndex][afterIndex + 1]
        );
      }
    }
  }

  const before: DiffLine[] = [];
  const after: DiffLine[] = [];

  let beforeIndex = 0;
  let afterIndex = 0;

  while (
    beforeIndex < beforeLines.length &&
    afterIndex < afterLines.length
  ) {
    if (
      beforeLines[beforeIndex] ===
      afterLines[afterIndex]
    ) {
      before.push({
        text: beforeLines[beforeIndex],
        changed: false,
      });

      after.push({
        text: afterLines[afterIndex],
        changed: false,
      });

      beforeIndex++;
      afterIndex++;
      continue;
    }

    if (
      lcs[beforeIndex + 1][afterIndex] >=
      lcs[beforeIndex][afterIndex + 1]
    ) {
      before.push({
        text: beforeLines[beforeIndex],
        changed: true,
      });

      beforeIndex++;
    } else {
      after.push({
        text: afterLines[afterIndex],
        changed: true,
      });

      afterIndex++;
    }
  }

  while (beforeIndex < beforeLines.length) {
    before.push({
      text: beforeLines[beforeIndex],
      changed: true,
    });

    beforeIndex++;
  }

  while (afterIndex < afterLines.length) {
    after.push({
      text: afterLines[afterIndex],
      changed: true,
    });

    afterIndex++;
  }

  return {
    before,
    after,
  };
};

function WorkspacePage() {
  const [code, setCode] = useState(defaultCode);

  const [language, setLanguage] =
    useState<ReviewLanguage>("javascript");

  const [review, setReview] =
    useState<CodeReviewResult | null>(null);

  const [isReviewing, setIsReviewing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [expandedIssueKey, setExpandedIssueKey] =
    useState<string | null>(null);

  const [highlightLine, setHighlightLine] =
    useState<number | null>(null);

  const [isFixing, setIsFixing] =
    useState(false);

  const [fixResult, setFixResult] = useState<{
    fixedCode: string;
    explanation: string;
  } | null>(null);

  const [fixError, setFixError] =
    useState<string | null>(null);

  const [fixAction, setFixAction] =
    useState<FixAction>("fix");

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [githubRepositories, setGitHubRepositories] =
    useState<GitHubRepository[]>([]);
  const [selectedRepository, setSelectedRepository] =
    useState<GitHubRepository | null>(null);
  const [githubBranches, setGitHubBranches] =
    useState<GitHubBranch[]>([]);
  const [selectedBranch, setSelectedBranch] =
    useState<GitHubBranch | null>(null);
  const [isLoadingGitHubBranches, setIsLoadingGitHubBranches] =
    useState(false);
  const [githubBranchError, setGitHubBranchError] =
    useState<string | null>(null);
  const [githubRepositoryTree, setGitHubRepositoryTree] =
    useState<GitHubRepositoryTree | null>(null);
  const [isLoadingGitHubRepositoryTree, setIsLoadingGitHubRepositoryTree] =
    useState(false);
  const [githubRepositoryTreeError, setGitHubRepositoryTreeError] =
    useState<string | null>(null);
  const [isIndexingGitHubRepository, setIsIndexingGitHubRepository] =
    useState(false);
  const [githubRepositoryIndexStatus, setGitHubRepositoryIndexStatus] =
    useState<string | null>(null);
  const [githubRepositoryIndexError, setGitHubRepositoryIndexError] =
    useState<string | null>(null);
  const [githubRepositoryIndexId, setGitHubRepositoryIndexId] =
    useState<string | null>(null);
  const [githubRepositoryIndexProgress, setGitHubRepositoryIndexProgress] =
    useState<GitHubRepositoryIndexStatus | null>(null);
  const [githubRepositoryIndexFiles, setGitHubRepositoryIndexFiles] =
    useState<GitHubRepositoryIndexFile[]>([]);
  const [selectedGitHubRepositoryFileId, setSelectedGitHubRepositoryFileId] =
    useState<string | null>(null);
  const [selectedGitHubRepositoryFile, setSelectedGitHubRepositoryFile] =
    useState<GitHubRepositoryIndexFileDetail | null>(null);
  const [isLoadingGitHubRepositoryFiles, setIsLoadingGitHubRepositoryFiles] =
    useState(false);
  const [isLoadingGitHubRepositoryFile, setIsLoadingGitHubRepositoryFile] =
    useState(false);
  const [githubRepositoryFileError, setGitHubRepositoryFileError] =
    useState<string | null>(null);
  const [githubRepositoryGraph, setGitHubRepositoryGraph] =
    useState<GitHubRepositoryIndexGraph | null>(null);
  const [isLoadingGitHubRepositoryGraph, setIsLoadingGitHubRepositoryGraph] =
    useState(false);
  const [githubRepositoryGraphError, setGitHubRepositoryGraphError] =
    useState<string | null>(null);
  const [selectedGitHubGraphNodeId, setSelectedGitHubGraphNodeId] =
    useState<string | null>(null);
  const [isLoadingGitHubRepositories, setIsLoadingGitHubRepositories] =
    useState(false);
  const [githubError, setGitHubError] =
    useState<string | null>(null);
  const [githubConnected, setGitHubConnected] =
    useState(false);
  const [repositorySearch, setRepositorySearch] =
    useState("");
    const [githubEmbeddingQuery, setGitHubEmbeddingQuery] =
  useState("");

const [githubEmbeddingResults, setGitHubEmbeddingResults] =
  useState<GitHubEmbeddingSearchResult[]>([]);

const [isSearchingGitHubEmbeddings, setIsSearchingGitHubEmbeddings] =
  useState(false);

const [githubEmbeddingSearchError, setGitHubEmbeddingSearchError] =
  useState<string | null>(null);

const [githubChatQuery, setGitHubChatQuery] =
  useState("");

const [githubChatResponse, setGitHubChatResponse] =
  useState<GitHubRepositoryChatResponse["chat"] | null>(
    null
  );

const [isGitHubChatLoading, setIsGitHubChatLoading] =
  useState(false);

const [githubChatError, setGitHubChatError] =
  useState<string | null>(null);

const [githubRepositoryReview, setGitHubRepositoryReview] =
  useState<GitHubRepositoryReviewResponse["review"] | null>(null);

const [isGitHubRepositoryReviewLoading, setIsGitHubRepositoryReviewLoading] =
  useState(false);

const [githubRepositoryReviewError, setGitHubRepositoryReviewError] =
  useState<string | null>(null);

const [githubRepositoryTestGeneration, setGitHubRepositoryTestGeneration] =
  useState<GitHubRepositoryTestGenerationResponse["tests"] | null>(null);

const [
  isGitHubRepositoryTestGenerationLoading,
  setIsGitHubRepositoryTestGenerationLoading,
] = useState(false);

const [
  githubRepositoryTestGenerationError,
  setGitHubRepositoryTestGenerationError,
] = useState<string | null>(null);

  useEffect(() => {
    const githubStatus = new URLSearchParams(
      location.search
    ).get("github");

    if (githubStatus === "connected") {
      setGitHubConnected(true);
      setGitHubError(null);

      navigate("/workspace", {
        replace: true,
      });
    }
  }, [location.search, navigate]);

  const loadGitHubRepositories = useCallback(async () => {
    setIsLoadingGitHubRepositories(true);
    setGitHubError(null);

    try {
      const repositories =
        await getGitHubRepositories();

      setGitHubRepositories(repositories);
      setGitHubConnected(true);
    } catch (error) {
      console.error(
        "GitHub repositories failed:",
        error
      );

      setGitHubConnected(false);
      setGitHubError(
        error instanceof Error
          ? error.message
          : "Unable to load GitHub repositories."
      );
    } finally {
      setIsLoadingGitHubRepositories(false);
    }
  }, []);

  useEffect(() => {
    const githubStatus = new URLSearchParams(
      location.search
    ).get("github");

    if (githubStatus === "connected") {
      void loadGitHubRepositories();
      return;
    }

    void loadGitHubRepositories();
  }, [loadGitHubRepositories]);

  const loadGitHubRepositoryTree = useCallback(
    async (repository: GitHubRepository, branch: string) => {
      setIsLoadingGitHubRepositoryTree(true);
      setGitHubRepositoryTreeError(null);

      try {
        const tree = await getGitHubRepositoryTree(
          repository.owner,
          repository.name,
          branch
        );

        setGitHubRepositoryTree(tree);
      } catch (error) {
        console.error(
          "GitHub repository tree failed:",
          error
        );
        setGitHubRepositoryTree(null);
        setGitHubRepositoryTreeError(
          error instanceof Error
            ? error.message
            : "Unable to load the GitHub repository tree."
        );
      } finally {
        setIsLoadingGitHubRepositoryTree(false);
      }
    },
    []
  );

  const loadGitHubRepositoryIndexFiles = useCallback(
    async (indexId: string) => {
      setIsLoadingGitHubRepositoryFiles(true);
      setGitHubRepositoryFileError(null);
      setGitHubRepositoryIndexFiles([]);
      setSelectedGitHubRepositoryFileId(null);
      setSelectedGitHubRepositoryFile(null);
      setGitHubRepositoryTestGeneration(null);
      setGitHubRepositoryTestGenerationError(null);

      try {
        const files = await getGitHubRepositoryIndexFiles(indexId);
        setGitHubRepositoryIndexFiles(files);
      } catch (error) {
        console.error(
          "GitHub indexed files failed:",
          error
        );
        setGitHubRepositoryFileError(
          error instanceof Error
            ? error.message
            : "Unable to load indexed repository files."
        );
      } finally {
        setIsLoadingGitHubRepositoryFiles(false);
      }
    },
    []
  );

  const loadGitHubRepositoryGraph = useCallback(
    async (indexId: string) => {
      setIsLoadingGitHubRepositoryGraph(true);
      setGitHubRepositoryGraphError(null);
      setGitHubRepositoryGraph(null);
      setSelectedGitHubGraphNodeId(null);

      try {
        const graph = await getGitHubRepositoryIndexGraph(indexId);
        setGitHubRepositoryGraph(graph);
      } catch (error) {
        console.error(
          "GitHub repository graph failed:",
          error
        );
        setGitHubRepositoryGraphError(
          error instanceof Error
            ? error.message
            : "Unable to load the repository dependency graph."
        );
      } finally {
        setIsLoadingGitHubRepositoryGraph(false);
      }
    },
    []
  );

  const loadGitHubRepositoryIndexFile = useCallback(
    async (indexId: string, fileId: string) => {
      setIsLoadingGitHubRepositoryFile(true);
      setGitHubRepositoryFileError(null);
      setSelectedGitHubRepositoryFileId(fileId);

      try {
        const file = await getGitHubRepositoryIndexFile(
          indexId,
          fileId
        );

        setSelectedGitHubRepositoryFile(file);
      } catch (error) {
        console.error(
          "GitHub indexed file failed:",
          error
        );
        setSelectedGitHubRepositoryFile(null);
        setGitHubRepositoryFileError(
          error instanceof Error
            ? error.message
            : "Unable to load the selected repository file."
        );
      } finally {
        setIsLoadingGitHubRepositoryFile(false);
      }
    },
    []
  );

  const handleAnalyzeGitHubRepository = useCallback(async () => {
    if (!selectedRepository || !selectedBranch) {
      return;
    }

    setIsIndexingGitHubRepository(true);
    setGitHubRepositoryIndexError(null);
    setGitHubRepositoryIndexStatus(null);
    setGitHubRepositoryIndexId(null);
    setGitHubRepositoryIndexProgress(null);
    setGitHubRepositoryTestGeneration(null);
    setGitHubRepositoryTestGenerationError(null);
    setGitHubRepositoryIndexFiles([]);
    setGitHubRepositoryGraph(null);

    try {
      const result = await startGitHubRepositoryIndex(
        selectedRepository.owner,
        selectedRepository.name,
        selectedRepository.id,
        selectedBranch.name
      );

      setGitHubRepositoryIndexId(result.indexId);
      setGitHubRepositoryIndexStatus(result.status);
      setGitHubRepositoryTree(result.tree);

      // The index is processed in the background.
      // The polling effect below watches its MongoDB-backed status.
    } catch (error) {
      console.error(
        "GitHub repository indexing failed:",
        error
      );

      setGitHubRepositoryIndexError(
        error instanceof Error
          ? error.message
          : "Unable to analyze the GitHub repository."
      );
      setIsIndexingGitHubRepository(false);
    }
  }, [selectedRepository, selectedBranch]);

  // Poll repository indexing status without creating overlapping
  // intervals or hitting the API too frequently.
  useEffect(() => {
    if (!githubRepositoryIndexId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let consecutiveErrors = 0;

    const scheduleNextPoll = (delay: number) => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void pollStatus();
      }, delay);
    };

    const pollStatus = async () => {
      try {
        const status = await getGitHubRepositoryIndexStatus(
          githubRepositoryIndexId
        );

        if (cancelled) {
          return;
        }

        consecutiveErrors = 0;
        setGitHubRepositoryIndexProgress(status);
        setGitHubRepositoryIndexStatus(status.status);
        setGitHubRepositoryIndexError(null);

        if (status.status === "failed") {
          setGitHubRepositoryIndexError(
            status.errorMessage ||
              "Repository indexing failed."
          );
          setIsIndexingGitHubRepository(false);
          return;
        }

        if (status.status === "completed") {
          setIsIndexingGitHubRepository(false);
          return;
        }

        // Keep the normal polling interval below the API rate limit.
        scheduleNextPoll(8000);
      } catch (error) {
        if (cancelled) {
          return;
        }

        consecutiveErrors += 1;

        const message =
          error instanceof Error
            ? error.message
            : "Unable to retrieve repository indexing progress.";

        const isRateLimited =
          message.includes("429") ||
          message.toLowerCase().includes("too many requests");

        console.error(
          "GitHub repository index status failed:",
          error
        );

        setGitHubRepositoryIndexError(
          isRateLimited
            ? "Repository status checks are temporarily rate-limited. Retrying automatically..."
            : message
        );

        // Back off aggressively after a 429.
        const retryDelay = isRateLimited
          ? Math.min(
              60000,
              20000 * Math.max(1, consecutiveErrors)
            )
          : 10000;

        scheduleNextPoll(retryDelay);
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [githubRepositoryIndexId]);

  // Once repository indexing is completed, load the indexed files
  // and dependency graph from the completed index.
  useEffect(() => {
    if (
      !githubRepositoryIndexId ||
      githubRepositoryIndexStatus !== "completed"
    ) {
      return;
    }

    void Promise.all([
      loadGitHubRepositoryIndexFiles(
        githubRepositoryIndexId
      ),
      loadGitHubRepositoryGraph(
        githubRepositoryIndexId
      ),
    ]);
  }, [
    githubRepositoryIndexId,
    githubRepositoryIndexStatus,
    loadGitHubRepositoryIndexFiles,
    loadGitHubRepositoryGraph,
  ]);

  const loadGitHubBranches = useCallback(
    async (repository: GitHubRepository) => {
      setIsLoadingGitHubBranches(true);
      setGitHubBranchError(null);
      setGitHubBranches([]);
      setSelectedBranch(null);
      setGitHubRepositoryTree(null);
      setGitHubRepositoryTreeError(null);
      setGitHubRepositoryIndexStatus(null);
      setGitHubRepositoryIndexError(null);
      setGitHubRepositoryIndexId(null);
      setGitHubRepositoryIndexProgress(null);

      try {
        const branches = await getGitHubBranches(
          repository.owner,
          repository.name
        );

        setGitHubBranches(branches);

        const defaultBranch = branches.find(
          (branch) => branch.name === repository.defaultBranch
        );

        if (defaultBranch) {
          setSelectedBranch(defaultBranch);
          void loadGitHubRepositoryTree(
            repository,
            defaultBranch.name
          );
        }
      } catch (error) {
        console.error(
          "GitHub branches failed:",
          error
        );
        setGitHubBranchError(
          error instanceof Error
            ? error.message
            : "Unable to load GitHub branches."
        );
      } finally {
        setIsLoadingGitHubBranches(false);
      }
    },
    []
  );

  const filteredGitHubRepositories =
    githubRepositories.filter((repository) => {
      const query =
        repositorySearch.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return (
        repository.name
          .toLowerCase()
          .includes(query) ||
        repository.fullName
          .toLowerCase()
          .includes(query) ||
        repository.description
          ?.toLowerCase()
          .includes(query)
      );
    });

    const handleGitHubEmbeddingSearch = async () => {
  if (!githubRepositoryIndexId) {
    return;
  }

  const query = githubEmbeddingQuery.trim();

  if (!query) {
    setGitHubEmbeddingSearchError(
      "Enter something to search in the repository."
    );
    setGitHubEmbeddingResults([]);
    return;
  }

  setIsSearchingGitHubEmbeddings(true);
  setGitHubEmbeddingSearchError(null);

  try {
    const response =
      await searchGitHubRepositoryEmbeddings(
        githubRepositoryIndexId,
        query,
        5
      );

    setGitHubEmbeddingResults(response.results);
  } catch (error) {
    console.error(
      "Repository semantic search failed:",
      error
    );

    setGitHubEmbeddingSearchError(
      error instanceof Error
        ? error.message
        : "Unable to search the repository."
    );

    setGitHubEmbeddingResults([]);
  } finally {
    setIsSearchingGitHubEmbeddings(false);
  }
};

const handleGitHubRepositoryChat = async () => {
  if (!githubRepositoryIndexId) {
    setGitHubChatError(
      "Analyze the repository before using Repository AI Chat."
    );
    return;
  }

  const query = githubChatQuery.trim();

  if (!query) {
    setGitHubChatError(
      "Enter a question about the repository."
    );
    return;
  }

  setIsGitHubChatLoading(true);
  setGitHubChatError(null);

  try {
    const response =
      await chatWithGitHubRepository(
        githubRepositoryIndexId,
        query
      );

    setGitHubChatResponse(response.chat);
  } catch (error) {
    console.error(
      "Repository AI chat failed:",
      error
    );

    setGitHubChatError(
      error instanceof Error
        ? error.message
        : "Unable to get an answer from Repository AI."
    );
  } finally {
    setIsGitHubChatLoading(false);
  }
};


  const handleGitHubRepositoryReview = async () => {
    if (!githubRepositoryIndexId) {
      setGitHubRepositoryReviewError(
        "Analyze the repository before starting a repository-wide review."
      );
      return;
    }

    setIsGitHubRepositoryReviewLoading(true);
    setGitHubRepositoryReviewError(null);

    try {
      const response = await reviewGitHubRepository(
        githubRepositoryIndexId
      );

      setGitHubRepositoryReview(response.review);
    } catch (error) {
      console.error(
        "Repository-wide AI review failed:",
        error
      );

      setGitHubRepositoryReviewError(
        error instanceof Error
          ? error.message
          : "Unable to complete the repository-wide AI review."
      );
    } finally {
      setIsGitHubRepositoryReviewLoading(false);
    }
  };


  const handleGitHubRepositoryTestGeneration = async () => {
    if (!githubRepositoryIndexId || !selectedGitHubRepositoryFileId) {
      setGitHubRepositoryTestGenerationError(
        "Select an indexed source file before generating tests."
      );
      return;
    }

    setIsGitHubRepositoryTestGenerationLoading(true);
    setGitHubRepositoryTestGenerationError(null);

    try {
      const response = await generateGitHubRepositoryTests(
        githubRepositoryIndexId,
        selectedGitHubRepositoryFileId
      );

      setGitHubRepositoryTestGeneration(response.tests);
    } catch (error) {
      console.error(
        "Repository test generation failed:",
        error
      );

      setGitHubRepositoryTestGenerationError(
        error instanceof Error
          ? error.message
          : "Unable to generate tests for the selected file."
      );
    } finally {
      setIsGitHubRepositoryTestGenerationLoading(false);
    }
  };

  useEffect(() => {
    const historyItem = location.state?.historyItem;

    if (!historyItem) {
      return;
    }

    setCode(historyItem.code);
    setLanguage(historyItem.language);
    setReview(historyItem.review);
    setError(null);
    setExpandedIssueKey(null);
    setHighlightLine(null);
    setFixResult(null);
    setFixError(null);
    setFixAction("fix");

    navigate("/workspace", {
      replace: true,
      state: null,
    });
  }, [location.state, navigate]);

  const handleClear = () => {
    setCode("");
    setReview(null);
    setError(null);
    setExpandedIssueKey(null);
    setHighlightLine(null);
    setFixResult(null);
    setFixError(null);
    setFixAction("fix");
  };

  const handleReset = () => {
    setCode(defaultCode);
    setLanguage("javascript");
    setReview(null);
    setError(null);
    setExpandedIssueKey(null);
    setHighlightLine(null);
    setFixResult(null);
    setFixError(null);
    setFixAction("fix");
  };

  const handleReview = async () => {
    if (!code.trim()) {
      setError(
        "Please enter some code before starting the review."
      );

      setReview(null);
      setExpandedIssueKey(null);
      setHighlightLine(null);
      setFixResult(null);
      setFixError(null);
      setFixAction("fix");

      return;
    }

    setIsReviewing(true);
    setError(null);
    setReview(null);
    setExpandedIssueKey(null);
    setHighlightLine(null);
    setFixResult(null);
    setFixError(null);
    setFixAction("fix");

    try {
      const response = await reviewCode(
        code,
        language
      );

      setReview(response.review);

      const historyItem: ReviewHistoryItem = {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        code,
        language,
        review: response.review,
      };

      const existingHistory = JSON.parse(
        localStorage.getItem(REVIEW_HISTORY_KEY) || "[]"
      ) as ReviewHistoryItem[];

      const updatedHistory = [
        historyItem,
        ...existingHistory,
      ].slice(0, 20);

      localStorage.setItem(
        REVIEW_HISTORY_KEY,
        JSON.stringify(updatedHistory)
      );
    } catch (error) {
      console.error(
        "Code review failed:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to complete the code review."
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const handleFixIssue = async (
    issue: CodeReviewResult["bugs"][number],
    action: FixAction
  ) => {
    setIsFixing(true);
    setFixError(null);
    setFixResult(null);
    setFixAction(action);

    try {
      const response = await fixCode(
        code,
        language,
        issue,
        action
      );

      setFixResult(response.fix);
    } catch (error) {
      console.error(
        "AI code action failed:",
        error
      );

      setFixError(
        error instanceof Error
          ? error.message
          : "Unable to generate the AI code improvement."
      );
    } finally {
      setIsFixing(false);
    }
  };

  const handleAcceptFix = () => {
    if (!fixResult) {
      return;
    }

    setCode(fixResult.fixedCode);
    setFixError(null);
  };

  const handleRejectFix = () => {
    setFixResult(null);
    setFixError(null);
  };

  const handleReReviewFixedCode = async () => {
    if (!fixResult?.fixedCode.trim()) {
      return;
    }

    setIsReviewing(true);
    setError(null);
    setFixError(null);

    try {
      const response = await reviewCode(
        fixResult.fixedCode,
        language
      );

      setCode(fixResult.fixedCode);
      setReview(response.review);
      setExpandedIssueKey(null);
      setHighlightLine(null);
      setFixResult(null);
      setFixAction("fix");

      const historyItem: ReviewHistoryItem = {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        code: fixResult.fixedCode,
        language,
        review: response.review,
      };

      const existingHistory = JSON.parse(
        localStorage.getItem(REVIEW_HISTORY_KEY) || "[]"
      ) as ReviewHistoryItem[];

      const updatedHistory = [
        historyItem,
        ...existingHistory,
      ].slice(0, 20);

      localStorage.setItem(
        REVIEW_HISTORY_KEY,
        JSON.stringify(updatedHistory)
      );
    } catch (error) {
      console.error(
        "Fixed code re-review failed:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to re-review the fixed code."
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );
    }
  };

  const totalIssues = review
    ? review.bugs.length +
      review.security.length +
      review.performance.length +
      review.codeQuality.length
    : 0;

  const fixComparison = fixResult
    ? getCodeDiff(
        code,
        fixResult.fixedCode
      )
    : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" />

        <div className="absolute right-[-120px] top-40 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />

        <div className="absolute bottom-[-150px] left-1/3 h-96 w-96 rounded-full bg-indigo-300/10 blur-3xl" />

        <div className="absolute right-10 top-28 hidden text-violet-200/40 lg:block">
          <Code2
            size={180}
            strokeWidth={1}
          />
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950 text-white shadow-lg">
        <div className="mx-auto max-w-[1500px] px-3 sm:px-6">
          <div className="flex min-h-[72px] items-center justify-between gap-2">

            {/* Logo */}
            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="flex min-w-0 items-center gap-2 sm:gap-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 shadow-lg shadow-violet-500/20 sm:h-12 sm:w-12">
                <Code2 size={22} className="sm:hidden" />
                <Code2 size={27} className="hidden sm:block" />
              </div>

              <div className="min-w-0 text-left">
                <h1 className="truncate text-sm font-bold tracking-tight sm:text-lg">
                  AI Code Reviewer
                </h1>

                <p className="hidden text-xs text-slate-400 sm:block">
                  Write Better Code with AI
                </p>
              </div>
            </button>

            {/* Navigation */}
            <nav className="flex shrink-0 items-center gap-1 sm:gap-2">

              {/* Workspace */}
              <button
                type="button"
                onClick={() => navigate("/workspace")}
                className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 sm:px-4"
              >
                <Code2 size={18} />

                <span className="hidden sm:inline">
                  Workspace
                </span>
              </button>

              {/* History */}
              <button
                type="button"
                onClick={() => navigate("/history")}
                className="flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:px-4"
              >
                <History size={18} />

                <span className="hidden sm:inline">
                  History
                </span>
              </button>
            </nav>

            {/* User */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">

              {/* Desktop User */}
              <div className="hidden items-center gap-3 border-r border-slate-700 pr-4 md:flex">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-bold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>

                <div>
                  <p className="text-xs text-slate-400">
                    Welcome back,
                  </p>

                  <p className="max-w-[120px] truncate text-sm font-semibold text-white">
                    {user?.name}
                  </p>
                </div>
              </div>

              {/* Mobile User Avatar */}
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-bold md:hidden"
                title={user?.name}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 items-center justify-center rounded-xl px-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:gap-2 sm:px-3"
                title="Logout"
              >
                <LogOut size={18} />

                <span className="hidden lg:inline">
                  Logout
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:py-10">

        {/* Hero */}
        <section className="mb-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm backdrop-blur">
                <Sparkles size={14} />
                AI-powered development workspace
              </div>

              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Code Review{" "}
                <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                  Workspace
                </span>
              </h2>

              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Write, edit, and prepare your code for
                intelligent AI-powered review.
              </p>
            </div>

            <div className="hidden lg:block">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white bg-white/70 shadow-xl shadow-violet-200/40 backdrop-blur">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg">
                  <Rocket size={32} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <Lightbulb size={23} />
            </div>

            <h3 className="font-bold text-slate-900">
              Better Code
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Find issues early
            </p>
          </div>

          <div className="rounded-2xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
              <ShieldCheck size={23} />
            </div>

            <h3 className="font-bold text-slate-900">
              More Secure
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Catch security risks
            </p>
          </div>

          <div className="rounded-2xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <CheckCircle2 size={23} />
            </div>

            <h3 className="font-bold text-slate-900">
              Higher Quality
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Follow best practices
            </p>
          </div>

          <div className="rounded-2xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-500">
              <Rocket size={23} />
            </div>

            <h3 className="font-bold text-slate-900">
              Learn & Improve
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Get actionable feedback
            </p>
          </div>
        </section>

        {/* GitHub Integration — Phase 9 */}
        <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-xl shadow-slate-300/20 backdrop-blur sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-lg">
                <Code2 size={24} />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900">
                    GitHub Repositories
                  </h3>

                  {githubConnected && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      Connected
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Connect GitHub and choose a repository to analyze.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {!githubConnected && (
                <a
                  href={getGitHubConnectUrl()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg"
                >
                  <Code2 size={17} />
                  Connect GitHub
                </a>
              )}

              {githubConnected && (
                <button
                  type="button"
                  onClick={() => void loadGitHubRepositories()}
                  disabled={isLoadingGitHubRepositories}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={17}
                    className={
                      isLoadingGitHubRepositories
                        ? "animate-spin"
                        : ""
                    }
                  />
                  Refresh repositories
                </button>
              )}
            </div>
          </div>

          {githubError && (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-amber-800">
                  GitHub connection required
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  {githubError}
                </p>
              </div>

              <a
                href={getGitHubConnectUrl()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
              >
                <Code2 size={16} />
                Connect GitHub
              </a>
            </div>
          )}

          {githubConnected && !githubError && (
            <>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Select a repository
                  </p>
                  <p className="text-xs text-slate-500">
                    {githubRepositories.length}{" "}
                    {githubRepositories.length === 1
                      ? "repository"
                      : "repositories"}{" "}
                    available
                  </p>
                </div>

                <div className="relative w-full sm:w-80">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="search"
                    value={repositorySearch}
                    onChange={(event) =>
                      setRepositorySearch(event.target.value)
                    }
                    placeholder="Search repositories..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  />
                </div>
              </div>

              {isLoadingGitHubRepositories ? (
                <div className="mt-5 flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-sm font-semibold text-slate-500">
                  <RefreshCw
                    size={18}
                    className="mr-2 animate-spin"
                  />
                  Loading repositories...
                </div>
              ) : filteredGitHubRepositories.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <Code2
                    size={28}
                    className="mx-auto text-slate-400"
                  />
                  <p className="mt-3 font-bold text-slate-700">
                    No repositories found
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Try a different search term.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {filteredGitHubRepositories.map(
                    (repository) => {
                      const isSelected =
                        selectedRepository?.id ===
                        repository.id;

                      return (
                        <button
                          key={repository.id}
                          type="button"
                          onClick={() => {
                            setSelectedRepository(repository);
                            setGitHubRepositoryIndexStatus(null);
                            setGitHubRepositoryIndexError(null);
                            setGitHubRepositoryIndexId(null);
                            setGitHubRepositoryIndexProgress(null);
                            setGitHubRepositoryIndexFiles([]);
                            setSelectedGitHubRepositoryFileId(null);
                            setSelectedGitHubRepositoryFile(null);
                            setGitHubRepositoryFileError(null);
                            setGitHubRepositoryGraph(null);
                            setSelectedGitHubGraphNodeId(null);
                            setGitHubRepositoryGraphError(null);
                            setGitHubRepositoryReview(null);
                            setGitHubRepositoryReviewError(null);
                            setGitHubRepositoryTestGeneration(null);
                            setGitHubRepositoryTestGenerationError(null);
                            void loadGitHubBranches(repository);
                          }}
                          className={`rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-violet-400 bg-violet-50 shadow-md ring-2 ring-violet-100"
                              : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Code2
                                  size={17}
                                  className="shrink-0 text-slate-700"
                                />

                                <p className="truncate font-bold text-slate-900">
                                  {repository.name}
                                </p>

                                {repository.private && (
                                  <Lock
                                    size={14}
                                    className="shrink-0 text-amber-500"
                                  />
                                )}
                              </div>

                              <p className="mt-1 truncate text-xs text-slate-500">
                                {repository.fullName}
                              </p>
                            </div>

                            {isSelected && (
                              <span className="shrink-0 rounded-full bg-violet-600 px-2.5 py-1 text-xs font-bold text-white">
                                Selected
                              </span>
                            )}
                          </div>

                          <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">
                            {repository.description ||
                              "No description provided."}
                          </p>

                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                            {repository.language && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                {repository.language}
                              </span>
                            )}

                            <span className="rounded-full bg-slate-100 px-2.5 py-1">
                              {repository.defaultBranch}
                            </span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              )}

              {selectedRepository && (
                <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                        Selected repository
                      </p>
                      <p className="mt-1 font-bold text-violet-950">
                        {selectedRepository.fullName}
                      </p>
                    </div>

                    <a
                      href={selectedRepository.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                    >
                      Open on GitHub
                      <ArrowRight size={16} />
                    </a>
                  </div>

                  <div className="mt-4 border-t border-violet-200 pt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-violet-950">
                          Select a branch
                        </p>
                        <p className="text-xs text-violet-700">
                          Choose the branch you want to work with.
                        </p>
                      </div>

                      {isLoadingGitHubBranches && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
                          <RefreshCw
                            size={15}
                            className="animate-spin"
                          />
                          Loading branches...
                        </div>
                      )}
                    </div>

                    {githubBranchError && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {githubBranchError}
                      </div>
                    )}

                    {!githubBranchError && !isLoadingGitHubBranches && githubBranches.length > 0 && (
                     <div className="relative mt-3 w-full sm:max-w-md">
                        <select
                          value={selectedBranch?.name ?? ""}
                          onChange={(event) => {
                            const branch = githubBranches.find(
                              (item) => item.name === event.target.value
                            );
                            setSelectedBranch(branch ?? null);
                            setGitHubRepositoryIndexStatus(null);
                            setGitHubRepositoryIndexError(null);
                            setGitHubRepositoryIndexId(null);
                            setGitHubRepositoryIndexProgress(null);
                            setGitHubRepositoryIndexFiles([]);
                            setSelectedGitHubRepositoryFileId(null);
                            setSelectedGitHubRepositoryFile(null);
                            setGitHubRepositoryFileError(null);
                            setGitHubRepositoryGraph(null);
                            setSelectedGitHubGraphNodeId(null);
                            setGitHubRepositoryGraphError(null);
                            setGitHubRepositoryReview(null);
                            setGitHubRepositoryReviewError(null);
                            setGitHubRepositoryTestGeneration(null);
                            setGitHubRepositoryTestGenerationError(null);

                            if (branch && selectedRepository) {
                              void loadGitHubRepositoryTree(
                                selectedRepository,
                                branch.name
                              );
                            }
                          }}
                          className="w-full appearance-none rounded-xl border border-violet-200 bg-white px-4 py-3 pr-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 sm:max-w-md"
                        >
                          <option value="" disabled>
                            Select a branch
                          </option>
                          {githubBranches.map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}
                              {branch.protected ? " (protected)" : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={17}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                      </div>
                    )}

                    {!githubBranchError && !isLoadingGitHubBranches && githubBranches.length === 0 && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        No branches were returned for this repository.
                      </div>
                    )}

                    {selectedBranch && !githubBranchError && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-violet-600 px-2.5 py-1 text-white">
                          Selected branch: {selectedBranch.name}
                        </span>
                        {selectedBranch.protected && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                            Protected
                          </span>
                        )}
                      </div>
                    )}

                    {selectedBranch && (
                      <div className="mt-5 border-t border-violet-200 pt-4">
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Visibility</p>
                            <p className="mt-1 text-sm font-bold text-slate-800">
                              {selectedRepository.private ? "Private" : "Public"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Language</p>
                            <p className="mt-1 text-sm font-bold text-slate-800">
                              {selectedRepository.language || "Not specified"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Default branch</p>
                            <p className="mt-1 truncate text-sm font-bold text-slate-800">
                              {selectedRepository.defaultBranch}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">Selected branch</p>
                            <p className="mt-1 truncate text-sm font-bold text-slate-800">
                              {selectedBranch.name}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                                Analysis status
                              </p>
                              <p className="mt-1 font-bold text-emerald-900">
                                {isIndexingGitHubRepository
                                  ? "Analyzing repository..."
                                  : githubRepositoryIndexStatus === "completed"
                                    ? "Repository indexed successfully"
                                    : isLoadingGitHubRepositoryTree
                                      ? "Discovering repository files..."
                                      : githubRepositoryTree
                                        ? "Repository structure discovered"
                                        : "Repository selected"}
                              </p>
                              <p className="mt-1 text-xs text-emerald-700">
                                {githubRepositoryIndexStatus === "completed"
                                  ? "Repository metadata has been recorded and is ready for the next indexing step."
                                  : githubRepositoryTree
                                    ? "The selected branch is ready to be analyzed."
                                    : "Select a branch to discover its repository structure."}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                                  isIndexingGitHubRepository
                                    ? "bg-amber-100 text-amber-700"
                                    : githubRepositoryIndexStatus === "completed"
                                      ? "bg-emerald-600 text-white"
                                      : githubRepositoryTree
                                        ? "bg-emerald-600 text-white"
                                        : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {(isIndexingGitHubRepository || isLoadingGitHubRepositoryTree) && (
                                  <RefreshCw size={13} className="animate-spin" />
                                )}
                                {isIndexingGitHubRepository
                                  ? "Analyzing"
                                  : githubRepositoryIndexStatus === "completed"
                                    ? "Indexed"
                                    : isLoadingGitHubRepositoryTree
                                      ? "Loading"
                                      : githubRepositoryTree
                                        ? "Ready"
                                        : "Waiting"}
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  void handleAnalyzeGitHubRepository();
                                }}
                                disabled={
                                  isIndexingGitHubRepository ||
                                  !selectedRepository ||
                                  !selectedBranch
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isIndexingGitHubRepository ? (
                                  <RefreshCw
                                    size={16}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Rocket size={16} />
                                )}
                                {isIndexingGitHubRepository
                                  ? "Analyzing..."
                                  : "Analyze Repository"}
                              </button>

<button
  type="button"
  onClick={() => {
    void handleGitHubRepositoryReview();
  }}
  disabled={
    isGitHubRepositoryReviewLoading ||
    githubRepositoryIndexStatus !== "completed"
  }
  className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
>
  {isGitHubRepositoryReviewLoading ? (
    <RefreshCw
      size={16}
      className="animate-spin"
    />
  ) : (
    <Sparkles size={16} />
  )}

  {isGitHubRepositoryReviewLoading
    ? "Reviewing Repository..."
    : "AI Review Repository"}
</button>

                            </div>
                          </div>

                          {githubRepositoryIndexProgress && (
                            <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                                    File ingestion progress
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-800">
                                    {githubRepositoryIndexProgress.processedFileCount}{" "}
                                    /{" "}
                                    {githubRepositoryIndexProgress.sourceFileCount}{" "}
                                    source files processed
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                                    Completed:{" "}
                                    {githubRepositoryIndexProgress.completedFileCount}
                                  </span>

                                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                                    Failed:{" "}
                                    {githubRepositoryIndexProgress.failedFileCount}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-600 transition-all duration-300"
                                  style={{
                                    width: `${
                                      githubRepositoryIndexProgress.sourceFileCount > 0
                                        ? Math.min(
                                            100,
                                            Math.round(
                                              (githubRepositoryIndexProgress.processedFileCount /
                                                githubRepositoryIndexProgress.sourceFileCount) *
                                                100
                                            )
                                          )
                                        : 0
                                    }%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {githubRepositoryIndexStatus === "completed" &&
                          githubRepositoryIndexId && (
                            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                                    Indexed source files
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-800">
                                    {githubRepositoryIndexFiles.length} files available
                                  </p>
                                </div>

                                {isLoadingGitHubRepositoryFiles && (
                                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                                    <RefreshCw
                                      size={15}
                                      className="animate-spin"
                                    />
                                    Loading indexed files...
                                  </div>
                                )}
                              </div>

                              {githubRepositoryFileError && (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {githubRepositoryFileError}
                                </div>
                              )}

                              {!isLoadingGitHubRepositoryFiles &&
                                !githubRepositoryFileError &&
                                githubRepositoryIndexFiles.length === 0 && (
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                    No indexed source files are available.
                                  </div>
                                )}

                              {!isLoadingGitHubRepositoryFiles &&
                                githubRepositoryIndexFiles.length > 0 && (
                                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                                    <div className="max-h-116 overflow-y-auto rounded-xl border border-slate-200 bg-slate-950 p-2">
                                      {githubRepositoryIndexFiles.map((file) => (
                                        <button
                                          key={file._id}
                                          type="button"
                                          onClick={() => {
                                            setGitHubRepositoryTestGeneration(null);
                                            setGitHubRepositoryTestGenerationError(null);
                                            void loadGitHubRepositoryIndexFile(
                                              githubRepositoryIndexId,
                                              file._id
                                            );
                                          }}
                                          className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition last:mb-0 ${
                                            selectedGitHubRepositoryFileId === file._id
                                              ? "bg-violet-600 text-white"
                                              : "text-slate-300 hover:bg-slate-800"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="min-w-0 truncate font-mono text-xs">
                                              {file.path}
                                            </p>
                                            <span
                                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                file.status === "completed"
                                                  ? "bg-emerald-100 text-emerald-700"
                                                  : file.status === "failed"
                                                    ? "bg-red-100 text-red-700"
                                                    : "bg-amber-100 text-amber-700"
                                              }`}
                                            >
                                              {file.status}
                                            </span>
                                          </div>
                                          <p
                                            className={`mt-1 text-[11px] ${
                                              selectedGitHubRepositoryFileId === file._id
                                                ? "text-violet-100"
                                                : "text-slate-500"
                                            }`}
                                          >
                                            {file.language || file.extension || "Source file"}{" "}
                                            · {file.size.toLocaleString()} B
                                          </p>
                                        </button>
                                      ))}
                                    </div>

                                    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                                      <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="min-w-0 truncate font-mono text-xs font-bold text-slate-300">
                                          {selectedGitHubRepositoryFile?.path ||
                                            "Select a file to view its content"}
                                        </p>

                                        {selectedGitHubRepositoryFile && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              void handleGitHubRepositoryTestGeneration();
                                            }}
                                            disabled={
                                              isGitHubRepositoryTestGenerationLoading
                                            }
                                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            {isGitHubRepositoryTestGenerationLoading ? (
                                              <RefreshCw
                                                size={15}
                                                className="animate-spin"
                                              />
                                            ) : (
                                              <Sparkles size={15} />
                                            )}
                                            {isGitHubRepositoryTestGenerationLoading
                                              ? "Generating..."
                                              : "Generate Tests"}
                                          </button>
                                        )}
                                      </div>

                                      {isLoadingGitHubRepositoryFile ? (
                                        <div className="flex min-h-48 items-center justify-center p-6 text-sm font-semibold text-slate-400">
                                          <RefreshCw
                                            size={17}
                                            className="mr-2 animate-spin"
                                          />
                                          Loading file...
                                        </div>
                                      ) : selectedGitHubRepositoryFile ? (
                                        <pre className="max-h-96 overflow-auto p-4 text-xs leading-6 text-slate-200">
                                          <code>
                                            {selectedGitHubRepositoryFile.content}
                                          </code>
                                        </pre>
                                      ) : (
                                        <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-slate-500">
                                          Select an indexed source file to view its stored content.
                                        </div>
                                      )}


                                    </div>
                                  </div>
                                )}

                                      {githubRepositoryTestGenerationError && (
                                        <div className="border-t border-red-900 bg-red-950/70 p-3 text-sm font-medium text-red-200">
                                          {githubRepositoryTestGenerationError}
                                        </div>
                                      )}

                                      {githubRepositoryTestGeneration && (
                                        <div className="mt-3 rounded-xl border border-violet-200 bg-slate-50/70 p-3 sm:p-4">
                                          <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
                                              <div className="flex min-w-0 items-center gap-2">
                                                <span className="rounded-md bg-violet-100 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-violet-700">
                                                  Phase 16
                                                </span>
                                                <p className="truncate font-mono text-xs font-bold text-slate-900">
                                                  {githubRepositoryTestGeneration.testFileName}
                                                </p>
                                                <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:inline-flex">
                                                  {githubRepositoryTestGeneration.testFramework}
                                                </span>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void navigator.clipboard.writeText(
                                                    githubRepositoryTestGeneration.testCode
                                                  );
                                                }}
                                                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-100"
                                              >
                                                Copy Tests
                                              </button>
                                            </div>

                                            <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_230px]">
                                              <div className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                                                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
                                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                    Generated test code
                                                  </span>
                                                  <span className="text-[9px] text-slate-600">Scroll to view</span>
                                                </div>
                                                <pre className="h-56 overflow-auto p-3 text-[11px] leading-5 text-slate-200">
                                                  <code>{githubRepositoryTestGeneration.testCode}</code>
                                                </pre>
                                              </div>

                                              <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-2">
                                                    <Lightbulb size={14} className="shrink-0 text-violet-600" />
                                                    <p className="text-xs font-bold text-slate-900">
                                                      Coverage
                                                    </p>
                                                  </div>
                                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">
                                                    {githubRepositoryTestGeneration.testCases.length} tests
                                                  </span>
                                                </div>

                                                <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-slate-600">
                                                  {githubRepositoryTestGeneration.explanation}
                                                </p>

                                                <details className="mt-2">
                                                  <summary className="cursor-pointer select-none text-[10px] font-bold text-violet-700 hover:text-violet-800">
                                                    View test details
                                                  </summary>
                                                  <div className="mt-2 max-h-36 space-y-1.5 overflow-auto pr-1">
                                                    {githubRepositoryTestGeneration.testCases.map(
                                                      (testCase, index) => (
                                                        <div
                                                          key={`${testCase.name}-${index}`}
                                                          className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                                                        >
                                                          <p className="text-[10px] font-bold leading-4 text-slate-800">
                                                            {testCase.name}
                                                          </p>
                                                          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                                                            {testCase.purpose}
                                                          </p>
                                                        </div>
                                                      )
                                                    )}
                                                  </div>
                                                </details>
                                              </div>
                                            </div>

                                            {githubRepositoryTestGeneration.limitations.length > 0 && (
                                              <details className="border-t border-amber-100 bg-amber-50">
                                                <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-bold text-amber-800">
                                                  ⚠ {githubRepositoryTestGeneration.limitations.length} generation limitation{githubRepositoryTestGeneration.limitations.length === 1 ? "" : "s"}
                                                </summary>
                                                <div className="max-h-20 overflow-auto border-t border-amber-100 px-3 py-2 text-[10px] leading-4 text-amber-700">
                                                  {githubRepositoryTestGeneration.limitations.map(
                                                    (limitation, index) => (
                                                      <p key={`${limitation}-${index}`}>
                                                        • {limitation}
                                                      </p>
                                                    )
                                                  )}
                                                </div>
                                              </details>
                                            )}
                                          </div>
                                        </div>
                                      )}
                            </div>
                          )}

                        {githubRepositoryIndexStatus === "completed" &&
                          githubRepositoryIndexId && (
                            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-violet-700">
                                    Dependency graph
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-800">
                                    {githubRepositoryGraph?.nodes.length ?? 0} files ·{" "}
                                    {githubRepositoryGraph?.edges.length ?? 0} relationships
                                  </p>
                                </div>

                                {isLoadingGitHubRepositoryGraph && (
                                  <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
                                    <RefreshCw
                                      size={15}
                                      className="animate-spin"
                                    />
                                    Building dependency graph...
                                  </div>
                                )}
                              </div>

                              {githubRepositoryGraphError && (
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {githubRepositoryGraphError}
                                </div>
                              )}

                              {!isLoadingGitHubRepositoryGraph &&
                                !githubRepositoryGraphError &&
                                githubRepositoryGraph &&
                                githubRepositoryGraph.nodes.length === 0 && (
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                    No indexed source files are available for the dependency graph.
                                  </div>
                                )}

                              {!isLoadingGitHubRepositoryGraph &&
                                !githubRepositoryGraphError &&
                                githubRepositoryGraph &&
                                githubRepositoryGraph.nodes.length > 0 && (
                                  <>
                                    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                                      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                          <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                                              Graph canvas
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                              Click a numbered node to inspect the complete file path.
                                            </p>
                                          </div>

                                          {selectedGitHubGraphNodeId && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setSelectedGitHubGraphNodeId(null)
                                              }
                                              className="self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 sm:self-auto"
                                            >
                                              Clear selection
                                            </button>
                                          )}
                                        </div>

                                        <div className="overflow-x-auto p-2 sm:p-3">
                                          <svg
                                            viewBox="0 0 900 620"
                                            className="block min-h-[520px] min-w-[820px] w-full"
                                            role="img"
                                            aria-label="Repository dependency graph"
                                          >
                                            <defs>
                                              <marker
                                                id="repository-graph-arrow"
                                                viewBox="0 0 10 10"
                                                refX="9"
                                                refY="5"
                                                markerWidth="6"
                                                markerHeight="6"
                                                orient="auto-start-reverse"
                                              >
                                                <path
                                                  d="M 0 0 L 10 5 L 0 10 z"
                                                  fill="currentColor"
                                                />
                                              </marker>
                                            </defs>

                                            {githubRepositoryGraph.edges.map((edge) => {
                                              const sourceIndex =
                                                githubRepositoryGraph.nodes.findIndex(
                                                  (node) => node.id === edge.source
                                                );
                                              const targetIndex =
                                                githubRepositoryGraph.nodes.findIndex(
                                                  (node) => node.id === edge.target
                                                );

                                              if (
                                                sourceIndex < 0 ||
                                                targetIndex < 0
                                              ) {
                                                return null;
                                              }

                                              const total =
                                                githubRepositoryGraph.nodes.length;
                                              const centerX = 450;
                                              const centerY = 310;
                                              const useTwoRings = total > 24;
                                              const ring = useTwoRings
                                                ? sourceIndex % 2
                                                : 0;
                                              const targetRing = useTwoRings
                                                ? targetIndex % 2
                                                : 0;
                                              const sourceRingCount = useTwoRings
                                                ? Math.ceil(total / 2)
                                                : total;
                                              const targetRingCount = sourceRingCount;
                                              const sourceRadius = useTwoRings
                                                ? ring === 0
                                                  ? 165
                                                  : 270
                                                : 220;
                                              const targetRadius = useTwoRings
                                                ? targetRing === 0
                                                  ? 165
                                                  : 270
                                                : 220;
                                              const sourcePosition = useTwoRings
                                                ? Math.floor(sourceIndex / 2)
                                                : sourceIndex;
                                              const targetPosition = useTwoRings
                                                ? Math.floor(targetIndex / 2)
                                                : targetIndex;
                                              const sourceAngle =
                                                (sourcePosition /
                                                  Math.max(sourceRingCount, 1)) *
                                                  Math.PI *
                                                  2 -
                                                Math.PI / 2;
                                              const targetAngle =
                                                (targetPosition /
                                                  Math.max(targetRingCount, 1)) *
                                                  Math.PI *
                                                  2 -
                                                Math.PI / 2;

                                              const sourceX =
                                                centerX +
                                                Math.cos(sourceAngle) * sourceRadius;
                                              const sourceY =
                                                centerY +
                                                Math.sin(sourceAngle) * sourceRadius;
                                              const targetX =
                                                centerX +
                                                Math.cos(targetAngle) * targetRadius;
                                              const targetY =
                                                centerY +
                                                Math.sin(targetAngle) * targetRadius;
                                              const isHighlighted =
                                                selectedGitHubGraphNodeId ===
                                                  edge.source ||
                                                selectedGitHubGraphNodeId ===
                                                  edge.target;

                                              return (
                                                <line
                                                  key={edge.id}
                                                  x1={sourceX}
                                                  y1={sourceY}
                                                  x2={targetX}
                                                  y2={targetY}
                                                  stroke={
                                                    isHighlighted
                                                      ? "#7c3aed"
                                                      : "#cbd5e1"
                                                  }
                                                  strokeWidth={
                                                    isHighlighted ? 2.5 : 1.25
                                                  }
                                                  opacity={
                                                    selectedGitHubGraphNodeId &&
                                                    !isHighlighted
                                                      ? 0.35
                                                      : 0.9
                                                  }
                                                  markerEnd="url(#repository-graph-arrow)"
                                                />
                                              );
                                            })}

                                            {githubRepositoryGraph.nodes.map(
                                              (node, nodeIndex) => {
                                                const total =
                                                  githubRepositoryGraph.nodes.length;
                                                const centerX = 450;
                                                const centerY = 310;
                                                const useTwoRings = total > 24;
                                                const ring = useTwoRings
                                                  ? nodeIndex % 2
                                                  : 0;
                                                const ringCount = useTwoRings
                                                  ? Math.ceil(total / 2)
                                                  : total;
                                                const radius = useTwoRings
                                                  ? ring === 0
                                                    ? 165
                                                    : 270
                                                  : 220;
                                                const position = useTwoRings
                                                  ? Math.floor(nodeIndex / 2)
                                                  : nodeIndex;
                                                const angle =
                                                  (position /
                                                    Math.max(ringCount, 1)) *
                                                    Math.PI *
                                                    2 -
                                                  Math.PI / 2;
                                                const x =
                                                  centerX +
                                                  Math.cos(angle) * radius;
                                                const y =
                                                  centerY +
                                                  Math.sin(angle) * radius;
                                                const isSelected =
                                                  selectedGitHubGraphNodeId ===
                                                  node.id;
                                                const fileName =
                                                  node.path.split("/").pop() ||
                                                  node.path;

                                                return (
                                                  <g
                                                    key={node.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label={`Node ${nodeIndex + 1}: ${node.path}`}
                                                    onClick={() =>
                                                      setSelectedGitHubGraphNodeId(
                                                        isSelected ? null : node.id
                                                      )
                                                    }
                                                    onKeyDown={(event) => {
                                                      if (
                                                        event.key === "Enter" ||
                                                        event.key === " "
                                                      ) {
                                                        event.preventDefault();
                                                        setSelectedGitHubGraphNodeId(
                                                          isSelected
                                                            ? null
                                                            : node.id
                                                        );
                                                      }
                                                    }}
                                                    className="cursor-pointer outline-none"
                                                  >
                                                    {isSelected && (
                                                      <circle
                                                        cx={x}
                                                        cy={y}
                                                        r="29"
                                                        className="fill-violet-50 stroke-violet-300"
                                                        strokeWidth="2"
                                                      />
                                                    )}

                                                    <circle
                                                      cx={x}
                                                      cy={y}
                                                      r={isSelected ? 22 : 18}
                                                      className={
                                                        isSelected
                                                          ? "fill-violet-600 stroke-violet-900"
                                                          : "fill-violet-100 stroke-violet-400"
                                                      }
                                                      strokeWidth="2"
                                                    />

                                                    <text
                                                      x={x}
                                                      y={y + 4}
                                                      textAnchor="middle"
                                                      className={
                                                        isSelected
                                                          ? "fill-white text-[10px] font-bold"
                                                          : "fill-violet-800 text-[10px] font-bold"
                                                      }
                                                    >
                                                      {nodeIndex + 1}
                                                    </text>

                                                    {isSelected && (
                                                      <g>
                                                        <rect
                                                          x={Math.max(8, Math.min(892 - Math.min(fileName.length * 7 + 24, 190), x - Math.min(fileName.length * 3.5 + 12, 95)))}
                                                          y={
                                                            Math.sin(angle) >= 0
                                                              ? y + 34
                                                              : y - 48
                                                          }
                                                          width={Math.min(
                                                            190,
                                                            Math.max(90, fileName.length * 7 + 24)
                                                          )}
                                                          height="28"
                                                          rx="8"
                                                          className="fill-white stroke-violet-200"
                                                          strokeWidth="1.5"
                                                        />
                                                        <text
                                                          x={x}
                                                          y={
                                                            Math.sin(angle) >= 0
                                                              ? y + 52
                                                              : y - 30
                                                          }
                                                          textAnchor="middle"
                                                          className="fill-slate-700 text-[10px] font-bold"
                                                        >
                                                          {fileName.length > 25
                                                            ? `${fileName.slice(0, 22)}...`
                                                            : fileName}
                                                        </text>
                                                      </g>
                                                    )}

                                                    <title>{node.path}</title>
                                                  </g>
                                                );
                                              }
                                            )}
                                          </svg>
                                        </div>
                                      </div>

                                      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <div>
                                            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                                              File details
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                              Full paths stay here instead of overlapping the graph.
                                            </p>
                                          </div>
                                          <Code2 size={18} className="shrink-0 text-violet-500" />
                                        </div>

                                        {selectedGitHubGraphNodeId ? (
                                          (() => {
                                            const selectedNode =
                                              githubRepositoryGraph.nodes.find(
                                                (node) =>
                                                  node.id ===
                                                  selectedGitHubGraphNodeId
                                              );

                                            if (!selectedNode) {
                                              return null;
                                            }

                                            const dependencyCount =
                                              githubRepositoryGraph.edges.filter(
                                                (edge) =>
                                                  edge.source === selectedNode.id
                                              ).length;
                                            const dependentCount =
                                              githubRepositoryGraph.edges.filter(
                                                (edge) =>
                                                  edge.target === selectedNode.id
                                              ).length;

                                            return (
                                              <div className="mt-3 space-y-3">
                                                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                                                  <div className="flex items-start gap-2">
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
                                                      {githubRepositoryGraph.nodes.findIndex(
                                                        (node) =>
                                                          node.id ===
                                                          selectedNode.id
                                                      ) + 1}
                                                    </span>
                                                    <p className="min-w-0 break-all font-mono text-xs font-bold leading-5 text-violet-950">
                                                      {selectedNode.path}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                  <div className="rounded-lg bg-slate-50 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                      Language
                                                    </p>
                                                    <p className="mt-1 truncate text-xs font-bold text-slate-700">
                                                      {selectedNode.language || selectedNode.extension || "Unknown"}
                                                    </p>
                                                  </div>
                                                  <div className="rounded-lg bg-slate-50 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                      Status
                                                    </p>
                                                    <p className="mt-1 truncate text-xs font-bold text-emerald-700">
                                                      {selectedNode.status}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">
                                                      Dependencies
                                                    </p>
                                                    <p className="mt-1 text-lg font-extrabold text-blue-800">
                                                      {dependencyCount}
                                                    </p>
                                                  </div>
                                                  <div className="rounded-lg border border-violet-100 bg-violet-50 p-2.5">
                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">
                                                      Used by
                                                    </p>
                                                    <p className="mt-1 text-lg font-extrabold text-violet-800">
                                                      {dependentCount}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div>
                                                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                    Connected files
                                                  </p>
                                                  <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
                                                    {githubRepositoryGraph.edges
                                                      .filter(
                                                        (edge) =>
                                                          edge.source === selectedNode.id ||
                                                          edge.target === selectedNode.id
                                                      )
                                                      .map((edge) => {
                                                        const connectedPath =
                                                          edge.source === selectedNode.id
                                                            ? edge.targetPath
                                                            : edge.sourcePath;

                                                        return (
                                                          <button
                                                            key={edge.id}
                                                            type="button"
                                                            onClick={() =>
                                                              setSelectedGitHubGraphNodeId(
                                                                edge.source === selectedNode.id
                                                                  ? edge.target
                                                                  : edge.source
                                                              )
                                                            }
                                                            className="flex w-full items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-left transition hover:border-violet-200 hover:bg-violet-50"
                                                          >
                                                            <ArrowRight
                                                              size={13}
                                                              className="mt-0.5 shrink-0 text-violet-500"
                                                            />
                                                            <span className="min-w-0 break-all font-mono text-[11px] leading-4 text-slate-600">
                                                              {connectedPath}
                                                            </span>
                                                          </button>
                                                        );
                                                      })}

                                                    {dependencyCount + dependentCount === 0 && (
                                                      <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
                                                        No connected files were detected.
                                                      </p>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })()
                                        ) : (
                                          <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                                              <Code2 size={21} />
                                            </div>
                                            <p className="mt-3 text-sm font-bold text-slate-700">
                                              Select a graph node
                                            </p>
                                            <p className="mt-1 max-w-[220px] text-xs leading-5 text-slate-500">
                                              The complete file path, language, dependency count, and connected files will appear here.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {githubRepositoryIndexStatus === "completed" &&
  githubRepositoryIndexId && (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <Search size={19} />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Semantic Code Search
          </p>

          <p className="mt-1 text-sm text-slate-600">
            Search the indexed repository using natural language.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={githubEmbeddingQuery}
          onChange={(event) =>
            setGitHubEmbeddingQuery(event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleGitHubEmbeddingSearch();
            }
          }}
          placeholder="e.g. Where is authentication handled?"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />

        <button
          type="button"
          onClick={() => {
            void handleGitHubEmbeddingSearch();
          }}
          disabled={isSearchingGitHubEmbeddings}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearchingGitHubEmbeddings ? (
            <>
              <RefreshCw
                size={16}
                className="animate-spin"
              />
              Searching...
            </>
          ) : (
            <>
              <Search size={16} />
              Search
            </>
          )}
        </button>
      </div>

      {/* Repository Health */}
      {githubRepositoryReview && (
        <section className="mt-6 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Sparkles size={21} />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                  Phase 15
                </p>

                <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                  Repository Health
                </h3>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                  AI-generated repository-wide health analysis based on the indexed source code and dependency relationships.
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                Overall
              </p>

              <p className="mt-1 text-3xl font-extrabold text-violet-700">
                {githubRepositoryReview.repositoryHealth.overall}
              </p>

              <p className="text-xs font-semibold text-violet-500">
                / 100
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                key: "codeQuality" as const,
                title: "Code Quality",
                icon: <CheckCircle2 size={19} />,
                iconClass: "bg-blue-50 text-blue-600",
                scoreClass: "text-blue-700",
                barClass: "bg-blue-600",
              },
              {
                key: "security" as const,
                title: "Security",
                icon: <ShieldCheck size={19} />,
                iconClass: "bg-emerald-50 text-emerald-600",
                scoreClass: "text-emerald-700",
                barClass: "bg-emerald-600",
              },
              {
                key: "performance" as const,
                title: "Performance",
                icon: <Zap size={19} />,
                iconClass: "bg-amber-50 text-amber-600",
                scoreClass: "text-amber-700",
                barClass: "bg-amber-500",
              },
              {
                key: "architecture" as const,
                title: "Architecture",
                icon: <Code2 size={19} />,
                iconClass: "bg-violet-50 text-violet-600",
                scoreClass: "text-violet-700",
                barClass: "bg-violet-600",
              },
              {
                key: "maintainability" as const,
                title: "Maintainability",
                icon: <Lightbulb size={19} />,
                iconClass: "bg-indigo-50 text-indigo-600",
                scoreClass: "text-indigo-700",
                barClass: "bg-indigo-600",
              },
            ].map((category) => {
              const health =
                githubRepositoryReview.repositoryHealth[category.key];

              return (
                <div
                  key={category.key}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${category.iconClass}`}
                      >
                        {category.icon}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900">
                          {category.title}
                        </h4>

                        <p className="text-xs text-slate-500">
                          Repository health
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-2xl font-extrabold ${category.scoreClass}`}
                    >
                      {health.score}
                    </span>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${category.barClass}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, health.score))}%`,
                      }}
                    />
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {health.summary}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-violet-600" />

              <p className="text-sm font-bold text-slate-900">
                Repository Overview
              </p>
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {githubRepositoryReview.overview}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Files Reviewed
              </p>

              <p className="mt-1 text-xl font-extrabold text-slate-800">
                {githubRepositoryReview.statistics.totalFiles}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Lines
              </p>

              <p className="mt-1 text-xl font-extrabold text-slate-800">
                {githubRepositoryReview.statistics.totalLines.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Dependencies
              </p>

              <p className="mt-1 text-xl font-extrabold text-slate-800">
                {githubRepositoryReview.statistics.totalDependencies}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Relationships
              </p>

              <p className="mt-1 text-xl font-extrabold text-slate-800">
                {githubRepositoryReview.statistics.relationshipCount}
              </p>
            </div>
          </div>

          {githubRepositoryReview.limitations.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={17}
                  className="mt-0.5 shrink-0 text-amber-600"
                />

                <div>
                  <p className="text-sm font-bold text-amber-800">
                    Review limitations
                  </p>

                  <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-700">
                    {githubRepositoryReview.limitations.map(
                      (limitation, index) => (
                        <li key={`${limitation}-${index}`}>
                          • {limitation}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Repository-Wide Issues */}
      {githubRepositoryReview && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertTriangle size={21} />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-600">
                  Phase 15
                </p>

                <h3 className="mt-1 text-xl font-extrabold text-slate-900">
                  Repository-Wide Issues
                </h3>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                  Issues detected across the indexed repository, including cross-file relationships, security, performance, architecture, dependencies, and maintainability.
                </p>
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Issues Found
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-800">
                {githubRepositoryReview.issues.length}
              </p>
            </div>
          </div>

          {githubRepositoryReview.issues.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={20}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
                <div>
                  <p className="font-bold text-emerald-900">
                    No meaningful repository-wide issues detected
                  </p>
                  <p className="mt-1 text-sm leading-6 text-emerald-700">
                    The AI review did not find an issue that was sufficiently supported by the indexed repository evidence.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {githubRepositoryReview.issues.map((issue, index) => {
                const categoryMeta = {
                  codeQuality: {
                    label: "Code Quality",
                    className: "bg-blue-50 text-blue-700 border-blue-200",
                    icon: <CheckCircle2 size={14} />,
                  },
                  security: {
                    label: "Security Problem",
                    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    icon: <ShieldCheck size={14} />,
                  },
                  performance: {
                    label: "Performance Issue",
                    className: "bg-amber-50 text-amber-700 border-amber-200",
                    icon: <Zap size={14} />,
                  },
                  architecture: {
                    label: "Architecture Problem",
                    className: "bg-violet-50 text-violet-700 border-violet-200",
                    icon: <Code2 size={14} />,
                  },
                  maintainability: {
                    label: "Maintainability Issue",
                    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    icon: <Lightbulb size={14} />,
                  },
                  dependency: {
                    label: "Dependency Problem",
                    className: "bg-cyan-50 text-cyan-700 border-cyan-200",
                    icon: <ArrowRight size={14} />,
                  },
                } as const;

                const severityMeta = {
                  low: "bg-slate-100 text-slate-600 border-slate-200",
                  medium: "bg-amber-100 text-amber-700 border-amber-200",
                  high: "bg-orange-100 text-orange-700 border-orange-200",
                  critical: "bg-red-100 text-red-700 border-red-200",
                } as const;

                const meta = categoryMeta[issue.category];
                const isCrossFile = issue.files.length > 1;

                return (
                  <article
                    key={`${issue.category}-${issue.title}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-white hover:shadow-sm sm:p-5"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}
                          >
                            {meta.icon}
                            {meta.label}
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${severityMeta[issue.severity]}`}
                          >
                            {issue.severity}
                          </span>

                          {isCrossFile && (
                            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700">
                              Cross-file
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 text-base font-extrabold text-slate-900 sm:text-lg">
                          {issue.title}
                        </h4>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {issue.description}
                    </p>

                    {issue.files.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Affected files
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {issue.files.map((file) => (
                            <span
                              key={file}
                              className="max-w-full break-all rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-600"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                        Recommendation
                      </p>
                      <p className="mt-1 text-sm leading-6 text-violet-900">
                        {issue.recommendation}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Repository AI Chat */}
<section className="mt-6 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
  {/* Header */}
  <div className="flex items-start gap-3">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
      <Sparkles size={21} />
    </div>

    <div>
      <h3 className="font-bold text-slate-900">
        Repository AI Chat
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        Ask questions about the indexed repository. Answers are
        grounded in retrieved repository code and dependencies.
      </p>
    </div>
  </div>

  {/* Question input */}
  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
    <input
      type="text"
      value={githubChatQuery}
      onChange={(event) => {
        setGitHubChatQuery(event.target.value);
        setGitHubChatError(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();

          if (
            githubRepositoryIndexId &&
            !isGitHubChatLoading
          ) {
            void handleGitHubRepositoryChat();
          }
        }
      }}
      placeholder="How does authentication work?"
      disabled={
        !githubRepositoryIndexId ||
        isGitHubChatLoading
      }
      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    />

    <button
      type="button"
      onClick={() => {
        void handleGitHubRepositoryChat();
      }}
      disabled={
        !githubRepositoryIndexId ||
        !githubChatQuery.trim() ||
        isGitHubChatLoading
      }
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
    >
      {isGitHubChatLoading ? (
        <>
          <RefreshCw
            size={17}
            className="animate-spin"
          />
          Thinking...
        </>
      ) : (
        <>
          <Sparkles size={17} />
          Ask AI
        </>
      )}
    </button>
  </div>

  {/* No repository indexed */}
  {!githubRepositoryIndexId && (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
      Analyze the repository before using Repository AI Chat.
    </div>
  )}

  {/* Error */}
  {githubChatError && (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {githubChatError}
    </div>
  )}

  {/* AI Answer */}
  {githubChatResponse && (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles
            size={18}
            className="text-violet-600"
          />

          <h4 className="font-bold text-slate-900">
            AI Answer
          </h4>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {githubChatResponse.answer}
        </p>
      </div>

      {/* Relevant Files */}
      {githubChatResponse.sources.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Relevant Files
          </h4>

          <div className="space-y-2">
            {githubChatResponse.sources.map(
              (source) => (
                <div
                  key={source}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <Code2
                    size={16}
                    className="shrink-0 text-violet-500"
                  />

                  <span className="break-all font-mono text-sm text-slate-700">
                    {source}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )}
</section>

      {githubEmbeddingSearchError && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {githubEmbeddingSearchError}
        </div>
      )}

      {!isSearchingGitHubEmbeddings &&
        !githubEmbeddingSearchError &&
        githubEmbeddingQuery.trim() &&
        githubEmbeddingResults.length === 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No matching code chunks were found.
          </div>
        )}

      {githubEmbeddingResults.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              Search Results
            </p>

            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">
              {githubEmbeddingResults.length} matches
            </span>
          </div>

          {githubEmbeddingResults.map((result) => (
            <button
              key={result.id}
              type="button"
            onClick={() => {
  if (githubRepositoryIndexId) {
    void loadGitHubRepositoryIndexFile(
      githubRepositoryIndexId,
      result.repositoryFileId
    );
  }
}}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs font-bold text-slate-800">
                    {result.path}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Lines {result.startLine}–{result.endLine}
                    {" · "}
                    Chunk {result.chunkIndex + 1}
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                  {(result.score * 100).toFixed(1)}% match
                </span>
              </div>

              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-[11px] leading-5 text-slate-200">
                <code>{result.content}</code>
              </pre>
            </button>
          ))}
        </div>
      )}
    </div>
  )}

                                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                                            Files in graph
                                          </p>
                                          <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                                            {githubRepositoryGraph.nodes.length}
                                          </span>
                                        </div>
                                        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                                          {githubRepositoryGraph.nodes.map(
                                            (node, index) => (
                                              <button
                                                key={node.id}
                                                type="button"
                                                onClick={() =>
                                                  setSelectedGitHubGraphNodeId(
                                                    node.id
                                                  )
                                                }
                                                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                                                  selectedGitHubGraphNodeId ===
                                                  node.id
                                                    ? "bg-violet-100 text-violet-900"
                                                    : "text-slate-600 hover:bg-slate-50"
                                                }`}
                                              >
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                                                  {index + 1}
                                                </span>
                                                <span className="min-w-0 break-all font-mono leading-4">
                                                  {node.path}
                                                </span>
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>

                                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                                            Relationships
                                          </p>
                                          <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                                            {githubRepositoryGraph.edges.length}
                                          </span>
                                        </div>
                                        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                                          {githubRepositoryGraph.edges.length ===
                                          0 ? (
                                            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                                              No local file-to-file relationships were detected.
                                            </p>
                                          ) : (
                                            githubRepositoryGraph.edges.map(
                                              (edge) => (
                                                <button
                                                  key={edge.id}
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedGitHubGraphNodeId(
                                                      edge.source
                                                    );
                                                  }}
                                                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                                                    selectedGitHubGraphNodeId ===
                                                      edge.source ||
                                                    selectedGitHubGraphNodeId ===
                                                      edge.target
                                                      ? "border-violet-300 bg-violet-50"
                                                      : "border-slate-100 bg-slate-50 hover:border-violet-200"
                                                  }`}
                                                >
                                                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-xs font-bold text-slate-700">
                                                    <span className="min-w-0 break-all font-mono leading-4">
                                                      {edge.sourcePath}
                                                    </span>
                                                    <ArrowRight
                                                      size={13}
                                                      className="mt-0.5 shrink-0 text-violet-500"
                                                    />
                                                    <span className="min-w-0 break-all font-mono leading-4">
                                                      {edge.targetPath}
                                                    </span>
                                                  </div>
                                                  <p className="mt-1 text-[11px] text-slate-500">
                                                    {edge.dependency} · {edge.relationshipType} · {edge.sourceRole} → {edge.targetRole}
                                                  </p>
                                                </button>
                                              )
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                )}
                            </div>
                          )}

                        {githubRepositoryIndexError && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {githubRepositoryIndexError}
                          </div>
                        )}

                        {githubRepositoryReviewError && (
  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    {githubRepositoryReviewError}
  </div>
)}

                        <div className="mt-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Repository description</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {selectedRepository.description || "No description provided by the repository owner."}
                          </p>
                        </div>

                        <div className="mt-5 border-t border-violet-200 pt-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-violet-950">
                              Repository tree
                            </p>
                            <p className="text-xs text-violet-700">
                              Files and folders available on the selected branch.
                            </p>
                          </div>

                          {githubRepositoryTree && !githubRepositoryTreeError && (
                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {githubRepositoryTree.entries.filter(
                                  (entry) => entry.type === "tree"
                                ).length} folders
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {githubRepositoryTree.entries.filter(
                                  (entry) => entry.type === "blob"
                                ).length} files
                              </span>
                              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">
                                {githubRepositoryTree.sourceFiles.length} source files
                              </span>
                            </div>
                          )}
                        </div>

                        {isLoadingGitHubRepositoryTree && (
                          <div className="mt-3 flex items-center justify-center rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
                            <RefreshCw
                              size={17}
                              className="mr-2 animate-spin"
                            />
                            Loading repository tree...
                          </div>
                        )}

                        {githubRepositoryTreeError && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {githubRepositoryTreeError}
                          </div>
                        )}

                        {!isLoadingGitHubRepositoryTree &&
                          !githubRepositoryTreeError &&
                          githubRepositoryTree && (
                            <>
                              {githubRepositoryTree.truncated && (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                                  GitHub returned a truncated repository tree. Some entries may not be displayed.
                                </div>
                              )}

                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                                <div className="border-b border-slate-800 bg-slate-900 px-4 py-3">
                                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                    Source files
                                  </p>
                                </div>

                                <div className="max-h-80 overflow-y-auto p-2">
                                  {githubRepositoryTree.sourceFiles.length === 0 ? (
                                    <p className="p-4 text-sm text-slate-400">
                                      No supported source files were found on this branch.
                                    </p>
                                  ) : (
                                    githubRepositoryTree.sourceFiles.map((entry) => (
                                      <div
                                        key={entry.path}
                                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-800"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate font-mono text-slate-200">
                                            {entry.path}
                                          </p>
                                        </div>
                                        {entry.size !== null && (
                                          <span className="shrink-0 text-xs text-slate-500">
                                            {entry.size.toLocaleString()} B
                                          </span>
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Workspace card */}
        <section className="overflow-hidden rounded-3xl border border-white bg-white/85 p-5 shadow-2xl shadow-slate-300/30 backdrop-blur sm:p-7">

          {/* Editor header */}
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Code2 size={25} />
              </div>

              <div>
                <h3 className="font-bold text-slate-900">
                  Select Language
                </h3>

                <p className="text-sm text-slate-500">
                  Choose the programming language for your
                  code
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                id="language"
                value={language}
                onChange={(event) =>
                  setLanguage(
                    event.target.value as ReviewLanguage
                  )
                }
                disabled={isReviewing || isFixing}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-56"
              >
                {languages.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                  >
                    {item.label}
                  </option>
                ))}
              </select>

              <div className="hidden items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 sm:flex">
                <CheckCircle2 size={17} />
                Ready to review
              </div>
            </div>
          </div>

          {/* Monaco editor */}
          <div className="overflow-hidden rounded-2xl border border-slate-700 shadow-xl">
            <CodeEditor
              code={code}
              language={language}
              onChange={setCode}
              highlightLine={highlightLine}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertTriangle
                size={20}
                className="mt-0.5 shrink-0"
              />

              <div>
                <p className="font-bold">
                  Review failed
                </p>

                <p className="mt-1 text-sm">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={handleReview}
              disabled={isReviewing || isFixing}
              className="group flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isReviewing ? (
                <>
                  <RefreshCw
                    size={19}
                    className="animate-spin"
                  />
                  <span>Reviewing...</span>
                </>
              ) : (
                <>
                  <Sparkles size={19} />

                  <span>Review Code</span>

                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={isReviewing || isFixing}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={18} />
              Clear
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={isReviewing || isFixing}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={18} />
              Reset
            </button>

            <button
              type="button"
              disabled
              title="Available after the AI review system is implemented."
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400"
            >
              <Bookmark size={18} />
              Save Review
            </button>
          </div>

          {/* Action descriptions */}
          <div className="mt-3 hidden grid-cols-4 text-center text-xs text-slate-400 lg:grid">
            <span>Send your code for AI analysis</span>
            <span>Remove all code</span>
            <span>Restore default code</span>
            <span>Available after review</span>
          </div>
        </section>

        {/* Review results */}
        {review && (
          <section className="mt-8">

            {/* Results header */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                  <Sparkles size={14} />
                  AI Review Complete
                </div>

                <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
                  Review Results
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Gemini analyzed your code for bugs,
                  security, performance, quality, and
                  complexity.
                </p>
              </div>

              {/* Overall score */}
              <div className="flex items-center gap-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 px-5 py-4 shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-violet-200 bg-white">
                  <span className="text-xl font-extrabold text-violet-700">
                    {review.overallScore}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-500">
                    Overall Score
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    Out of 100
                  </p>
                </div>
              </div>

              {/* Issue counter */}
              <div
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-sm ${
                  totalIssues > 0
                    ? "border border-red-200 bg-red-50 text-red-600"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {totalIssues > 0 ? (
                  <AlertTriangle size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}

                {totalIssues}{" "}
                {totalIssues === 1
                  ? "issue"
                  : "issues"}{" "}
                found
              </div>
            </div>

            {/* Issue category dashboard */}
            <div className="grid gap-4 md:grid-cols-2">
              <ReviewCategory
                title="Bugs"
                icon={<AlertTriangle size={20} />}
                issues={review.bugs}
                emptyMessage="No meaningful bugs detected."
                accent="red"
                expandedIssueKey={expandedIssueKey}
                onToggleIssue={(key) =>
                  setExpandedIssueKey(key)
                }
                onJumpToLine={(line) => {
                  setHighlightLine(line);
                  setExpandedIssueKey(null);
                }}
                onFixIssue={handleFixIssue}
                isFixing={isFixing}
                fixAction={fixAction}
              />

              <ReviewCategory
                title="Security"
                icon={<ShieldCheck size={20} />}
                issues={review.security}
                emptyMessage="No meaningful security issues detected."
                accent="orange"
                expandedIssueKey={expandedIssueKey}
                onToggleIssue={(key) =>
                  setExpandedIssueKey(key)
                }
                onJumpToLine={(line) => {
                  setHighlightLine(line);
                  setExpandedIssueKey(null);
                }}
                onFixIssue={handleFixIssue}
                isFixing={isFixing}
                fixAction={fixAction}
              />

              <ReviewCategory
                title="Performance"
                icon={<Zap size={20} />}
                issues={review.performance}
                emptyMessage="No meaningful performance issues detected."
                accent="blue"
                expandedIssueKey={expandedIssueKey}
                onToggleIssue={(key) =>
                  setExpandedIssueKey(key)
                }
                onJumpToLine={(line) => {
                  setHighlightLine(line);
                  setExpandedIssueKey(null);
                }}
                onFixIssue={handleFixIssue}
                isFixing={isFixing}
                fixAction={fixAction}
              />

              <ReviewCategory
                title="Code Quality"
                icon={<CheckCircle2 size={20} />}
                issues={review.codeQuality}
                emptyMessage="No meaningful code-quality issues detected."
                accent="violet"
                expandedIssueKey={expandedIssueKey}
                onToggleIssue={(key) =>
                  setExpandedIssueKey(key)
                }
                onJumpToLine={(line) => {
                  setHighlightLine(line);
                  setExpandedIssueKey(null);
                }}
                onFixIssue={handleFixIssue}
                isFixing={isFixing}
                fixAction={fixAction}
              />
            </div>

            {/* Complexity */}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Code2 size={20} />
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    Complexity Analysis
                  </h3>

                  <p className="text-sm text-slate-500">
                    Estimated computational complexity of
                    the submitted code
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Time Complexity
                  </p>

                  <p className="mt-2 text-xl font-extrabold text-slate-900">
                    {review.complexity.time}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Space Complexity
                  </p>

                  <p className="mt-2 text-xl font-extrabold text-slate-900">
                    {review.complexity.space}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Explanation
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {review.complexity.explanation}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* AI Fix Error */}
        {fixError && (
          <section className="mt-6">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  className="mt-0.5 shrink-0"
                />

                <div>
                  <p className="font-bold">
                    AI Fix Failed
                  </p>

                  <p className="mt-1 text-sm">
                    {fixError}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* AI Fix Loading */}
        {isFixing && (
          <section className="mt-6">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <div className="flex items-center gap-3 text-violet-700">
                <RefreshCw
                  size={20}
                  className="animate-spin"
                />

                <div>
                  <p className="font-bold">
                    AI is fixing the issue...
                  </p>

                  <p className="mt-1 text-sm text-violet-600">
                    Gemini is analyzing the issue and generating
                    corrected code.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* AI Fix Result */}
        {fixResult && fixComparison && (
          <section className="mt-6 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">

            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Sparkles size={21} />
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    AI Suggested Fix
                  </h3>

                  <p className="text-sm text-slate-500">
                    Gemini generated an improved version of your
                    code.
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-red-600">
                  <span className="h-3 w-3 rounded-sm bg-red-500/30" />
                  Removed / Replaced
                </span>

                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="h-3 w-3 rounded-sm bg-emerald-500/30" />
                  Added / Replaced
                </span>
              </div>

              {/* Accept Fix */}
              <button
                type="button"
                onClick={handleAcceptFix}
                disabled={!fixResult}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 size={17} />
                Accept Fix
              </button>

              {/* Reject Fix */}
              <button
                type="button"
                onClick={handleRejectFix}
                disabled={!fixResult}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={17} />
                Reject Fix
              </button>

              {/* Re-review Fixed Code */}
              <button
                type="button"
                onClick={handleReReviewFixedCode}
                disabled={!fixResult || isReviewing || isFixing}
                className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isReviewing ? (
                  <RefreshCw
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Sparkles size={17} />
                )}
                {isReviewing
                  ? "Re-reviewing..."
                  : "Re-review Fixed Code"}
              </button>
            </div>

            {/* Code Comparison */}
            <div className="mt-6">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Code Comparison
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Highlighted lines show exactly where the AI
                  changed the code.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
  {/* BEFORE */}
  <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-3">
      <div>
        <p className="text-sm font-bold text-red-700">
          Original Code
        </p>
        <p className="text-xs text-red-500">
          Before Fix
        </p>
      </div>

      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        Removed / Replaced
      </span>
    </div>

    <div className="h-72 overflow-y-auto bg-slate-950 p-4">
      <pre className="font-mono text-sm leading-6">
        {fixComparison?.before.map((line, index) => (
          <div
            key={`before-${index}`}
            className={
              line.changed
                ? "rounded-md bg-red-500/20 px-2 text-red-300"
                : "px-2 text-slate-300"
            }
          >
            <span className="mr-3 select-none text-slate-500">
              {line.changed ? "-" : " "}
            </span>
            {line.text || " "}
          </div>
        ))}
      </pre>
    </div>
  </div>

  {/* AFTER */}
  <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50 px-4 py-3">
      <div>
        <p className="text-sm font-bold text-emerald-700">
          Fixed Code
        </p>
        <p className="text-xs text-emerald-500">
          After Fix
        </p>
      </div>

      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        Added / Replaced
      </span>
    </div>

    <div className="h-72 overflow-y-auto bg-slate-950 p-4">
      <pre className="font-mono text-sm leading-6">
        {fixComparison?.after.map((line, index) => (
          <div
            key={`after-${index}`}
            className={
              line.changed
                ? "rounded-md bg-emerald-500/20 px-2 text-emerald-300"
                : "px-2 text-slate-300"
            }
          >
            <span className="mr-3 select-none text-slate-500">
              {line.changed ? "+" : " "}
            </span>
            {line.text || " "}
          </div>
        ))}
      </pre>
    </div>
  </div>
</div>
            </div>

            {/* Explanation */}
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                Explanation
              </p>

              <p className="mt-2 text-sm leading-6 text-blue-900">
                {fixResult.explanation}
              </p>
            </div>
          </section>
        )}

        {/* Footer quote */}
        <div className="py-8 text-center">
          <div className="inline-flex items-center gap-4 text-sm italic text-slate-400">
            <span className="h-px w-10 bg-slate-300" />

            <span>
              Clean code is easier to understand,
              maintain, and improve.
            </span>

            <span className="h-px w-10 bg-slate-300" />
          </div>
        </div>

        {/* Mobile logout */}
        <div className="pb-6 sm:hidden">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}

interface ReviewCategoryProps {
  title: string;
  icon: React.ReactNode;
  issues: CodeReviewResult["bugs"];
  emptyMessage: string;
  accent: "red" | "orange" | "blue" | "violet";
  expandedIssueKey: string | null;
  onToggleIssue: (key: string | null) => void;
  onJumpToLine: (line: number) => void;
  onFixIssue: (
    issue: CodeReviewResult["bugs"][number],
    action: FixAction
  ) => void;
  isFixing: boolean;
  fixAction: FixAction;
}

function ReviewCategory({
  title,
  icon,
  issues,
  emptyMessage,
  accent,
  expandedIssueKey,
  onToggleIssue,
  onJumpToLine,
  onFixIssue,
  isFixing,
  fixAction,
}: ReviewCategoryProps) {
  const hasIssues = issues.length > 0;

  const accentStyles = {
    red: {
      icon: "bg-red-100 text-red-600",
      border: "border-red-200",
      badge: "bg-red-50 text-red-700 border-red-200",
      header: "text-red-600",
      item: "border-red-200 bg-red-50/60",
    },
    orange: {
      icon: "bg-orange-100 text-orange-600",
      border: "border-orange-200",
      badge: "bg-orange-50 text-orange-700 border-orange-200",
      header: "text-orange-600",
      item: "border-orange-200 bg-orange-50/50",
    },
    blue: {
      icon: "bg-blue-100 text-blue-600",
      border: "border-blue-200",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
      header: "text-blue-600",
      item: "border-blue-200 bg-blue-50/50",
    },
    violet: {
      icon: "bg-violet-100 text-violet-600",
      border: "border-violet-200",
      badge: "bg-violet-50 text-violet-700 border-violet-200",
      header: "text-violet-600",
      item: "border-violet-200 bg-violet-50/50",
    },
  }[accent];

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        hasIssues
          ? accentStyles.border
          : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${accentStyles.icon}`}
          >
            {icon}
          </div>

          <div>
            <h3 className="font-bold text-slate-900">
              {title}
            </h3>

            <p
              className={`text-xs font-semibold ${
                hasIssues
                  ? accentStyles.header
                  : "text-slate-500"
              }`}
            >
              {issues.length}{" "}
              {issues.length === 1
                ? "finding"
                : "findings"}
            </p>
          </div>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
            hasIssues
              ? accentStyles.badge
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {hasIssues ? "Review" : "Clear"}
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={17} />
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {issues.map((issue, index) => {
            const issueKey = `${title}-${index}`;
            const isExpanded =
              expandedIssueKey === issueKey;

            return (
              <div
                key={issueKey}
                className={`overflow-hidden rounded-xl border ${accentStyles.item}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    onToggleIssue(
                      isExpanded ? null : issueKey
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/60"
                  aria-expanded={isExpanded}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-900">
                        {issue.title}
                      </h4>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-extrabold uppercase ${
                          issue.severity === "critical"
                            ? "bg-red-600 text-white"
                            : issue.severity === "high"
                              ? "bg-orange-500 text-white"
                              : issue.severity === "medium"
                                ? "border border-amber-200 bg-amber-50 text-amber-700"
                                : "border border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>

                    {issue.line !== null && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onJumpToLine(
                            issue.line as number
                          );
                        }}
                        className="mt-2 text-xs font-bold text-violet-600 underline decoration-violet-300 underline-offset-2 transition hover:text-violet-800"
                      >
                        Jump to line {issue.line}
                      </button>
                    )}
                  </div>

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-slate-500 shadow-sm">
                    {isExpanded ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/70 px-4 pb-4 pt-4">
                    <p className="text-sm leading-6 text-slate-600">
                      {issue.description}
                    </p>

                    {issue.suggestion && (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                          Suggested Solution
                        </p>

                        <p className="mt-1 text-sm leading-6 text-blue-900">
                          {issue.suggestion}
                        </p>
                      </div>
                    )}

                    {/* Phase 7: AI Code Actions */}
                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          size={17}
                          className="text-violet-600"
                        />

                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            AI Code Actions
                          </p>

                          <p className="text-xs text-slate-500">
                            Choose how you want Gemini to improve this code.
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onFixIssue(issue, "fix");
                          }}
                          disabled={isFixing}
                          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isFixing && fixAction === "fix" ? (
                            <RefreshCw
                              size={17}
                              className="animate-spin"
                            />
                          ) : (
                            <Sparkles size={17} />
                          )}

                          {isFixing && fixAction === "fix"
                            ? "Fixing..."
                            : "Fix this issue"}
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onFixIssue(issue, "optimize");
                          }}
                          disabled={isFixing}
                          className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isFixing && fixAction === "optimize" ? (
                            <RefreshCw
                              size={17}
                              className="animate-spin"
                            />
                          ) : (
                            <Zap size={17} />
                          )}

                          {isFixing && fixAction === "optimize"
                            ? "Optimizing..."
                            : "Optimize code"}
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onFixIssue(issue, "refactor");
                          }}
                          disabled={isFixing}
                          className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isFixing && fixAction === "refactor" ? (
                            <RefreshCw
                              size={17}
                              className="animate-spin"
                            />
                          ) : (
                            <RefreshCw size={17} />
                          )}

                          {isFixing && fixAction === "refactor"
                            ? "Refactoring..."
                            : "Refactor code"}
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onFixIssue(issue, "alternative");
                          }}
                          disabled={isFixing}
                          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isFixing && fixAction === "alternative" ? (
                            <RefreshCw
                              size={17}
                              className="animate-spin"
                            />
                          ) : (
                            <Code2 size={17} />
                          )}

                          {isFixing && fixAction === "alternative"
                            ? "Generating..."
                            : "Alternative implementation"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkspacePage;