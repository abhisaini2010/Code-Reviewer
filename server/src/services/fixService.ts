import { Type } from "@google/genai";
import { z } from "zod";

import { AppError } from "../errors/AppError";
import {
  CodeFixResult,
  FixRequest,
} from "../types/review";
import {
  geminiClient,
  getGeminiModel,
} from "../config/gemini";

const codeFixResultSchema = z.object({
  fixedCode: z.string(),
  explanation: z.string(),
});

const fixResponseSchema = {
  type: Type.OBJECT,
  properties: {
    fixedCode: {
      type: Type.STRING,
      description:
        "The complete corrected or improved source code. Return only the code itself without Markdown code fences.",
    },
    explanation: {
      type: Type.STRING,
      description:
        "Clear explanation of what was changed and why.",
    },
  },
  required: [
    "fixedCode",
    "explanation",
  ],
};

const getActionInstruction = (
  action: FixRequest["action"]
): string => {
  switch (action) {
    case "fix":
      return `
Fix the specified issue in the code.

Preserve the existing functionality as much as possible.
Do not make unrelated changes.
`;

    case "optimize":
      return `
Optimize the code for performance, efficiency, and resource usage.

Preserve the intended behavior.
Do not make unrelated stylistic changes.
`;

    case "refactor":
      return `
Refactor the code to improve readability, maintainability,
structure, and code quality.

Preserve the existing behavior.
Do not introduce unnecessary changes.
`;

    case "alternative":
      return `
Generate an alternative implementation of the code.

The alternative implementation must preserve the intended
behavior while using a meaningfully different approach where
appropriate.
`;

    default:
      return `
Improve the provided code while preserving its intended behavior.
`;
  }
};

const buildFixPrompt = (
  input: FixRequest
): string => {
  return `
You are an expert senior software engineer specializing in
debugging, optimization, refactoring, and software design.

The user has provided source code and a specific issue found
during an AI code review.

Programming language:
${input.language}

Requested action:
${input.action}

Issue title:
${input.issue.title}

Issue description:
${input.issue.description}

Issue severity:
${input.issue.severity}

Issue line:
${input.issue.line ?? "Not specified"}

Original suggestion:
${input.issue.suggestion ?? "No suggestion provided"}

${getActionInstruction(input.action)}

Important rules:

1. Return the COMPLETE resulting source code in "fixedCode".
2. Do not return partial code.
3. Do not include Markdown code fences around the code.
4. Preserve the programming language.
5. Preserve the intended functionality unless the requested action
   specifically requires an improvement.
6. Do not invent requirements that are not present in the code.
7. Do not modify unrelated parts of the code unnecessarily.
8. Make the resulting code syntactically valid.
9. Explain the important changes in "explanation".
10. Return ONLY the requested structured JSON result.

Original code:
\`\`\`${input.language}
${input.code}
\`\`\`
`;
};

export const fixCode = async (
  input: FixRequest
): Promise<CodeFixResult> => {
  try {
    const prompt = buildFixPrompt(input);

    const response =
      await geminiClient.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: fixResponseSchema,
        },
      });

    const responseText = response.text;

    if (!responseText) {
      throw new AppError(
        "Gemini returned an empty fix response.",
        502,
        "AI_FIX_EMPTY_RESPONSE"
      );
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new AppError(
        "Gemini returned an invalid fix response.",
        502,
        "AI_FIX_INVALID_JSON"
      );
    }

    const validatedResult =
      codeFixResultSchema.safeParse(
        parsedResponse
      );

    if (!validatedResult.success) {
      console.error(
        "Invalid Gemini fix response:",
        validatedResult.error.flatten()
      );

      throw new AppError(
        "Gemini returned a response that did not match the expected fix format.",
        502,
        "AI_FIX_INVALID_RESPONSE"
      );
    }

    return validatedResult.data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error(
      "========== GEMINI FIX ERROR =========="
    );
    console.error(error);
    console.error(
      "======================================"
    );

    throw new AppError(
      "Unable to generate an AI code fix.",
      502,
      "AI_FIX_FAILED"
    );
  }
};