import { Response, NextFunction } from "express";

import RepositoryFile from "../models/RepositoryFile";
import RepositoryIndex from "../models/RepositoryIndex";
import {
  AuthenticatedRequest,
} from "../middleware/authMiddleware";
import { AppError } from "../errors/AppError";
import {
  generateRepositoryTestsWithAI,
} from "../services/repositoryTestAIService";
import mongoose from "mongoose";

export const generateRepositoryTests = async (
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
    "REPOSITORY_TEST_PARAMETERS_REQUIRED"
  );
}

if (
  !mongoose.isValidObjectId(indexId) ||
  !mongoose.isValidObjectId(fileId)
) {
  throw new AppError(
    "Repository index ID or file ID is invalid.",
    400,
    "INVALID_REPOSITORY_TEST_PARAMETERS"
  );
}

    const repositoryIndex = await RepositoryIndex.findOne({
      _id: indexId,
      userId: req.userId,
    })
      .select("_id status")
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
        "Repository indexing must be completed before generating tests.",
        400,
        "REPOSITORY_INDEX_NOT_COMPLETED"
      );
    }

    const file = await RepositoryFile.findOne({
      _id: fileId,
      repositoryIndexId: indexId,
      userId: req.userId,
      status: "completed",
    })
      .select(
        "path language extension content parsedData"
      )
      .lean();

    if (!file) {
      throw new AppError(
        "Indexed source file was not found.",
        404,
        "REPOSITORY_SOURCE_FILE_NOT_FOUND"
      );
    }

    const result =
      await generateRepositoryTestsWithAI({
        filePath: file.path,
        language: file.language,
        extension: file.extension,
        content: file.content,
        parsedData: file.parsedData,
      });

    res.status(200).json({
      success: true,
      message: "Tests generated successfully.",
      tests: result,
    });
  } catch (error) {
    next(error);
  }
};
