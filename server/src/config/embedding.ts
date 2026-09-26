import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

/**
 * Phase 12 — Embeddings configuration.
 *
 * gemini-embedding-001 is the text embedding model used for the
 * repository code/vector-search foundation.
 *
 * 768 dimensions are used to keep vector storage smaller while
 * remaining within Google's recommended embedding dimensions.
 */
export const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

export const EMBEDDING_DIMENSIONS = Number(
  process.env.GEMINI_EMBEDDING_DIMENSIONS || "768"
);

if (!Number.isInteger(EMBEDDING_DIMENSIONS) || EMBEDDING_DIMENSIONS <= 0) {
  throw new Error(
    "GEMINI_EMBEDDING_DIMENSIONS must be a positive integer."
  );
}

export const embeddingAI = new GoogleGenAI({
  apiKey,
});
