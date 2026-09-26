import {
  searchRepositoryHybrid,
  type RepositoryHybridSearchOptions,
  type RepositoryHybridSearchResult,
} from "./repositoryHybridSearchService";

import {
  getRepositoryDependencyContext,
  type RepositoryDependencyContext,
} from "./repositoryDependencyContextService";

export interface RepositoryRetrievalContext {
  query: string;
  results: RepositoryHybridSearchResult[];
  dependencyContext: RepositoryDependencyContext[];
}

export const retrieveRepositoryContext = async (
  repositoryIndexId: string,
  userId: string,
  query: string,
  options: RepositoryHybridSearchOptions = {}
): Promise<RepositoryRetrievalContext> => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("Repository query is required.");
  }

  const results = await searchRepositoryHybrid(
    repositoryIndexId,
    userId,
    normalizedQuery,
    options
  );

  const sourceFileIds = Array.from(
    new Set(
      results.map(
        (result) => result.repositoryFileId
      )
    )
  );

  const dependencyContext =
    await getRepositoryDependencyContext(
      repositoryIndexId,
      userId,
      sourceFileIds
    );

  return {
    query: normalizedQuery,
    results,
    dependencyContext,
  };
};