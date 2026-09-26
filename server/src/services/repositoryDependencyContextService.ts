import mongoose from "mongoose";
import RepositoryRelationship from "../models/RepositoryRelationship";

export interface RepositoryDependencyContextFile {
  fileId: string;
  path: string;
  role: string;
  relationshipType: string;
  dependency: string;
  direction: "dependency";
}

export interface RepositoryDependencyContext {
  sourceFileId: string;
  sourcePath: string;
  dependencies: RepositoryDependencyContextFile[];
}

export const getRepositoryDependencyContext = async (
  repositoryIndexId: string,
  userId: string,
  sourceFileIds: string[]
): Promise<RepositoryDependencyContext[]> => {
  if (!mongoose.isValidObjectId(repositoryIndexId)) {
    throw new Error("Invalid repository index ID.");
  }

  if (!mongoose.isValidObjectId(userId)) {
    throw new Error("Invalid user ID.");
  }

  const validSourceFileIds = sourceFileIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validSourceFileIds.length === 0) {
    return [];
  }

  const relationships =
    await RepositoryRelationship.find({
      repositoryIndexId:
        new mongoose.Types.ObjectId(repositoryIndexId),

      userId:
        new mongoose.Types.ObjectId(userId),

      sourceFileId: {
        $in: validSourceFileIds,
      },
    })
      .select(
        "sourceFileId sourcePath targetFileId targetPath dependency targetRole relationshipType"
      )
      .sort({
        sourcePath: 1,
        targetPath: 1,
      })
      .lean();

  const contextMap = new Map<
    string,
    RepositoryDependencyContext
  >();

  for (const relationship of relationships) {
    const sourceFileId =
      relationship.sourceFileId.toString();

    let context = contextMap.get(sourceFileId);

    if (!context) {
      context = {
        sourceFileId,
        sourcePath: relationship.sourcePath,
        dependencies: [],
      };

      contextMap.set(sourceFileId, context);
    }

    context.dependencies.push({
      fileId:
        relationship.targetFileId.toString(),

      path: relationship.targetPath,

      role:
        relationship.targetRole,

      relationshipType:
        relationship.relationshipType,

      dependency:
        relationship.dependency,

      direction: "dependency",
    });
  }

  return Array.from(contextMap.values());
};