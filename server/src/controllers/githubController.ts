import { Request, Response, NextFunction } from "express";
import GitHubConnection from "../models/GitHubConnection";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { startRepositoryIndex } from "../services/repositoryIndexService";
import RepositoryIndex from "../models/RepositoryIndex";
import { searchRepositoryEmbeddings } from "../services/repositoryEmbeddingSearchService";
import {
  retrieveRepositoryContext,
} from "../services/repositoryRetrievalService";
import { AppError } from "../errors/AppError";
import {
  createGitHubOAuthData,
  exchangeGitHubCode,
  getGitHubBranches,
  getGitHubRepositories,
  getGitHubRepositoryTree,
  getGitHubUser,
  verifyGitHubOAuthState,
} from "../services/githubService";

import RepositoryFile from "../models/RepositoryFile";
import RepositoryRelationship from "../models/RepositoryRelationship";
import RepositoryEmbedding from "../models/RepositoryEmbedding";
import {
  generateRepositoryAnswer,
} from "../services/repositoryChatService";

import {
  buildRepositoryLLMContext,
} from "../services/repositoryLLMContextService";

import {
  buildRepositoryReviewContext,
} from "../services/repositoryReviewService";

import {
  analyzeRepositoryWithAI,
} from "../services/repositoryReviewAIService";

import { memoryCache } from "../utils/cache";
import mongoose from "mongoose";
const getClientUrl = (): string => {
  return process.env.CLIENT_URL || "https://code-reviewer-frontend-7s0w.onrender.com";
};

export const connectGitHub = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const {
      state,
      codeVerifier,
      authorizationUrl,
    } = createGitHubOAuthData(req.userId);

    res.cookie("githubOAuthState", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    res.cookie("githubOAuthVerifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(authorizationUrl);
  } catch (error) {
    next(error);
  }
};

export const githubCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (
      typeof code !== "string" ||
      typeof state !== "string"
    ) {
      throw new AppError(
        "GitHub authorization response is invalid.",
        400,
        "GITHUB_CALLBACK_INVALID"
      );
    }

    const storedState = req.cookies?.githubOAuthState;
    const codeVerifier =
      req.cookies?.githubOAuthVerifier;

    if (!storedState || !codeVerifier) {
      throw new AppError(
        "GitHub authentication session expired. Please try again.",
        400,
        "GITHUB_OAUTH_SESSION_EXPIRED"
      );
    }

    if (storedState !== state) {
      throw new AppError(
        "GitHub authentication state is invalid.",
        400,
        "GITHUB_OAUTH_STATE_MISMATCH"
      );
    }

    const statePayload =
      verifyGitHubOAuthState(state);

    res.clearCookie("githubOAuthState");
    res.clearCookie("githubOAuthVerifier");

    const tokenData = await exchangeGitHubCode(
      code,
      codeVerifier
    );

    const githubUser = await getGitHubUser(
      tokenData.accessToken
    );

    await GitHubConnection.findOneAndUpdate(
      {
        userId: statePayload.userId,
      },
      {
        userId: statePayload.userId,
        githubUserId: githubUser.id,
        githubUsername: githubUser.username,
        githubName: githubUser.name,
        githubAvatarUrl: githubUser.avatarUrl,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        accessTokenExpiresAt:
          tokenData.accessTokenExpiresAt,
        refreshTokenExpiresAt:
          tokenData.refreshTokenExpiresAt,
        scope: tokenData.scope,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    res.redirect(
      `${getClientUrl()}/workspace?github=connected`
    );
  } catch (error) {
    res.clearCookie("githubOAuthState");
    res.clearCookie("githubOAuthVerifier");

    const clientUrl = getClientUrl();

    if (error instanceof AppError) {
      res.redirect(
        `${clientUrl}/workspace?github=error`
      );
      return;
    }

    next(error);
  }
};

export const getRepositories = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const connection =
  await GitHubConnection.findOne({
    userId: req.userId,
  }).select("+accessToken");

    if (!connection) {
      throw new AppError(
        "GitHub account is not connected.",
        400,
        "GITHUB_NOT_CONNECTED"
      );
    }

    const repositories =
      await getGitHubRepositories(
        connection.accessToken
      );

    res.status(200).json({
      success: true,
      message:
        "GitHub repositories retrieved successfully.",
      repositories,
    });
  } catch (error) {
    next(error);
  }
};

export const getBranches = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const ownerParam = req.params.owner;
    const repositoryParam = req.params.repository;

    const owner = Array.isArray(ownerParam)
      ? ownerParam[0]
      : ownerParam;

    const repository = Array.isArray(repositoryParam)
      ? repositoryParam[0]
      : repositoryParam;

    if (!owner || !repository) {
      throw new AppError(
        "Repository owner and name are required.",
        400,
        "GITHUB_REPOSITORY_REQUIRED"
      );
    }

  const connection =
  await GitHubConnection.findOne({
    userId: req.userId,
  }).select("+accessToken");

    if (!connection) {
      throw new AppError(
        "GitHub account is not connected.",
        400,
        "GITHUB_NOT_CONNECTED"
      );
    }

    const branches = await getGitHubBranches(
      connection.accessToken,
      owner,
      repository
    );

    res.status(200).json({
      success: true,
      message: "GitHub branches retrieved successfully.",
      branches,
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryTree = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const ownerParam = req.params.owner;
    const repositoryParam = req.params.repository;
    const branchParam = req.query.branch;

    const owner = Array.isArray(ownerParam)
      ? ownerParam[0]
      : ownerParam;

    const repository = Array.isArray(repositoryParam)
      ? repositoryParam[0]
      : repositoryParam;

   const branch =
  typeof branchParam === "string"
    ? branchParam
    : Array.isArray(branchParam) &&
        typeof branchParam[0] === "string"
      ? branchParam[0]
      : undefined;

    if (!owner || !repository || !branch) {
      throw new AppError(
        "Repository owner, name, and branch are required.",
        400,
        "GITHUB_TREE_PARAMETERS_REQUIRED"
      );
    }

  const connection =
  await GitHubConnection.findOne({
    userId: req.userId,
  }).select("+accessToken");

    if (!connection) {
      throw new AppError(
        "GitHub account is not connected.",
        400,
        "GITHUB_NOT_CONNECTED"
      );
    }

    const tree = await getGitHubRepositoryTree(
      connection.accessToken,
      owner,
      repository,
      branch
    );

    res.status(200).json({
      success: true,
      message: "GitHub repository tree retrieved successfully.",
      tree,
    });
  } catch (error) {
    next(error);
  }
};
export const startRepositoryIndexing = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const ownerParam = req.params.owner;
    const repositoryParam = req.params.repository;
    const branchParam = req.body?.branch;

    const owner = Array.isArray(ownerParam)
      ? ownerParam[0]
      : ownerParam;

    const repository = Array.isArray(repositoryParam)
      ? repositoryParam[0]
      : repositoryParam;

    const branch =
      typeof branchParam === "string"
        ? branchParam
        : undefined;

    const repositoryId = req.body?.githubRepositoryId;

    if (
      !owner ||
      !repository ||
      !branch ||
      typeof repositoryId !== "number"
    ) {
      throw new AppError(
        "Repository owner, name, branch, and repository ID are required.",
        400,
        "GITHUB_INDEX_PARAMETERS_REQUIRED"
      );
    }

    const repositoryFullName = `${owner}/${repository}`;

    const result = await startRepositoryIndex({
      userId: req.userId,
      githubRepositoryId: repositoryId,
      repositoryName: repository,
      repositoryFullName,
      owner,
      branch,
    });

    res.status(200).json({
      success: true,
      message: "Repository indexing completed successfully.",
      indexId: result.indexId,
      status: result.status,
      tree: result.tree,
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryIndexStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }
const cacheKey = `repository-index-status:${req.userId}:${indexId}`;

const cachedIndex =
  memoryCache.get<typeof RepositoryIndex.prototype>(
    cacheKey
  );

if (cachedIndex) {
  res.status(200).json({
    success: true,
    message:
      "Repository index status retrieved successfully.",
    index: {
      id: cachedIndex._id.toString(),
      status: cachedIndex.status,
      repositoryName:
        cachedIndex.repositoryName,
      repositoryFullName:
        cachedIndex.repositoryFullName,
      branch: cachedIndex.branch,

      totalEntries:
        cachedIndex.totalEntries,

      sourceFileCount:
        cachedIndex.sourceFileCount,

      skippedFileCount:
        cachedIndex.skippedFileCount,

      processedFileCount:
        cachedIndex.processedFileCount,

      completedFileCount:
        cachedIndex.completedFileCount,

      failedFileCount:
        cachedIndex.failedFileCount,

      treeTruncated:
        cachedIndex.treeTruncated,

      startedAt:
        cachedIndex.startedAt,

      completedAt:
        cachedIndex.completedAt,

      errorMessage:
        cachedIndex.errorMessage,
    },
  });

  return;
}

const repositoryIndex =
  await RepositoryIndex.findOne({
    _id: indexId,
    userId: req.userId,
  });

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }
memoryCache.set(
  cacheKey,
  repositoryIndex,
  1000
);

    res.status(200).json({
      success: true,
      message: "Repository index status retrieved successfully.",
      index: {
        id: repositoryIndex._id.toString(),
        status: repositoryIndex.status,
        repositoryName:
          repositoryIndex.repositoryName,
        repositoryFullName:
          repositoryIndex.repositoryFullName,
        branch: repositoryIndex.branch,

        totalEntries:
          repositoryIndex.totalEntries,

        sourceFileCount:
          repositoryIndex.sourceFileCount,

        skippedFileCount:
          repositoryIndex.skippedFileCount,

        processedFileCount:
          repositoryIndex.processedFileCount,

        completedFileCount:
          repositoryIndex.completedFileCount,

        failedFileCount:
          repositoryIndex.failedFileCount,

        treeTruncated:
          repositoryIndex.treeTruncated,

        startedAt:
          repositoryIndex.startedAt,

        completedAt:
          repositoryIndex.completedAt,

        errorMessage:
          repositoryIndex.errorMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryIndexFiles = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const pageParam = req.query.page;
    const limitParam = req.query.limit;

    const pageValue =
      typeof pageParam === "string"
        ? Number(pageParam)
        : Array.isArray(pageParam) && typeof pageParam[0] === "string"
          ? Number(pageParam[0])
          : 1;

    const limitValue =
      typeof limitParam === "string"
        ? Number(limitParam)
        : Array.isArray(limitParam) && typeof limitParam[0] === "string"
          ? Number(limitParam[0])
          : 50;

    const page =
      Number.isInteger(pageValue) && pageValue > 0
        ? pageValue
        : 1;

    const limit =
      Number.isInteger(limitValue) &&
      limitValue > 0 &&
      limitValue <= 100
        ? limitValue
        : 50;

    const skip = (page - 1) * limit;

    const fileFilter = {
      repositoryIndexId: indexId,
      userId: req.userId,
    };

    const [files, total] = await Promise.all([
      RepositoryFile.find(fileFilter)
        .select(
          "path sha size extension language status errorMessage parsedData parsedAt"
        )
        .sort({ path: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RepositoryFile.countDocuments(fileFilter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Repository index files retrieved successfully.",
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryIndexFile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;
    const fileIdParam = req.params.fileId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    const fileId = Array.isArray(fileIdParam)
      ? fileIdParam[0]
      : fileIdParam;

    if (!indexId || !fileId) {
      throw new AppError(
        "Repository index ID and file ID are required.",
        400,
        "REPOSITORY_INDEX_FILE_PARAMETERS_REQUIRED"
      );
    }

    const file = await RepositoryFile.findOne({
      _id: fileId,
      repositoryIndexId: indexId,
      userId: req.userId,
    })
      .select(
        "path sha size extension language content status errorMessage parsedData parsedAt"
      )
      .lean();

    if (!file) {
      throw new AppError(
        "Repository file was not found.",
        404,
        "REPOSITORY_FILE_NOT_FOUND"
      );
    }

    res.status(200).json({
      success: true,
      message: "Repository file retrieved successfully.",
      file,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewRepository = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    if (!mongoose.isValidObjectId(indexId)) {
  throw new AppError(
    "Repository index ID is invalid.",
    400,
    "INVALID_REPOSITORY_INDEX_ID"
  );
}

    const repositoryIndex = await RepositoryIndex.findOne({
      _id: indexId,
      userId: req.userId,
    })
      .select(
        "_id repositoryName repositoryFullName branch status"
      )
      .lean();

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }

    if (repositoryIndex.status !== "completed") {
      throw new AppError(
        "Repository indexing must be completed before starting a review.",
        400,
        "REPOSITORY_INDEX_NOT_COMPLETED"
      );
    }

   const reviewCacheKey =
  `repository-review:${req.userId}:${indexId}`;

const cachedReview =
  memoryCache.get<{
    review: Awaited<
      ReturnType<typeof analyzeRepositoryWithAI>
    >;
    reviewContext: Awaited<
      ReturnType<typeof buildRepositoryReviewContext>
    >;
  }>(reviewCacheKey);

let review;
let reviewContext;

if (cachedReview) {
  review = cachedReview.review;
  reviewContext =
    cachedReview.reviewContext;
} else {
  reviewContext =
    await buildRepositoryReviewContext(
      indexId,
      req.userId
    );

  review =
    await analyzeRepositoryWithAI(
      reviewContext
    );

  memoryCache.set(
    reviewCacheKey,
    {
      review,
      reviewContext,
    },
    5 * 60 * 1000
  );
}

    res.status(200).json({
      success: true,
      message:
        "Repository-wide AI review completed successfully.",

      review: {
        repository: reviewContext.repository,

        repositoryHealth:
          review.repositoryHealth,

        issues:
          review.issues,

        overview:
          review.overview,

        analyzedFiles:
          review.analyzedFiles.length > 0
            ? review.analyzedFiles
            : reviewContext.files.map(
                (file) => file.path
              ),

        limitations:
          review.limitations,

        statistics:
          reviewContext.statistics,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryEmbeddingStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const repositoryIndex = await RepositoryIndex.findOne({
      _id: indexId,
      userId: req.userId,
    })
      .select("_id")
      .lean();

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }

    const [
      totalChunks,
      completedChunks,
      failedChunks,
      pendingChunks,
    ] = await Promise.all([
      RepositoryEmbedding.countDocuments({
        repositoryIndexId: indexId,
        userId: req.userId,
      }),
      RepositoryEmbedding.countDocuments({
        repositoryIndexId: indexId,
        userId: req.userId,
        status: "completed",
      }),
      RepositoryEmbedding.countDocuments({
        repositoryIndexId: indexId,
        userId: req.userId,
        status: "failed",
      }),
      RepositoryEmbedding.countDocuments({
        repositoryIndexId: indexId,
        userId: req.userId,
        status: "pending",
      }),
    ]);

    const embeddingFiles = await RepositoryEmbedding.distinct(
      "repositoryFileId",
      {
        repositoryIndexId: indexId,
        userId: req.userId,
      }
    );

    const sampleEmbedding = await RepositoryEmbedding.findOne({
      repositoryIndexId: indexId,
      userId: req.userId,
      status: "completed",
    })
      .select("embeddingModel dimensions")
      .lean();

    const status =
      totalChunks === 0
        ? "not_started"
        : failedChunks > 0 && completedChunks === 0
          ? "failed"
          : completedChunks === totalChunks
            ? "completed"
            : "processing";

    res.status(200).json({
      success: true,
      message: "Repository embedding status retrieved successfully.",
      embeddings: {
        status,
        filesWithEmbeddings: embeddingFiles.length,
        totalChunks,
        completedChunks,
        failedChunks,
        pendingChunks,
        embeddingModel:
          sampleEmbedding?.embeddingModel ?? null,
        dimensions:
          sampleEmbedding?.dimensions ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const searchRepositoryEmbeddingsController = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const { query, limit } = req.body;

    if (typeof query !== "string" || !query.trim()) {
      throw new AppError(
        "Search query is required.",
        400,
        "SEARCH_QUERY_REQUIRED"
      );
    }

    let parsedLimit: number | undefined;

    if (limit !== undefined) {
      if (
        typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20
      ) {
        throw new AppError(
          "Limit must be an integer between 1 and 20.",
          400,
          "INVALID_SEARCH_LIMIT"
        );
      }

      parsedLimit = limit;
    }

    const results = await searchRepositoryEmbeddings(
      indexId,
      req.userId,
      query,
      parsedLimit
    );

    res.status(200).json({
      success: true,
      message: "Repository similarity search completed successfully.",
      query: query.trim(),
      results,
    });
  } catch (error) {
    next(error);
  }
};

export const getRepositoryIndexGraph = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const repositoryIndex = await RepositoryIndex.findOne({
      _id: indexId,
      userId: req.userId,
    })
      .select("_id")
      .lean();

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }

    const [files, relationships] = await Promise.all([
      RepositoryFile.find({
        repositoryIndexId: indexId,
        userId: req.userId,
      })
        .select("_id path language extension status")
        .sort({ path: 1 })
        .lean(),

      RepositoryRelationship.find({
        repositoryIndexId: indexId,
        userId: req.userId,
      })
        .select(
          "_id sourceFileId targetFileId sourcePath targetPath dependency relationshipType sourceRole targetRole"
        )
        .sort({ sourcePath: 1, targetPath: 1 })
        .lean(),
    ]);

    const nodes = files.map((file) => ({
      id: file._id.toString(),
      path: file.path,
      language: file.language,
      extension: file.extension,
      status: file.status,
    }));

    const edges = relationships.map((relationship) => ({
      id: relationship._id.toString(),
      source: relationship.sourceFileId.toString(),
      target: relationship.targetFileId.toString(),
      sourcePath: relationship.sourcePath,
      targetPath: relationship.targetPath,
      dependency: relationship.dependency,
      relationshipType: relationship.relationshipType,
      sourceRole: relationship.sourceRole,
      targetRole: relationship.targetRole,
    }));

    res.status(200).json({
      success: true,
      message: "Repository dependency graph retrieved successfully.",
      graph: {
        nodes,
        edges,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const searchRepositoryRetrieval = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const query =
      typeof req.body?.query === "string"
        ? req.body.query.trim()
        : "";

    if (!query) {
      throw new AppError(
        "Repository search query is required.",
        400,
        "REPOSITORY_SEARCH_QUERY_REQUIRED"
      );
    }

    const requestedLimit =
      req.body?.limit === undefined
        ? undefined
        : Number(req.body.limit);

    if (
      requestedLimit !== undefined &&
      (!Number.isInteger(requestedLimit) ||
        requestedLimit < 1 ||
        requestedLimit > 20)
    ) {
      throw new AppError(
        "Limit must be an integer between 1 and 20.",
        400,
        "INVALID_SEARCH_LIMIT"
      );
    }

    const repositoryIndex =
      await RepositoryIndex.findOne({
        _id: indexId,
        userId: req.userId,
      })
        .select("_id")
        .lean();

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }

   const retrievalContext =
  await retrieveRepositoryContext(
    indexId,
    req.userId,
    query,
    requestedLimit !== undefined
      ? { limit: requestedLimit }
      : {}
  );

    res.status(200).json({
      success: true,
      message:
        "Repository retrieval completed successfully.",
      retrieval: retrievalContext,
    });
  } catch (error) {
    next(error);
  }
};

export const chatWithRepository = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const indexIdParam = req.params.indexId;

    const indexId = Array.isArray(indexIdParam)
      ? indexIdParam[0]
      : indexIdParam;

    if (!indexId) {
      throw new AppError(
        "Repository index ID is required.",
        400,
        "REPOSITORY_INDEX_ID_REQUIRED"
      );
    }

    const query =
      typeof req.body?.query === "string"
        ? req.body.query.trim()
        : "";

    if (!query) {
      throw new AppError(
        "Repository question is required.",
        400,
        "REPOSITORY_QUESTION_REQUIRED"
      );
    }

    const repositoryIndex =
      await RepositoryIndex.findOne({
        _id: indexId,
        userId: req.userId,
      })
        .select("_id")
        .lean();

    if (!repositoryIndex) {
      throw new AppError(
        "Repository index was not found.",
        404,
        "REPOSITORY_INDEX_NOT_FOUND"
      );
    }

    const retrievalContext =
      await retrieveRepositoryContext(
        indexId,
        req.userId,
        query,
        {
          limit: 5,
        }
      );

    const llmContext =
      buildRepositoryLLMContext(
        retrievalContext
      );

    const answer =
      await generateRepositoryAnswer(
        llmContext
      );

    res.status(200).json({
      success: true,
      message:
        "Repository AI answer generated successfully.",
      chat: {
        question: query,
        answer: answer.answer,
        sources: answer.sources,
      },
    });
  } catch (error) {
    next(error);
  }
};