import RepositoryEmbedding from "../models/RepositoryEmbedding";
import RepositoryFile from "../models/RepositoryFile";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embeddingAI,
} from "../config/embedding";

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 500;

interface CodeChunk {
  content: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
}

/**
 * Splits source code into reasonably small overlapping chunks.
 *
 * gemini-embedding-001 has a 2,048-token input limit, so we keep the
 * character size conservative rather than embedding an entire source file
 * at once.
 */
const chunkSourceCode = (content: string): CodeChunk[] => {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];

  let startLineIndex = 0;
  let chunkIndex = 0;

  while (startLineIndex < lines.length) {
    let endLineIndex = startLineIndex;
    let currentLength = 0;

    while (endLineIndex < lines.length) {
      const currentLine = lines[endLineIndex];

      if (currentLine === undefined) {
        break;
      }

      const nextLineLength =
        currentLine.length +
        (endLineIndex > startLineIndex ? 1 : 0);

      if (
        currentLength > 0 &&
        currentLength + nextLineLength > CHUNK_SIZE
      ) {
        break;
      }

      currentLength += nextLineLength;
      endLineIndex += 1;
    }

    const chunkLines = lines.slice(startLineIndex, endLineIndex);
    const chunkContent = chunkLines.join("\n");

    if (chunkContent.trim()) {
      chunks.push({
        content: chunkContent,
        startLine: startLineIndex + 1,
        endLine: endLineIndex,
        chunkIndex,
      });

      chunkIndex += 1;
    }

    if (endLineIndex >= lines.length) {
      break;
    }

    const overlapCharacters = Math.min(
      CHUNK_OVERLAP,
      Math.max(0, chunkContent.length - 1)
    );

    let overlapLength = 0;
    let nextStartLineIndex = endLineIndex;

    while (
      nextStartLineIndex > startLineIndex &&
      overlapLength < overlapCharacters
    ) {
      nextStartLineIndex -= 1;
      const overlapLine = lines[nextStartLineIndex];

      if (overlapLine === undefined) {
        break;
      }

      overlapLength += overlapLine.length + 1;
    }

    startLineIndex = Math.max(
      startLineIndex + 1,
      nextStartLineIndex
    );
  }

  return chunks;
};

const normalizeEmbedding = (
  values: number[]
): number[] => {
  if (EMBEDDING_MODEL !== "gemini-embedding-001") {
    return values;
  }

  const magnitude = Math.sqrt(
    values.reduce(
      (sum, value) => sum + value * value,
      0
    )
  );

  if (magnitude === 0) {
    return values;
  }

  return values.map((value) => value / magnitude);
};

const generateEmbedding = async (
  content: string
): Promise<number[]> => {
  const MAX_ATTEMPTS = 3;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response =
        await embeddingAI.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: content,
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: EMBEDDING_DIMENSIONS,
          },
        });

      const values =
        response.embeddings?.[0]?.values;

      if (!values || values.length === 0) {
        throw new Error(
          "Gemini returned an empty embedding."
        );
      }

      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Gemini returned ${values.length} dimensions; expected ${EMBEDDING_DIMENSIONS}.`
        );
      }

      return normalizeEmbedding(values);
    } catch (error) {
      lastError = error;

      console.error(
        `[Embeddings] Gemini request failed (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        error
      );

      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 2000;

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Gemini embedding failed after ${MAX_ATTEMPTS} attempts: ${lastError.message}`
      : `Gemini embedding failed after ${MAX_ATTEMPTS} attempts.`
  );
};

export const generateRepositoryEmbeddings = async (
  repositoryIndexId: string,
  userId: string
): Promise<{
  filesProcessed: number;
  filesReused: number;
  chunksCreated: number;
  chunksFailed: number;
}> => {
  const files = await RepositoryFile.find({
    repositoryIndexId,
    userId,
    status: "completed",
  })
    .select("_id path content sha")
    .sort({ path: 1 })
    .lean();

  let filesProcessed = 0;
  let filesReused = 0;
  let chunksCreated = 0;
  let chunksFailed = 0;

  console.log(
    `[Embeddings] Starting: ${files.length} indexed file(s) found.`
  );

  for (const file of files) {
    const existingEmbeddings =
      await RepositoryEmbedding.find({
        repositoryIndexId,
        repositoryFileId: file._id,
        userId,
      })
        .select("sourceSha status")
        .lean();

    const hasReusableEmbeddings =
      existingEmbeddings.length > 0 &&
      existingEmbeddings.every(
        (embedding) =>
          embedding.sourceSha === file.sha &&
          embedding.status === "completed"
      );

    if (hasReusableEmbeddings) {
      filesReused += 1;

      console.log(
        `[Embeddings] REUSED: ${file.path}`
      );

      continue;
    }

    await RepositoryEmbedding.deleteMany({
      repositoryIndexId,
      repositoryFileId: file._id,
      userId,
    });

    const chunks = chunkSourceCode(file.content);

    console.log(
      `[Embeddings] PROCESSING: ${file.path} (${chunks.length} chunk(s))`
    );

    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(
          chunk.content
        );

        await RepositoryEmbedding.create({
          repositoryIndexId,
          repositoryFileId: file._id,
          userId,
          path: file.path,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          embedding,
          embeddingModel: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          sourceSha: file.sha,
          status: "completed",
          errorMessage: null,
        });

        chunksCreated += 1;
      } catch (error) {
        chunksFailed += 1;

        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to generate embedding.";

        console.error(
          `[Embeddings] FAILED: ${file.path} chunk ${chunk.chunkIndex} - ${errorMessage}`
        );

        await RepositoryEmbedding.create({
          repositoryIndexId,
          repositoryFileId: file._id,
          userId,
          path: file.path,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          embedding: [],
          embeddingModel: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          sourceSha: file.sha,
          status: "failed",
          errorMessage,
        });
      }
    }

    filesProcessed += 1;
  }

  console.log(
    `[Embeddings] Summary: processed=${filesProcessed}, reused=${filesReused}, chunks=${chunksCreated}, failed=${chunksFailed}`
  );

  return {
    filesProcessed,
    filesReused,
    chunksCreated,
    chunksFailed,
  };
};
