import { Router } from "express";

import {
  connectGitHub,
  getBranches,
  getRepositoryTree,
  getRepositoryIndexStatus,
  getRepositories,
  githubCallback,
  getRepositoryIndexFiles,
  getRepositoryIndexFile,
  getRepositoryIndexGraph,
  getRepositoryEmbeddingStatus,
  startRepositoryIndexing,
  reviewRepository,
   searchRepositoryEmbeddingsController,
   chatWithRepository
} from "../controllers/githubController";

import { authMiddleware } from "../middleware/authMiddleware";

import {
  aiRateLimiter,
} from "../middleware/rateLimit.middleware";

import { generateRepositoryTests } from "../controllers/repositoryTestController";

const router = Router();

router.get(
  "/connect",
  authMiddleware,
  connectGitHub
);

router.get(
  "/callback",
  githubCallback
);

router.get(
  "/repositories",
  authMiddleware,
  getRepositories
);

router.get(
  "/repositories/:owner/:repository/branches",
  authMiddleware,
  getBranches
);

router.get(
  "/repositories/:owner/:repository/tree",
  authMiddleware,
  getRepositoryTree
);

router.post(
  "/repositories/:owner/:repository/index",
  authMiddleware,
  startRepositoryIndexing
);

router.get(
  "/repositories/index/:indexId",
  authMiddleware,
  getRepositoryIndexStatus
);

router.get(
  "/repositories/index/:indexId/files",
  authMiddleware,
  getRepositoryIndexFiles
);

router.get(
  "/repositories/index/:indexId/files/:fileId",
  authMiddleware,
  getRepositoryIndexFile
);

router.get(
  "/repositories/index/:indexId/graph",
  authMiddleware,
  getRepositoryIndexGraph
);

router.get(
  "/repositories/index/:indexId/embeddings/status",
  authMiddleware,
  getRepositoryEmbeddingStatus
);
router.post(
  "/repositories/index/:indexId/embeddings/search",
  authMiddleware,
  searchRepositoryEmbeddingsController
);

router.post(
  "/repositories/index/:indexId/review",
  authMiddleware,
  aiRateLimiter,
  reviewRepository
);

router.post(
  "/repositories/index/:indexId/files/:fileId/tests",
  authMiddleware,
  aiRateLimiter,
  generateRepositoryTests
);
router.post(
  "/repositories/index/:indexId/chat",
  authMiddleware,
  aiRateLimiter,
  chatWithRepository
);



export default router;