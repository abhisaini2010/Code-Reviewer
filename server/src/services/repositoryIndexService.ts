import mongoose from "mongoose";
import RepositoryIndex from "../models/RepositoryIndex";
import GitHubConnection from "../models/GitHubConnection";
import {
  getGitHubRepositoryTree,
  type GitHubRepositoryTree,
} from "./githubService";
import { ingestRepositoryFiles } from "./repositoryFileService";
import { jobQueue } from "./jobQueueService";

interface StartRepositoryIndexInput {
  userId: string;
  githubRepositoryId: number;
  repositoryName: string;
  repositoryFullName: string;
  owner: string;
  branch: string;
}

export const startRepositoryIndex = async (
  input: StartRepositoryIndexInput
): Promise<{
  indexId: string;
  status: string;
  tree: GitHubRepositoryTree;
}> => {
  const {
    userId,
    githubRepositoryId,
    repositoryName,
    repositoryFullName,
    owner,
    branch,
  } = input;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID.");
  }

  if (
  !Number.isInteger(githubRepositoryId) ||
  githubRepositoryId <= 0
) {
  throw new Error("Invalid GitHub repository ID.");
}

if (
  typeof repositoryName !== "string" ||
  repositoryName.trim().length === 0 ||
  repositoryName.trim().length > 200
) {
  throw new Error("Invalid repository name.");
}

if (
  typeof repositoryFullName !== "string" ||
  repositoryFullName.trim().length === 0 ||
  repositoryFullName.trim().length > 400
) {
  throw new Error("Invalid repository full name.");
}

if (
  typeof owner !== "string" ||
  owner.trim().length === 0 ||
  owner.trim().length > 200
) {
  throw new Error("Invalid repository owner.");
}

if (
  typeof branch !== "string" ||
  branch.trim().length === 0 ||
  branch.length > 255
) {
  throw new Error("Invalid repository branch.");
}

 const connection = await GitHubConnection.findOne({
  userId,
}).select("+accessToken");

  if (!connection) {
    throw new Error("GitHub account is not connected.");
  }

  let repositoryIndex = await RepositoryIndex.findOne({
    userId,
    githubRepositoryId,
    branch,
  });

  if (!repositoryIndex) {
    repositoryIndex = await RepositoryIndex.create({
      userId,
      githubRepositoryId,
      repositoryName,
      repositoryFullName,
      owner,
      branch,
      totalEntries: 0,
      sourceFileCount: 0,
      skippedFileCount: 0,
      treeTruncated: false,
      processedFileCount: 0,
      completedFileCount: 0,
      failedFileCount: 0,
      status: "pending",
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });
  } else {
    // Keep the existing index so RepositoryFile SHA values can be compared
    // against the latest GitHub tree for incremental indexing.
    repositoryIndex.repositoryName = repositoryName;
    repositoryIndex.repositoryFullName = repositoryFullName;
    repositoryIndex.owner = owner;
  }

  repositoryIndex.status = "processing";
  repositoryIndex.startedAt = new Date();
  repositoryIndex.completedAt = null;
  repositoryIndex.errorMessage = null;
  repositoryIndex.processedFileCount = 0;
  repositoryIndex.completedFileCount = 0;
  repositoryIndex.failedFileCount = 0;

  await repositoryIndex.save();

  try {
    const tree = await getGitHubRepositoryTree(
      connection.accessToken,
      owner,
      repositoryName,
      branch
    );

    repositoryIndex.totalEntries = tree.entries.length;
    repositoryIndex.sourceFileCount = tree.sourceFiles.length;
    repositoryIndex.skippedFileCount = Math.max(
      tree.entries.length - tree.sourceFiles.length,
      0
    );
    repositoryIndex.treeTruncated = tree.truncated;

    await repositoryIndex.save();

jobQueue.enqueue(
  `repository-index:${userId}:${repositoryIndex._id.toString()}`,
  async () => {
    try {
      await ingestRepositoryFiles({
        userId,
        repositoryIndexId:
          repositoryIndex._id.toString(),
      });
    } catch (error) {
      console.error(
        "[Repository Index] Background ingestion failed:",
        error
      );

      try {
        await RepositoryIndex.findOneAndUpdate(
          {
            _id: repositoryIndex._id,
            userId,
          },
          {
            status: "failed",
            completedAt: null,
            errorMessage:
              error instanceof Error
                ? error.message
                : "Repository indexing failed.",
          }
        );
      } catch (statusError) {
        console.error(
          "[Repository Index] Failed to update background error status:",
          statusError
        );
      }
    }
  }
);

return {
  indexId: repositoryIndex._id.toString(),
  status: "processing",
  tree,
};
    
  } catch (error) {
    repositoryIndex.status = "failed";
    repositoryIndex.completedAt = null;
    repositoryIndex.errorMessage =
      error instanceof Error
        ? error.message
        : "Repository indexing failed.";

    await repositoryIndex.save();

    throw error;
  }
};
