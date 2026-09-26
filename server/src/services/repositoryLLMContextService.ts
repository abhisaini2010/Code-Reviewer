import type {
  RepositoryRetrievalContext,
} from "./repositoryRetrievalService";

const MAX_FILE_CONTENT_LENGTH = 8000;
const MAX_DEPENDENCIES_PER_FILE = 10;

export interface RepositoryLLMContext {
  query: string;
  context: string;
  sources: string[];
}

const trimContent = (
  content: string
): string => {
  if (content.length <= MAX_FILE_CONTENT_LENGTH) {
    return content;
  }

  return (
    content.slice(0, MAX_FILE_CONTENT_LENGTH) +
    "\n\n[Content truncated]"
  );
};

export const buildRepositoryLLMContext = (
  retrieval: RepositoryRetrievalContext
): RepositoryLLMContext => {
  const sections: string[] = [];

  const sources = Array.from(
    new Set(
      retrieval.results.map(
        (result) => result.path
      )
    )
  );

  sections.push(
    `User Question:\n${retrieval.query}`
  );

  sections.push(
    "Relevant Repository Files:"
  );

  retrieval.results.forEach(
    (result, index) => {
      const score =
        result.finalScore.toFixed(4);

      const location =
        result.startLine !== null &&
        result.endLine !== null
          ? `Lines ${result.startLine}-${result.endLine}`
          : "Full file result";

      sections.push(
        [
          `--- Result ${index + 1} ---`,
          `File: ${result.path}`,
          `Language: ${
            result.language ?? "unknown"
          }`,
          `Location: ${location}`,
          `Semantic Score: ${result.semanticScore.toFixed(
            4
          )}`,
          `Keyword Score: ${result.keywordScore.toFixed(
            4
          )}`,
          `Final Score: ${score}`,
          "",
          "Code:",
          trimContent(result.content),
        ].join("\n")
      );
    }
  );

  if (
    retrieval.dependencyContext.length > 0
  ) {
    sections.push(
      "Dependency Context:"
    );

    retrieval.dependencyContext.forEach(
      (fileContext) => {
        sections.push(
          [
            `--- ${fileContext.sourcePath} ---`,
            ...fileContext.dependencies
              .slice(
                0,
                MAX_DEPENDENCIES_PER_FILE
              )
              .map(
                (dependency) =>
                  `Depends on: ${dependency.path} | ` +
                  `Role: ${dependency.role} | ` +
                  `Relationship: ${dependency.relationshipType} | ` +
                  `Import: ${dependency.dependency}`
              ),
          ].join("\n")
        );
      }
    );
  }

  return {
    query: retrieval.query,
    context: sections.join("\n\n"),
    sources,
  };
};