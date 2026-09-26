import path from "node:path";

import RepositoryIndex from "../models/RepositoryIndex";
import RepositoryFile, {
  type IRepositoryFileParsedData,
} from "../models/RepositoryFile";
import RepositoryRelationship from "../models/RepositoryRelationship";
import { generateRepositoryEmbeddings } from "./repositoryEmbeddingService";
import GitHubConnection from "../models/GitHubConnection";
import {
  getGitHubRepositoryTree,
  getGitHubFileContent,
} from "./githubService";

const languageByExtension: Record<string, string> = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".py": "Python",
  ".java": "Java",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".cc": "C++",
  ".cxx": "C++",
  ".hpp": "C++",
  ".cs": "C#",
  ".go": "Go",
  ".rs": "Rust",
  ".php": "PHP",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".sql": "SQL",
  ".r": "R",
  ".dart": "Dart",
  ".vue": "Vue",
  ".svelte": "Svelte",
    ".html": "HTML",
  ".css": "CSS",

};

const BATCH_SIZE = 5;

const SOURCE_FILE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".php",
  ".rb",
  ".swift",
  ".kt",
  ".kts",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".r",
  ".dart",
  ".vue",
  ".svelte",
    ".html",
  ".css",
];

const getExtension = (filePath: string): string => {
  return path.extname(filePath).toLowerCase();
};

const getLanguage = (extension: string): string | null => {
  return languageByExtension[extension] ?? null;
};

const unique = (items: string[]): string[] => {
  return Array.from(new Set(items));
};

const getLineCount = (content: string): number => {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
};

const getNonEmptyLineCount = (lines: string[]): number => {
  return lines.filter((line) => line.trim().length > 0).length;
};

const getCommentLineCount = (
  lines: string[],
  language: string | null
): number => {
  let count = 0;
  let insideBlockComment = false;

  const supportsHashComments =
    language === "Python" ||
    language === "Ruby" ||
    language === "Shell" ||
    language === "R";

  const supportsSqlComments = language === "SQL";

  for (const line of lines) {
    const trimmed = line.trim();

    if (insideBlockComment) {
      count += 1;

      if (trimmed.includes("*/")) {
        insideBlockComment = false;
      }

      continue;
    }

    if (
      trimmed.startsWith("/*") ||
      trimmed.startsWith("<!--")
    ) {
      count += 1;

      if (
        !trimmed.includes("*/") &&
        !trimmed.includes("-->")
      ) {
        insideBlockComment = true;
      }

      continue;
    }

    if (trimmed.startsWith("//")) {
      count += 1;
      continue;
    }

    if (supportsHashComments && trimmed.startsWith("#")) {
      count += 1;
      continue;
    }

    if (supportsSqlComments && trimmed.startsWith("--")) {
      count += 1;
    }
  }

  return count;
};

const collectRegexMatches = (
  content: string,
  pattern: RegExp
): string[] => {
  const values: string[] = [];

  for (const match of content.matchAll(pattern)) {
    const value = match[1];

    if (value) {
      values.push(value.trim());
    }
  }

  return unique(values);
};

const parseImports = (
  content: string,
  language: string | null
): string[] => {
  if (
    language === "JavaScript" ||
    language === "TypeScript" ||
    language === "Vue" ||
    language === "Svelte"
  ) {
    return unique([
      ...collectRegexMatches(
        content,
        /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g
      ),
      ...collectRegexMatches(
        content,
        /\bimport\s*["']([^"']+)["']/g
      ),
      ...collectRegexMatches(
        content,
        /\brequire\(\s*["']([^"']+)["']\s*\)/g
      ),
    ]);
  }

  if (language === "Python") {
    return unique([
      ...collectRegexMatches(
        content,
        /^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)/gm
      ),
      ...collectRegexMatches(
        content,
        /^\s*from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+/gm
      ),
    ]);
  }

  if (
    language === "Java" ||
    language === "Kotlin" ||
    language === "Scala"
  ) {
    return collectRegexMatches(
      content,
      /^\s*import\s+([A-Za-z0-9_.$]+)/gm
    );
  }

  if (language === "C" || language === "C++") {
    return collectRegexMatches(
      content,
      /^\s*#include\s*[<"]([^>"]+)[>"]/gm
    );
  }

  if (language === "C#") {
    return collectRegexMatches(
      content,
      /^\s*using\s+([A-Za-z0-9_.]+)/gm
    );
  }

  if (language === "Go") {
    return unique([
      ...collectRegexMatches(
        content,
        /^\s*import\s+"([^"]+)"/gm
      ),
      ...collectRegexMatches(
        content,
        /^\s*(?:[A-Za-z_][A-Za-z0-9_]*\s+)?["']([^"']+)["']/gm
      ),
    ]);
  }

  if (language === "Rust") {
    return collectRegexMatches(
      content,
      /^\s*(?:use|extern\s+crate)\s+([^;]+)/gm
    );
  }

  if (language === "PHP") {
    return collectRegexMatches(
      content,
      /^\s*(?:use|require|require_once|include|include_once)\s+(?:\(?\s*)?["']?([^"'\s;)]+)["']?/gm
    );
  }

  if (language === "Ruby") {
    return collectRegexMatches(
      content,
      /^\s*(?:require|require_relative)\s+["']([^"']+)["']/gm
    );
  }

  if (language === "Swift") {
    return collectRegexMatches(
      content,
      /^\s*import\s+([A-Za-z0-9_.]+)/gm
    );
  }

  if (language === "Shell") {
    return collectRegexMatches(
      content,
      /^\s*(?:source|\.)\s+["']?([^"'\s]+)["']?/gm
    );
  }

  if (language === "R") {
    return collectRegexMatches(
      content,
      /^\s*(?:library|require)\s*\(\s*["']?([A-Za-z0-9_.-]+)/gm
    );
  }

  if (language === "Dart") {
    return collectRegexMatches(
      content,
      /^\s*import\s+["']([^"']+)["']/gm
    );
  }

  return [];
};

const parseExports = (
  content: string,
  language: string | null
): string[] => {
  if (
    language !== "JavaScript" &&
    language !== "TypeScript" &&
    language !== "Vue" &&
    language !== "Svelte"
  ) {
    return [];
  }

  const values: string[] = [
    ...collectRegexMatches(
      content,
      /\bexport\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    ),
    ...collectRegexMatches(
      content,
      /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    ),
  ];

  for (const match of content.matchAll(
    /\bexport\s*\{([^}]+)\}/g
  )) {
    const group = match[1];

    if (!group) {
      continue;
    }

    for (const item of group.split(",")) {
      const name = item
        .trim()
        .split(/\s+as\s+/i)[0]
        ?.trim();

      if (name) {
        values.push(name);
      }
    }
  }

  return unique(values);
};

const parseFunctions = (
  content: string,
  language: string | null
): string[] => {
  const patterns: RegExp[] = [];

  if (
    language === "JavaScript" ||
    language === "TypeScript" ||
    language === "Vue" ||
    language === "Svelte"
  ) {
    patterns.push(
      /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      /\b(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g
    );
  } else if (language === "Python") {
    patterns.push(
      /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm
    );
  } else if (language === "Java") {
    patterns.push(
      /\b(?:public|private|protected|static|final|synchronized|abstract)\s+[\w<>\[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/g
    );
  } else if (language === "C" || language === "C++") {
    patterns.push(
      /\b[A-Za-z_][A-Za-z0-9_:<>\s*&]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*\{/g
    );
  } else if (language === "C#") {
    patterns.push(
      /\b(?:public|private|protected|internal|static|async|virtual|override|sealed)\s+[\w<>\[\],.?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:\{|=>)/g
    );
  } else if (language === "Go") {
    patterns.push(
      /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    );
  } else if (language === "Rust") {
    patterns.push(
      /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g
    );
  } else if (language === "PHP") {
    patterns.push(
      /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    );
  } else if (language === "Ruby") {
    patterns.push(
      /^\s*def\s+([A-Za-z_][A-Za-z0-9_!?=]*)/gm
    );
  } else if (language === "Swift") {
    patterns.push(
      /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g
    );
  } else if (language === "Kotlin") {
    patterns.push(
      /\bfun\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g
    );
  } else if (language === "Scala") {
    patterns.push(
      /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*\(/g
    );
  } else if (language === "Dart") {
    patterns.push(
      /\b(?:Future<[^>]+>|void|dynamic|[A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*\{/g
    );
  }

  const values: string[] = [];

  for (const pattern of patterns) {
    values.push(...collectRegexMatches(content, pattern));
  }

  return unique(values);
};

const parseClasses = (
  content: string,
  language: string | null
): string[] => {
  const values: string[] = [];

  if (language === "Python") {
    values.push(
      ...collectRegexMatches(
        content,
        /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/gm
      )
    );
  } else {
    values.push(
      ...collectRegexMatches(
        content,
        /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g
      )
    );
  }

  if (
    language === "Java" ||
    language === "Kotlin" ||
    language === "C#"
  ) {
    values.push(
      ...collectRegexMatches(
        content,
        /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g
      )
    );
  }

  return unique(values);
};

const parseDependencies = (
  imports: string[],
  language: string | null
): string[] => {
  if (imports.length === 0) {
    return [];
  }

  const normalizeJavaScriptDependency = (value: string): string => {
    const trimmed = value.trim();

    if (
      trimmed.startsWith(".") ||
      trimmed.startsWith("/") ||
      trimmed.startsWith("@/")
    ) {
      return trimmed;
    }

    if (trimmed.startsWith("@")) {
      const parts = trimmed.split("/");
      return parts.length >= 2
        ? `${parts[0]}/${parts[1]}`
        : trimmed;
    }

    return trimmed.split("/")[0] ?? trimmed;
  };

  const normalizePythonDependency = (value: string): string => {
    return value.trim().split(".")[0] ?? value.trim();
  };

  const normalizeJavaDependency = (value: string): string => {
    const parts = value.trim().split(".");
    return parts.length >= 2
      ? `${parts[0]}.${parts[1]}`
      : value.trim();
  };

  const normalizeDependency = (value: string): string => {
    if (
      language === "JavaScript" ||
      language === "TypeScript" ||
      language === "Vue" ||
      language === "Svelte"
    ) {
      return normalizeJavaScriptDependency(value);
    }

    if (language === "Python") {
      return normalizePythonDependency(value);
    }

    if (
      language === "Java" ||
      language === "Kotlin" ||
      language === "Scala"
    ) {
      return normalizeJavaDependency(value);
    }

    return value.trim();
  };

  return unique(
    imports
      .map(normalizeDependency)
      .filter((dependency) => dependency.length > 0)
  );
};

const resolveLocalDependencyPath = (
  sourcePath: string,
  dependency: string,
  indexedPaths: Set<string>
): string | null => {
  const trimmedDependency = dependency.trim();

  if (
    !trimmedDependency.startsWith(".") &&
    !trimmedDependency.startsWith("/")
  ) {
    return null;
  }

  const normalizedDependency = path.posix.normalize(
    trimmedDependency.startsWith("/")
      ? trimmedDependency.slice(1)
      : path.posix.join(
          path.posix.dirname(sourcePath),
          trimmedDependency
        )
  );

  const candidates: string[] = [normalizedDependency];

  const dependencyExtension = path.posix.extname(normalizedDependency);

  if (!dependencyExtension) {
    for (const extension of SOURCE_FILE_EXTENSIONS) {
      candidates.push(`${normalizedDependency}${extension}`);
    }

    for (const extension of SOURCE_FILE_EXTENSIONS) {
      candidates.push(
        `${normalizedDependency}/index${extension}`
      );
    }
  }

  for (const candidate of candidates) {
    if (indexedPaths.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

type RepositoryFileRole =
  | "component"
  | "service"
  | "api"
  | "controller"
  | "model"
  | "other";

const detectRepositoryFileRole = (filePath: string): RepositoryFileRole => {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const searchable = `${segments.join("/")} ${fileName}`;

  if (/(^|\/)components?(\/|$)/.test(normalized) || /component/.test(fileName)) {
    return "component";
  }

  if (/(^|\/)services?(\/|$)/.test(normalized) || /service/.test(fileName)) {
    return "service";
  }

  if (/(^|\/)(api|routes?)(\/|$)/.test(normalized) || /api/.test(fileName)) {
    return "api";
  }

  if (/(^|\/)controllers?(\/|$)/.test(normalized) || /controller/.test(fileName)) {
    return "controller";
  }

  if (/(^|\/)models?(\/|$)/.test(normalized) || /model/.test(fileName)) {
    return "model";
  }

  void searchable;
  return "other";
};

const getArchitecturalRelationshipType = (
  sourceRole: RepositoryFileRole,
  targetRole: RepositoryFileRole
): string => {
  if (sourceRole === "other" || targetRole === "other") {
    return "import";
  }

  return `${sourceRole}_to_${targetRole}`;
};

const buildRepositoryRelationships = async (
  repositoryIndexId: string,
  userId: string
): Promise<number> => {
  const indexedFiles = await RepositoryFile.find({
    repositoryIndexId,
    userId,
    status: "completed",
  })
    .select("_id path parsedData")
    .lean();

  const indexedPaths = new Set(
    indexedFiles.map((file) => file.path)
  );

  const filesByPath = new Map(
    indexedFiles.map((file) => [file.path, file])
  );

  const relationships: Array<{
    repositoryIndexId: string;
    userId: string;
    sourceFileId: unknown;
    targetFileId: unknown;
    sourcePath: string;
    targetPath: string;
    dependency: string;
    sourceRole: RepositoryFileRole;
    targetRole: RepositoryFileRole;
    relationshipType: string;
  }> = [];

  for (const sourceFile of indexedFiles) {
    const dependencies = sourceFile.parsedData?.dependencies ?? [];

    for (const dependency of dependencies) {
      const targetPath = resolveLocalDependencyPath(
        sourceFile.path,
        dependency,
        indexedPaths
      );

      if (!targetPath || targetPath === sourceFile.path) {
        continue;
      }

      const targetFile = filesByPath.get(targetPath);

      if (!targetFile) {
        continue;
      }

      const sourceRole = detectRepositoryFileRole(sourceFile.path);
      const targetRole = detectRepositoryFileRole(targetPath);

      relationships.push({
        repositoryIndexId,
        userId,
        sourceFileId: sourceFile._id,
        targetFileId: targetFile._id,
        sourcePath: sourceFile.path,
        targetPath,
        dependency,
        sourceRole,
        targetRole,
        relationshipType: getArchitecturalRelationshipType(
          sourceRole,
          targetRole
        ),
      });
    }
  }

  await RepositoryRelationship.deleteMany({
    repositoryIndexId,
    userId,
  });

  if (relationships.length === 0) {
    console.log(
      "[Code Intelligence] Relationships created: 0"
    );
    return 0;
  }

  await RepositoryRelationship.insertMany(relationships);

  console.log(
    `[Code Intelligence] Relationships created: ${relationships.length}`
  );

  return relationships.length;
};

const parseSourceCode = (
  content: string,
  language: string | null
): IRepositoryFileParsedData => {
  const lines = content.split(/\r?\n/);
  const imports = parseImports(content, language);
  const exports = parseExports(content, language);
  const functions = parseFunctions(content, language);
  const classes = parseClasses(content, language);
  const dependencies = parseDependencies(imports, language);

  return {
    totalLines: getLineCount(content),
    nonEmptyLines: getNonEmptyLineCount(lines),
    commentLines: getCommentLineCount(lines, language),
    importCount: imports.length,
    exportCount: exports.length,
    functionCount: functions.length,
    classCount: classes.length,
    dependencyCount: dependencies.length,
    imports,
    exports,
    functions,
    classes,
    dependencies,
  };
};

interface IngestRepositoryFilesInput {
  userId: string;
  repositoryIndexId: string;
}

interface IngestRepositoryFilesResult {
  repositoryIndexId: string;
  totalSourceFiles: number;
  completedFiles: number;
  failedFiles: number;
}

export const ingestRepositoryFiles = async (
  input: IngestRepositoryFilesInput
): Promise<IngestRepositoryFilesResult> => {
  const { userId, repositoryIndexId } = input;

  const repositoryIndex = await RepositoryIndex.findOne({
    _id: repositoryIndexId,
    userId,
  });

  if (!repositoryIndex) {
    throw new Error("Repository index was not found.");
  }

  const connection =
  await GitHubConnection.findOne({
    userId,
  }).select("+accessToken");

  if (!connection) {
    throw new Error("GitHub account is not connected.");
  }

  repositoryIndex.status = "processing";
  repositoryIndex.startedAt = new Date();
  repositoryIndex.completedAt = null;
  repositoryIndex.errorMessage = null;

  await repositoryIndex.save();

  try {
    const [owner, repository] =
      repositoryIndex.repositoryFullName.split("/");

    if (!owner || !repository) {
      throw new Error("Invalid repository full name.");
    }

    const tree = await getGitHubRepositoryTree(
      connection.accessToken,
      owner,
      repository,
      repositoryIndex.branch
    );

    const sourceFilesByPath = new Map(
      tree.sourceFiles.map((sourceFile) => [sourceFile.path, sourceFile])
    );
    const sourceFiles = Array.from(sourceFilesByPath.values());
    const duplicateSourceFileCount =
      tree.sourceFiles.length - sourceFiles.length;

    repositoryIndex.totalEntries = tree.entries.length;
    repositoryIndex.sourceFileCount = sourceFiles.length;
    repositoryIndex.skippedFileCount = Math.max(
      tree.entries.length - sourceFiles.length,
      0
    );
    repositoryIndex.treeTruncated = tree.truncated;

    repositoryIndex.processedFileCount = 0;
    repositoryIndex.completedFileCount = 0;
    repositoryIndex.failedFileCount = 0;

    await repositoryIndex.save();

    let completedFiles = 0;
    let failedFiles = 0;
    let reusedFiles = 0;
    let updatedFiles = 0;
    let newFiles = 0;

    console.log(
      `[Incremental Index] Starting: ${sourceFiles.length} source file(s) found.`
    );

    const sourceFilePaths = new Set(
      sourceFiles.map((sourceFile) => sourceFile.path)
    );

    if (duplicateSourceFileCount > 0) {
      console.log(
        `[Deduplication] Ignoring ${duplicateSourceFileCount} duplicate source path(s).`
      );
    }

    // Deduplication: load the existing indexed files once and keep them in
    // memory for this indexing run. This prevents duplicate database records
    // for the same repository index + path and avoids repeated lookups while
    // processing batches. The MongoDB unique index remains the final database
    // level safeguard.
    const existingFiles = await RepositoryFile.find({
      repositoryIndexId: repositoryIndex._id,
      path: { $in: Array.from(sourceFilePaths) },
    });

    const existingFilesByPath = new Map(
      existingFiles.map((file) => [file.path, file])
    );

    console.log(
      `[Deduplication] Existing indexed files loaded: ${existingFilesByPath.size}`
    );

    const processSourceFile = async (sourceFile: (typeof sourceFiles)[number]) => {
      const extension = getExtension(sourceFile.path);
      const language = getLanguage(extension);

      try {
        const existingFile =
          existingFilesByPath.get(sourceFile.path) ?? null;

        // Incremental indexing: if the GitHub blob SHA has not changed
        // and the previous ingestion completed successfully, reuse the
        // stored content and parsed data instead of downloading/parsing it again.
        const hasPhase11Dependencies =
          existingFile?.parsedData?.dependencyCount !== undefined;

        if (
          existingFile &&
          existingFile.status === "completed" &&
          existingFile.sha === sourceFile.sha &&
          hasPhase11Dependencies
        ) {
          console.log(
            `[Incremental Index] REUSED: ${sourceFile.path}`
          );

          return {
            status: "completed" as const,
            action: "reused" as const,
          };
        }

        if (
          existingFile &&
          existingFile.status === "completed" &&
          existingFile.sha === sourceFile.sha &&
          !hasPhase11Dependencies
        ) {
          console.log(
            `[Code Intelligence] REFRESHING PARSED DATA: ${sourceFile.path}`
          );
        }

       const fileContent = await getGitHubFileContent(
  connection.accessToken,
  owner,
  repository,
  sourceFile.path,
  sourceFile.sha
);
if (
  !fileContent ||
  typeof fileContent.content !== "string"
) {
  throw new Error(
    `GitHub file content was unavailable for: ${sourceFile.path}`
  );
}
        const parsedData = parseSourceCode(
          fileContent.content,
          language
        );

        let repositoryFile = existingFile;
        let action: "new" | "updated";

        if (!repositoryFile) {
          console.log(
            `[Incremental Index] NEW: ${sourceFile.path}`
          );

          action = "new";

          console.log("[DEBUG RepositoryFile]", {
  path: sourceFile.path,
  sourceSha: sourceFile.sha,
  returnedSha: fileContent?.sha,
  contentType: typeof fileContent?.content,
  contentLength: fileContent?.content?.length,
});

          repositoryFile = new RepositoryFile({
            repositoryIndexId: repositoryIndex._id,
            userId,
            githubRepositoryId:
              repositoryIndex.githubRepositoryId,
            repositoryFullName:
              repositoryIndex.repositoryFullName,
            branch: repositoryIndex.branch,
            path: sourceFile.path,
            sha: fileContent.sha,
            size: fileContent.size,
            extension,
            language,
            content: fileContent.content,
            parsedData,
            parsedAt: new Date(),
            status: "completed",
            errorMessage: null,
          });

          existingFilesByPath.set(sourceFile.path, repositoryFile);
        } else {
          action = "updated";
          console.log(
            `[Incremental Index] UPDATED: ${sourceFile.path}`
          );

          repositoryFile.sha = fileContent.sha;
          repositoryFile.size = fileContent.size;
          repositoryFile.extension = extension;
          repositoryFile.language = language;
          repositoryFile.content = fileContent.content;
          repositoryFile.parsedData = parsedData;
          repositoryFile.parsedAt = new Date();
          repositoryFile.status = "completed";
          repositoryFile.errorMessage = null;
        }

        await repositoryFile.save();

        return {
          status: "completed" as const,
          action,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to ingest and parse repository file.";

        const existingFile =
          existingFilesByPath.get(sourceFile.path) ?? null;

  if (existingFile) {
  await RepositoryFile.updateOne(
    { _id: existingFile._id },
    {
      $set: {
        status: "failed",
        errorMessage,
      },
    }
  );
}

        console.error(
          `[Incremental Index] FAILED: ${sourceFile.path} - ${errorMessage}`
        );

        return {
          status: "failed" as const,
          action: "failed" as const,
        };
      }
    };

    for (
      let batchStart = 0;
      batchStart < sourceFiles.length;
      batchStart += BATCH_SIZE
    ) {
      const batch = sourceFiles.slice(
        batchStart,
        batchStart + BATCH_SIZE
      );

      console.log(
        `[Batch Index] Processing batch ${
          Math.floor(batchStart / BATCH_SIZE) + 1
        } (${batch.length} file(s), ${batchStart + 1}-${
          batchStart + batch.length
        } of ${sourceFiles.length})`
      );

      const results = await Promise.all(
        batch.map((sourceFile) => processSourceFile(sourceFile))
      );

      for (const result of results) {
        if (result.status === "completed") {
          completedFiles += 1;

          if (result.action === "reused") {
            reusedFiles += 1;
          } else if (result.action === "updated") {
            updatedFiles += 1;
          } else if (result.action === "new") {
            newFiles += 1;
          }
        } else {
          failedFiles += 1;
        }
      }

      repositoryIndex.processedFileCount =
        completedFiles + failedFiles;
      repositoryIndex.completedFileCount = completedFiles;
      repositoryIndex.failedFileCount = failedFiles;

      await repositoryIndex.save();

      console.log(
        `[Batch Index] Batch complete: processed=${
          repositoryIndex.processedFileCount
        }, completed=${completedFiles}, failed=${failedFiles}`
      );
    }

    // If the tree was complete, remove files that no longer exist in GitHub.
    // When GitHub reports a truncated tree, do not delete anything because the
    // local index may contain files that were simply omitted from the response.
    if (!tree.truncated) {
      await RepositoryFile.deleteMany({
        repositoryIndexId: repositoryIndex._id,
        path: { $nin: Array.from(sourceFilePaths) },
      });
    }

    // Rebuild file-to-file relationships from the current indexed files.
    // Only local dependencies that resolve to another indexed source file are
    // stored. External packages such as "react" are intentionally ignored.
    await buildRepositoryRelationships(
      repositoryIndex._id.toString(),
      userId
    );

    // Phase 12: generate/reuse vector embeddings for the completed indexed
    // repository files after code-intelligence relationships are rebuilt.
    await generateRepositoryEmbeddings(
      repositoryIndex._id.toString(),
      userId
    );

    repositoryIndex.status =
      failedFiles === sourceFiles.length &&
      sourceFiles.length > 0
        ? "failed"
        : "completed";

    repositoryIndex.completedAt = new Date();

    repositoryIndex.processedFileCount =
      completedFiles + failedFiles;

    repositoryIndex.completedFileCount =
      completedFiles;

    repositoryIndex.failedFileCount =
      failedFiles;

    repositoryIndex.errorMessage =
      failedFiles > 0
        ? `${failedFiles} source file(s) failed to ingest or parse.`
        : null;

    await repositoryIndex.save();

    console.log(
      `[Incremental Index] Summary: reused=${reusedFiles}, updated=${updatedFiles}, new=${newFiles}, failed=${failedFiles}`
    );

    return {
      repositoryIndexId: repositoryIndex._id.toString(),
      totalSourceFiles: sourceFiles.length,
      completedFiles,
      failedFiles,
    };
  } catch (error) {
    repositoryIndex.status = "failed";
    repositoryIndex.completedAt = null;
    repositoryIndex.errorMessage =
      error instanceof Error
        ? error.message
        : "Repository file ingestion failed.";

    await repositoryIndex.save();

    throw error;
  }
};
