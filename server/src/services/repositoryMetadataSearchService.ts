import mongoose from "mongoose";
import RepositoryFile from "../models/RepositoryFile";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface RepositoryMetadataSearchOptions {
  repositoryFileIds?: string[];
  paths?: string[];
  language?: string;
  extension?: string;
  branch?: string;
  githubRepositoryId?: number;
  limit?: number;
}

export interface RepositoryMetadataSearchResult {
  id: string;
  path: string;
  language: string | null;
  extension: string;
  branch: string;
  githubRepositoryId: number;
  size: number;
  status: string;
}

export const searchRepositoryMetadata = async (
  repositoryIndexId: string,
  userId: string,
  options: RepositoryMetadataSearchOptions = {}
): Promise<RepositoryMetadataSearchResult[]> => {
  if (!mongoose.isValidObjectId(repositoryIndexId)) {
    throw new Error("Invalid repository index ID.");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid user ID.");
  }

  const repositoryIndexObjectId =
    new mongoose.Types.ObjectId(repositoryIndexId);

  const userObjectId =
    new mongoose.Types.ObjectId(userId);

  const filter: Record<string, unknown> = {
    repositoryIndexId: repositoryIndexObjectId,
    userId: userObjectId,
    status: "completed",
  };

  if (options.repositoryFileIds?.length) {
    const validFileIds = options.repositoryFileIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validFileIds.length === 0) {
      return [];
    }

    filter._id = {
      $in: validFileIds,
    };
  }

  if (options.paths?.length) {
    filter.path = {
      $in: options.paths,
    };
  }

  if (options.language?.trim()) {
    filter.language = options.language.trim();
  }

  if (options.extension?.trim()) {
    const normalizedExtension =
      options.extension.trim().toLowerCase();

    filter.extension = normalizedExtension.startsWith(".")
      ? normalizedExtension
      : `.${normalizedExtension}`;
  }

  if (options.branch?.trim()) {
    filter.branch = options.branch.trim();
  }

  if (
    options.githubRepositoryId !== undefined
  ) {
    filter.githubRepositoryId =
      options.githubRepositoryId;
  }

  const limit = Math.min(
    Math.max(
      options.limit ?? DEFAULT_LIMIT,
      1
    ),
    MAX_LIMIT
  );

  const files = await RepositoryFile.find(filter)
    .select(
      "_id path language extension branch githubRepositoryId size status"
    )
    .sort({ path: 1 })
    .limit(limit)
    .lean();

  return files.map((file) => ({
    id: file._id.toString(),
    path: file.path,
    language: file.language ?? null,
    extension: file.extension,
    branch: file.branch,
    githubRepositoryId: file.githubRepositoryId,
    size: file.size,
    status: file.status,
  }));
};