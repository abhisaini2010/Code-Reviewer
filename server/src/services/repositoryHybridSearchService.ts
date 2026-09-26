import {
  searchRepositoryEmbeddings,
} from "./repositoryEmbeddingSearchService";
import {
  searchRepositoryKeywords,
  type RepositoryKeywordSearchResult,
} from "./repositoryKeywordSearchService";

import {
  searchRepositoryMetadata,
  type RepositoryMetadataSearchOptions,
  type RepositoryMetadataSearchResult,
} from "./repositoryMetadataSearchService";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

const SEMANTIC_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

export interface RepositoryHybridSearchOptions {
  metadata?: RepositoryMetadataSearchOptions;
  limit?: number;
}

export interface RepositoryHybridSearchResult {
  id: string;
  repositoryFileId: string;
  path: string;
  language: string | null;
  extension: string;

  content: string;

  startLine: number | null;
  endLine: number | null;

  semanticScore: number;
  keywordScore: number;
  metadataMatch: boolean;

  semanticMatch: boolean;
  keywordMatch: boolean;

  finalScore: number;
}

interface Candidate {
  id: string;
  repositoryFileId: string;

  path: string;
  language: string | null;
  extension: string;

  content: string;

  startLine: number | null;
  endLine: number | null;

  semanticScore: number;
  keywordScore: number;

  metadataMatch: boolean;

  semanticMatch: boolean;
  keywordMatch: boolean;
}

const normalizeScore = (
  score: number,
  maxScore: number
): number => {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }

  if (maxScore <= 0) {
    return 0;
  }

  return score / maxScore;
};

export const searchRepositoryHybrid = async (
  repositoryIndexId: string,
  userId: string,
  query: string,
  options: RepositoryHybridSearchOptions = {}
): Promise<RepositoryHybridSearchResult[]> => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Hybrid search query is required.");
  }

  const limit = Math.min(
    Math.max(
      options.limit ?? DEFAULT_LIMIT,
      1
    ),
    MAX_LIMIT
  );

  const retrievalLimit = Math.min(
    Math.max(limit * 2, 10),
    MAX_LIMIT
  );

 let semanticResults: Awaited<
  ReturnType<typeof searchRepositoryEmbeddings>
> = [];

let keywordResults: Awaited<
  ReturnType<typeof searchRepositoryKeywords>
> = [];

const [semanticResult, keywordResult] =
  await Promise.allSettled([
    searchRepositoryEmbeddings(
      repositoryIndexId,
      userId,
      normalizedQuery,
      retrievalLimit
    ),

    searchRepositoryKeywords(
      repositoryIndexId,
      userId,
      normalizedQuery,
      retrievalLimit
    ),
  ]);

if (semanticResult.status === "fulfilled") {
  semanticResults = semanticResult.value;
} else {
  console.warn(
    "[Hybrid Search] Semantic search unavailable. Continuing with keyword and metadata retrieval."
  );
}

if (keywordResult.status === "fulfilled") {
  keywordResults = keywordResult.value;
} else {
  console.warn(
    "[Hybrid Search] Keyword search unavailable. Continuing with semantic and metadata retrieval."
  );
}

  const metadataResults =
    await searchRepositoryMetadata(
      repositoryIndexId,
      userId,
      {
        ...(options.metadata ?? {}),
        limit: retrievalLimit,
      }
    );

  const semanticMaxScore = Math.max(
    ...semanticResults.map(
      (result) => result.score
    ),
    0
  );

  const keywordMaxScore = Math.max(
    ...keywordResults.map(
      (result) => result.score
    ),
    0
  );

  const candidates = new Map<
    string,
    Candidate
  >();

  const getOrCreateCandidate = (
    id: string,
    repositoryFileId: string,
    path: string,
    language: string | null,
    extension: string,
    content: string,
    startLine: number | null,
    endLine: number | null
  ): Candidate => {
    const existing = candidates.get(
      repositoryFileId
    );

    if (existing) {
      return existing;
    }

    const candidate: Candidate = {
      id,
      repositoryFileId,
      path,
      language,
      extension,
      content,
      startLine,
      endLine,
      semanticScore: 0,
      keywordScore: 0,
      metadataMatch: false,
      semanticMatch: false,
      keywordMatch: false,
    };

    candidates.set(
      repositoryFileId,
      candidate
    );

    return candidate;
  };

  for (const result of semanticResults) {
    const candidate =
      getOrCreateCandidate(
        result.id,
        result.repositoryFileId,
        result.path,
        null,
        "",
        result.content,
        result.startLine,
        result.endLine
      );

    candidate.semanticScore =
      Math.max(
        candidate.semanticScore,
        normalizeScore(
          result.score,
          semanticMaxScore
        )
      );

    candidate.semanticMatch = true;
  }

  for (const result of keywordResults) {
    const candidate =
      getOrCreateCandidate(
        result.id,
        result.id,
        result.path,
        result.language,
        result.extension,
        result.content,
        null,
        null
      );

    candidate.keywordScore =
      Math.max(
        candidate.keywordScore,
        normalizeScore(
          result.score,
          keywordMaxScore
        )
      );

    candidate.keywordMatch = true;

    if (!candidate.language) {
      candidate.language =
        result.language;
    }

    if (!candidate.extension) {
      candidate.extension =
        result.extension;
    }

    if (!candidate.content) {
      candidate.content =
        result.content;
    }
  }

  for (const result of metadataResults) {
    const candidate =
      candidates.get(result.id);

    if (!candidate) {
      continue;
    }

    candidate.metadataMatch = true;

    if (!candidate.language) {
      candidate.language =
        result.language;
    }

    if (!candidate.extension) {
      candidate.extension =
        result.extension;
    }
  }

  const rankedResults =
    Array.from(candidates.values())
      .map((candidate) => {
        let finalScore =
          candidate.semanticScore *
            SEMANTIC_WEIGHT +
          candidate.keywordScore *
            KEYWORD_WEIGHT;

        if (
          candidate.semanticMatch &&
          candidate.keywordMatch
        ) {
          finalScore += 0.1;
        }

        if (candidate.metadataMatch) {
          finalScore += 0.05;
        }

        return {
          ...candidate,
          finalScore,
        };
      })
      .sort(
        (a, b) =>
          b.finalScore -
          a.finalScore
      )
      .slice(0, limit)
      .map(
        (
          candidate
        ): RepositoryHybridSearchResult => ({
          id: candidate.id,
          repositoryFileId:
            candidate.repositoryFileId,
          path: candidate.path,
          language:
            candidate.language,
          extension:
            candidate.extension,
          content:
            candidate.content,
          startLine:
            candidate.startLine,
          endLine:
            candidate.endLine,
          semanticScore:
            candidate.semanticScore,
          keywordScore:
            candidate.keywordScore,
          metadataMatch:
            candidate.metadataMatch,
          semanticMatch:
            candidate.semanticMatch,
          keywordMatch:
            candidate.keywordMatch,
          finalScore:
            candidate.finalScore,
        })
      );

  return rankedResults;
};