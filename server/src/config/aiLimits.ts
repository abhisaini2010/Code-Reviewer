export const AI_LIMITS = {
  // Approximate character-to-token safety ratio.
  // This is intentionally conservative for source code.
  CHARS_PER_TOKEN: 3,

  // Maximum approximate input tokens for normal AI requests.
  MAX_INPUT_TOKENS: 12_000,

  // Maximum characters for individual source-code inputs.
  MAX_SOURCE_CHARACTERS: 14_000,

  // Maximum characters for repository-wide review context.
  MAX_REPOSITORY_CONTEXT_CHARACTERS: 60_000,

  // Maximum characters for repository chat context.
  MAX_CHAT_CONTEXT_CHARACTERS: 30_000,

  // Maximum characters for generated AI output that we accept.
  MAX_OUTPUT_CHARACTERS: 20_000,
} as const;

export const approximateTokenCount = (
  text: string
): number => {
  if (!text) {
    return 0;
  }

  return Math.ceil(
    text.length / AI_LIMITS.CHARS_PER_TOKEN
  );
};

export const trimToTokenBudget = (
  text: string,
  maxTokens: number = AI_LIMITS.MAX_INPUT_TOKENS
): string => {
  const maxCharacters =
    maxTokens * AI_LIMITS.CHARS_PER_TOKEN;

  if (text.length <= maxCharacters) {
    return text;
  }

  return text.slice(0, maxCharacters);
};