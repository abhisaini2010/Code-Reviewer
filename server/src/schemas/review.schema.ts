import { z } from "zod";

export const reviewSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required.")
    .max(
      100_000,
      "Code must be 100,000 characters or less."
    ),

  language: z.enum([
    "javascript",
    "typescript",
    "python",
    "java",
    "cpp",
  ]),
});