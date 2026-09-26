import mongoose from "mongoose";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embeddingAI,
} from "../config/embedding";
import RepositoryEmbedding from "../models/RepositoryEmbedding";

const VECTOR_INDEX_NAME = "repository_embedding_vector_index";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

interface RepositoryEmbeddingSearchResult {
  id: string;
  repositoryFileId: string;
  path: string;
  chunkIndex: number;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}

const QUERY_EMBEDDING_MAX_RETRIES = 3;
const QUERY_EMBEDDING_BASE_DELAY_MS = 1000;

const sleep = async (
  milliseconds: number
): Promise<void> => {
  await new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
};

const isRetryableEmbeddingError = (
  error: unknown
): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const possibleError = error as {
    status?: number;
    message?: string;
  };

  if (possibleError.status === 429) {
    return true;
  }

  return (
    possibleError.message?.includes(
      "RESOURCE_EXHAUSTED"
    ) ?? false
  );
};

const generateQueryEmbedding = async (
  query: string
): Promise<number[]> => {
  for (
    let attempt = 0;
    attempt <= QUERY_EMBEDDING_MAX_RETRIES;
    attempt += 1
  ) {
    try {
      const response =
        await embeddingAI.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: query,
          config: {
            taskType: "RETRIEVAL_QUERY",
            outputDimensionality:
              EMBEDDING_DIMENSIONS,
          },
        });

      const embedding =
        response.embeddings?.[0]?.values;

      if (
        !embedding ||
        embedding.length !==
          EMBEDDING_DIMENSIONS
      ) {
        throw new Error(
          `Invalid query embedding returned by ${EMBEDDING_MODEL}.`
        );
      }

      return embedding;
    } catch (error) {
      const canRetry =
        isRetryableEmbeddingError(error) &&
        attempt < QUERY_EMBEDDING_MAX_RETRIES;

      if (!canRetry) {
        throw error;
      }

      const exponentialDelay =
        QUERY_EMBEDDING_BASE_DELAY_MS *
        2 ** attempt;

      const jitter =
        Math.floor(Math.random() * 500);

      const delay =
        exponentialDelay + jitter;

      console.warn(
        `[Embeddings] Query embedding rate limited. ` +
          `Retrying in ${delay}ms ` +
          `(attempt ${attempt + 1}/${QUERY_EMBEDDING_MAX_RETRIES}).`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    "Unable to generate repository query embedding."
  );
};

export const searchRepositoryEmbeddings = async (
  repositoryIndexId: string,
  userId: string,
  query: string,
  requestedLimit?: number
): Promise<RepositoryEmbeddingSearchResult[]> => {
  if (!mongoose.isValidObjectId(repositoryIndexId)) {
    throw new Error("Invalid repository index ID.");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid user ID.");
  }

  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Search query is required.");
  }

  const limit = Math.min(
    Math.max(requestedLimit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const numCandidates = Math.max(limit * 20, 100);

  const queryEmbedding = await generateQueryEmbedding(normalizedQuery);

  const repositoryIndexObjectId =
    new mongoose.Types.ObjectId(repositoryIndexId);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const results = await RepositoryEmbedding.aggregate(
    [
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates,
          limit,
          filter: {
            repositoryIndexId: repositoryIndexObjectId,
            userId: userObjectId,
          },
        },
      },
      {
        $match: {
          status: "completed",
        },
      },
      {
        $project: {
          _id: 1,
          repositoryFileId: 1,
          path: 1,
          chunkIndex: 1,
          content: 1,
          startLine: 1,
          endLine: 1,
          score: {
            $meta: "vectorSearchScore",
          },
        },
      },
    ] as any[]
  );

  return results.map((result) => ({
    id: result._id.toString(),
    repositoryFileId: result.repositoryFileId.toString(),
    path: result.path,
    chunkIndex: result.chunkIndex,
    content: result.content,
    startLine: result.startLine,
    endLine: result.endLine,
    score: result.score,
  }));
};