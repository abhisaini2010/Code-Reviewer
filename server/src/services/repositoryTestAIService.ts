import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

const testGenerationAI = new GoogleGenAI({ apiKey });

const TEST_GENERATION_MODEL =
  process.env.GEMINI_TEST_MODEL ||
  process.env.GEMINI_CHAT_MODEL ||
  process.env.GEMINI_REVIEW_MODEL ||
  "gemini-3.5-flash-lite";

const MAX_SOURCE_LENGTH = 14000;

export interface GeneratedTestCase {
  name: string;
  purpose: string;
}

export interface RepositoryTestGenerationResult {
  filePath: string;
  language: string | null;
  testFramework: string;
  testFileName: string;
  testCode: string;
  explanation: string;
  testCases: GeneratedTestCase[];
  limitations: string[];
}

const extractJSON = (text: string): unknown => {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue below.
  }

  const fenced = trimmed.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );

  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue below.
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(
        trimmed.slice(firstBrace, lastBrace + 1)
      );
    } catch {
      // Continue below.
    }
  }

  throw new Error(
    `AI returned an invalid test-generation response. Raw response preview: ${text.slice(
      0,
      1000
    )}`
  );
};

const normalizeTestCase = (
  value: unknown
): GeneratedTestCase | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    name?: unknown;
    purpose?: unknown;
  };

  if (
    typeof item.name !== "string" ||
    typeof item.purpose !== "string"
  ) {
    return null;
  }

  return {
    name: item.name.trim(),
    purpose: item.purpose.trim(),
  };
};

export const generateRepositoryTestsWithAI = async (input: {
  filePath: string;
  language: string | null;
  extension: string;
  content: string;
  parsedData: unknown;
}): Promise<RepositoryTestGenerationResult> => {
  const source = input.content.slice(0, MAX_SOURCE_LENGTH);
  const wasTruncated = input.content.length > MAX_SOURCE_LENGTH;

  const prompt = `
You are an expert software testing assistant.

Generate a practical unit/integration test file for the provided indexed source file.

Rules:
- Base the tests only on the supplied source code and metadata.
- Do not invent functions, exports, APIs, database models, or behavior that is not supported by the source.
- Identify the exported/public functions or important behaviors that can actually be tested.
- Prefer the testing framework commonly associated with the detected language/project style.
- For JavaScript/TypeScript, prefer Vitest if the source/project evidence indicates Vite/Vitest; otherwise use Jest.
- For Python, prefer pytest.
- For Java, prefer JUnit 5.
- For C++, prefer GoogleTest when a framework choice is necessary.
- Keep mocks minimal and clearly mark assumptions.
- Include happy paths and meaningful edge/error cases where the source supports them.
- Return ONLY valid JSON.

Return exactly this structure:
{
  "testFramework": "",
  "testFileName": "",
  "testCode": "",
  "explanation": "",
  "testCases": [
    {
      "name": "",
      "purpose": ""
    }
  ],
  "limitations": []
}

Source file:
${input.filePath}

Language:
${input.language ?? "unknown"}

Extension:
${input.extension}

Parsed metadata:
${JSON.stringify(input.parsedData ?? {}, null, 2)}

Source code:
---
${source}
---

${
  wasTruncated
    ? "The source was truncated because of the test-generation context limit. Mention this limitation in the limitations array."
    : ""
}
`;

  const response =
    await testGenerationAI.models.generateContent({
      model: TEST_GENERATION_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

  const responseText = response.text?.trim();

  if (!responseText) {
    throw new Error("AI did not return generated tests.");
  }

  const parsed = extractJSON(responseText);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned an invalid test-generation response.");
  }

  const data = parsed as {
    testFramework?: unknown;
    testFileName?: unknown;
    testCode?: unknown;
    explanation?: unknown;
    testCases?: unknown;
    limitations?: unknown;
  };

  if (
    typeof data.testCode !== "string" ||
    !data.testCode.trim()
  ) {
    throw new Error("AI did not return usable test code.");
  }

  const testCases = Array.isArray(data.testCases)
    ? data.testCases
        .map(normalizeTestCase)
        .filter(
          (item): item is GeneratedTestCase =>
            item !== null
        )
    : [];

  const limitations = Array.isArray(data.limitations)
    ? data.limitations.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];

  if (wasTruncated) {
    limitations.push(
      "The indexed source file was truncated before test generation, so some behavior may not be covered."
    );
  }

  return {
    filePath: input.filePath,
    language: input.language,
    testFramework:
      typeof data.testFramework === "string" &&
      data.testFramework.trim()
        ? data.testFramework.trim()
        : "Detected framework",
    testFileName:
      typeof data.testFileName === "string" &&
      data.testFileName.trim()
        ? data.testFileName.trim()
        : `${input.filePath}.test`,
    testCode: data.testCode.trim(),
    explanation:
      typeof data.explanation === "string"
        ? data.explanation.trim()
        : "Generated tests based on the indexed source file.",
    testCases,
    limitations: Array.from(new Set(limitations)),
  };
};
