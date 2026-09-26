import { GoogleGenAI } from "@google/genai";

const getGeminiApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not defined in the environment variables."
    );
  }

  return apiKey;
};

export const getGeminiModel = (): string => {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
};

export const geminiClient = new GoogleGenAI({
  apiKey: getGeminiApiKey(),
});