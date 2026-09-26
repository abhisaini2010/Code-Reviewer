import { Type } from "@google/genai";
import { z } from "zod";

import { AppError } from "../errors/AppError";
import {
  CodeReviewResult,
  ReviewRequest,
} from "../types/review";
import {
  geminiClient,
  getGeminiModel,
} from "../config/gemini";

const reviewIssueSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum([
    "low",
    "medium",
    "high",
    "critical",
  ]),
  line: z.number().int().nullable(),
  suggestion: z.string().nullable(),
});

const complexitySchema = z.object({
  time: z.string(),
  space: z.string(),
  explanation: z.string(),
});

const codeReviewResultSchema = z.object({
  overallScore: z
    .number()
    .int()
    .min(0)
    .max(100),

  bugs: z.array(reviewIssueSchema),

  security: z.array(reviewIssueSchema),

  performance: z.array(reviewIssueSchema),

  codeQuality: z.array(reviewIssueSchema),

  complexity: complexitySchema,
});

const reviewIssueSchemaForGemini = {
  type: Type.OBJECT,

  properties: {
    title: {
      type: Type.STRING,
      description:
        "Short title describing the issue.",
    },

    description: {
      type: Type.STRING,
      description:
        "Clear explanation of the issue.",
    },

    severity: {
      type: Type.STRING,
      enum: [
        "low",
        "medium",
        "high",
        "critical",
      ],
      description:
        "Severity of the issue.",
    },

    line: {
      type: Type.INTEGER,
      nullable: true,
      description:
        "Approximate source-code line number. Use null if not applicable.",
    },

    suggestion: {
      type: Type.STRING,
      nullable: true,
      description:
        "Specific suggestion for improving or fixing the issue.",
    },
  },

  required: [
    "title",
    "description",
    "severity",
    "line",
    "suggestion",
  ],
};

const reviewResponseSchema = {
  type: Type.OBJECT,

  properties: {
    overallScore: {
      type: Type.INTEGER,
      description:
        "Overall code quality score from 0 to 100.",
    },

    bugs: {
      type: Type.ARRAY,
      items: reviewIssueSchemaForGemini,
    },

    security: {
      type: Type.ARRAY,
      items: reviewIssueSchemaForGemini,
    },

    performance: {
      type: Type.ARRAY,
      items: reviewIssueSchemaForGemini,
    },

    codeQuality: {
      type: Type.ARRAY,
      items: reviewIssueSchemaForGemini,
    },

    complexity: {
      type: Type.OBJECT,

      properties: {
        time: {
          type: Type.STRING,
          description:
            "Estimated time complexity.",
        },

        space: {
          type: Type.STRING,
          description:
            "Estimated space complexity.",
        },

        explanation: {
          type: Type.STRING,
          description:
            "Brief explanation of the complexity analysis.",
        },
      },

      required: [
        "time",
        "space",
        "explanation",
      ],
    },
  },

  required: [
    "overallScore",
    "bugs",
    "security",
    "performance",
    "codeQuality",
    "complexity",
  ],
};

const buildReviewPrompt = (
  code: string,
  language: string
): string => {
  return `
You are an expert senior software engineer and code reviewer.

Analyze the following ${language} code carefully.

Your review must cover:

1. Overall Code Quality Score
   - Give the code an overall quality score from 0 to 100.
   - 100 represents exceptionally clean, secure, maintainable,
     efficient, and well-structured code.
   - 0 represents extremely poor code with severe problems.
   - Base the score only on the provided code and your review findings.
   - Do not give a score randomly.

2. Bugs
   - Logic errors
   - Runtime problems
   - Incorrect behavior
   - Edge cases

3. Security
   - Security vulnerabilities
   - Unsafe input handling
   - Injection risks
   - Authentication or authorization concerns when relevant

4. Performance
   - Inefficient algorithms
   - Unnecessary operations
   - Expensive loops
   - Memory concerns

5. Code Quality
   - Naming
   - Structure
   - Readability
   - Maintainability
   - Best practices

6. Complexity
   - Time complexity
   - Space complexity
   - Brief explanation

Important rules:

- The overallScore MUST be an integer between 0 and 100.
- Only report issues that are reasonably supported by the provided code.
- Do not invent problems.
- If a category has no meaningful issues, return an empty array.
- Give practical and specific suggestions.
- Use severity values only from:
  low, medium, high, critical.
- Use null for line when a specific line cannot reasonably be identified.
- Keep descriptions concise but useful.
- Return ONLY the requested structured JSON result.

Programming language:
${language}

Code:
\`\`\`${language}
${code}
\`\`\`
`;
};

export const reviewCode = async (
  input: ReviewRequest
): Promise<CodeReviewResult> => {
  try {
    const prompt = buildReviewPrompt(
      input.code,
      input.language
    );

    const response =
      await geminiClient.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,

        config: {
          responseMimeType: "application/json",
          responseSchema: reviewResponseSchema,
        },
      });

    const responseText = response.text;

    if (!responseText) {
      throw new AppError(
        "Gemini returned an empty response.",
        502,
        "AI_EMPTY_RESPONSE"
      );
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new AppError(
        "Gemini returned an invalid JSON response.",
        502,
        "AI_INVALID_JSON"
      );
    }

    const validatedResult =
      codeReviewResultSchema.safeParse(
        parsedResponse
      );

    if (!validatedResult.success) {
      console.error(
        "Invalid Gemini review response:",
        validatedResult.error.flatten()
      );

      throw new AppError(
        "Gemini returned a response that did not match the expected review format.",
        502,
        "AI_INVALID_RESPONSE"
      );
    }

    return validatedResult.data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error(
      "========== GEMINI ERROR =========="
    );
    console.error(error);
    console.error(
      "=================================="
    );

    throw new AppError(
      "Unable to complete the AI code review.",
      502,
      "AI_REVIEW_FAILED"
    );
  }
};