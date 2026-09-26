import mongoose from "mongoose";
import RepositoryFile from "../models/RepositoryFile";

const KEYWORD_INDEX_NAME =
  "repository_file_keyword_index";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export interface RepositoryKeywordSearchResult {
  id: string;
  path: string;
  language: string | null;
  extension: string;
  content: string;
  score: number;
}

export const searchRepositoryKeywords = async (
  repositoryIndexId: string,
  userId: string,
  query: string,
  requestedLimit?: number
): Promise<RepositoryKeywordSearchResult[]> => {
  if (!mongoose.isValidObjectId(repositoryIndexId)) {
    throw new Error("Invalid repository index ID.");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid user ID.");
  }

  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Keyword search query is required.");
  }

  const limit = Math.min(
    Math.max(requestedLimit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const repositoryIndexObjectId =
    new mongoose.Types.ObjectId(repositoryIndexId);

  const userObjectId =
    new mongoose.Types.ObjectId(userId);

  const results = await RepositoryFile.aggregate([
    {
      $search: {
        index: KEYWORD_INDEX_NAME,
        compound: {
          must: [
            {
              text: {
                query: normalizedQuery,
                path: [
                  "path",
                  "content",
                  "language",
                  "extension",
                  "parsedData.imports",
                  "parsedData.exports",
                  "parsedData.functions",
                  "parsedData.classes",
                  "parsedData.dependencies",
                ],
              },
            },
          ],
          filter: [
            {
              equals: {
                path: "repositoryIndexId",
                value: repositoryIndexObjectId,
              },
            },
            {
              equals: {
                path: "userId",
                value: userObjectId,
              },
            },
            {
              equals: {
                path: "status",
                value: "completed",
              },
            },
          ],
        },
      },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 1,
        path: 1,
        language: 1,
        extension: 1,
        content: 1,
        score: {
          $meta: "searchScore",
        },
      },
    },
  ]);

  return results.map((result) => ({
    id: result._id.toString(),
    path: result.path,
    language: result.language ?? null,
    extension: result.extension,
    content: result.content,
    score: result.score,
  }));
};