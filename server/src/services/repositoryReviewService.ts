import RepositoryIndex from "../models/RepositoryIndex";
import RepositoryFile from "../models/RepositoryFile";
import RepositoryRelationship from "../models/RepositoryRelationship";

const MAX_FILE_CONTENT_LENGTH = 7000;
const MAX_DEPENDENCIES_PER_FILE = 12;

export interface RepositoryReviewFile {
  fileId: string;
  path: string;
  language: string | null;
  extension: string;
  content: string;
  parsedData: {
    totalLines: number;
    nonEmptyLines: number;
    commentLines: number;
    importCount: number;
    exportCount: number;
    functionCount: number;
    classCount: number;
    dependencyCount: number;
    imports: string[];
    exports: string[];
    functions: string[];
    classes: string[];
    dependencies: string[];
  } | null;
}

export interface RepositoryReviewDependency {
  sourceFileId: string;
  sourcePath: string;
  targetFileId: string;
  targetPath: string;
  dependency: string;
  sourceRole: string;
  targetRole: string;
  relationshipType: string;
}

export interface RepositoryReviewContext {
  repository: {
    indexId: string;
    name: string;
    fullName: string;
    branch: string;
    totalEntries: number;
    sourceFileCount: number;
    completedFileCount: number;
    failedFileCount: number;
  };

  files: RepositoryReviewFile[];

  dependencies: RepositoryReviewDependency[];

  statistics: {
    totalFiles: number;
    totalLines: number;
    totalFunctions: number;
    totalClasses: number;
    totalImports: number;
    totalExports: number;
    totalDependencies: number;
    relationshipCount: number;
  };
}

const trimContent = (content: string): string => {
  if (content.length <= MAX_FILE_CONTENT_LENGTH) {
    return content;
  }

  return `${content.slice(
    0,
    MAX_FILE_CONTENT_LENGTH
  )}\n\n[File content truncated for repository review context]`;
};

export const buildRepositoryReviewContext = async (
  repositoryIndexId: string,
  userId: string
): Promise<RepositoryReviewContext> => {
  const repositoryIndex = await RepositoryIndex.findOne({
    _id: repositoryIndexId,
    userId,
  })
    .select(
      "_id repositoryName repositoryFullName branch totalEntries sourceFileCount completedFileCount failedFileCount status"
    )
    .lean();

  if (!repositoryIndex) {
    throw new Error("Repository index was not found.");
  }

  if (repositoryIndex.status !== "completed") {
    throw new Error(
      "Repository indexing must be completed before starting a repository-wide review."
    );
  }

  const [files, relationships] = await Promise.all([
    RepositoryFile.find({
      repositoryIndexId,
      userId,
      status: "completed",
    })
      .select(
        "_id path language extension content parsedData"
      )
      .lean(),

    RepositoryRelationship.find({
      repositoryIndexId,
      userId,
    })
      .select(
        "sourceFileId targetFileId sourcePath targetPath dependency sourceRole targetRole relationshipType"
      )
      .sort({
        sourcePath: 1,
        targetPath: 1,
      })
      .lean(),
  ]);

  if (files.length === 0) {
    throw new Error(
      "No completed repository files are available for review."
    );
  }

  const relationshipCountByFile =
    new Map<string, number>();

  for (const relationship of relationships) {
    const sourceId =
      relationship.sourceFileId.toString();

    relationshipCountByFile.set(
      sourceId,
      (relationshipCountByFile.get(sourceId) ?? 0) + 1
    );
  }

  const sortedFiles = [...files].sort(
    (a, b) => {
      const dependencyDifference =
        (relationshipCountByFile.get(
          b._id.toString()
        ) ?? 0) -
        (relationshipCountByFile.get(
          a._id.toString()
        ) ?? 0);

      if (dependencyDifference !== 0) {
        return dependencyDifference;
      }

      const parsedDependencyDifference =
        (b.parsedData?.dependencyCount ?? 0) -
        (a.parsedData?.dependencyCount ?? 0);

      if (parsedDependencyDifference !== 0) {
        return parsedDependencyDifference;
      }

      return a.path.localeCompare(b.path);
    }
  );

  const reviewFiles: RepositoryReviewFile[] =
    sortedFiles.map((file) => ({
      fileId: file._id.toString(),
      path: file.path,
      language: file.language,
      extension: file.extension,
      content: trimContent(file.content),
      parsedData: file.parsedData
        ? {
            totalLines:
              file.parsedData.totalLines,
            nonEmptyLines:
              file.parsedData.nonEmptyLines,
            commentLines:
              file.parsedData.commentLines,
            importCount:
              file.parsedData.importCount,
            exportCount:
              file.parsedData.exportCount,
            functionCount:
              file.parsedData.functionCount,
            classCount:
              file.parsedData.classCount,
            dependencyCount:
              file.parsedData.dependencyCount,
            imports:
              file.parsedData.imports,
            exports:
              file.parsedData.exports,
            functions:
              file.parsedData.functions,
            classes:
              file.parsedData.classes,
            dependencies:
              file.parsedData.dependencies,
          }
        : null,
    }));

  const reviewDependencies: RepositoryReviewDependency[] =
    relationships.map((relationship) => ({
      sourceFileId:
        relationship.sourceFileId.toString(),

      sourcePath:
        relationship.sourcePath,

      targetFileId:
        relationship.targetFileId.toString(),

      targetPath:
        relationship.targetPath,

      dependency:
        relationship.dependency,

      sourceRole:
        relationship.sourceRole,

      targetRole:
        relationship.targetRole,

      relationshipType:
        relationship.relationshipType,
    }));

  const totalLines = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.totalLines ?? 0),
    0
  );

  const totalFunctions = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.functionCount ?? 0),
    0
  );

  const totalClasses = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.classCount ?? 0),
    0
  );

  const totalImports = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.importCount ?? 0),
    0
  );

  const totalExports = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.exportCount ?? 0),
    0
  );

  const totalDependencies = reviewFiles.reduce(
    (total, file) =>
      total +
      (file.parsedData?.dependencyCount ?? 0),
    0
  );

  return {
    repository: {
      indexId: repositoryIndex._id.toString(),
      name: repositoryIndex.repositoryName,
      fullName:
        repositoryIndex.repositoryFullName,
      branch: repositoryIndex.branch,
      totalEntries:
        repositoryIndex.totalEntries,
      sourceFileCount:
        repositoryIndex.sourceFileCount,
      completedFileCount:
        repositoryIndex.completedFileCount,
      failedFileCount:
        repositoryIndex.failedFileCount,
    },

    files: reviewFiles,

  dependencies: (() => {
  const prioritizedFileIds = new Set(
    reviewFiles.map((file) => file.fileId)
  );

  const prioritizedDependencies =
    reviewDependencies.filter(
      (dependency) =>
        prioritizedFileIds.has(
          dependency.sourceFileId
        ) ||
        prioritizedFileIds.has(
          dependency.targetFileId
        )
    );

  return prioritizedDependencies.slice(
    0,
    MAX_DEPENDENCIES_PER_FILE *
      Math.max(reviewFiles.length, 1)
  );
})(),

    statistics: {
      totalFiles: reviewFiles.length,
      totalLines,
      totalFunctions,
      totalClasses,
      totalImports,
      totalExports,
      totalDependencies,
      relationshipCount:
        reviewDependencies.length,
    },
  };
};