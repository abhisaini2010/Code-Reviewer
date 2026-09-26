import { rateLimit } from "express-rate-limit";

const jsonRateLimitResponse = {
  success: false,
  message: "Too many requests. Please try again later.",
  code: "RATE_LIMIT_EXCEEDED",
};

const createRateLimiter = (options: {
  windowMs: number;
  limit: number;
  message?: string;
}) =>
  rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,

    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
      ...jsonRateLimitResponse,
      message:
        options.message ||
        jsonRateLimitResponse.message,
    },

    statusCode: 429,
  });

/**
 * General API protection.
 *
 * 120 requests per IP per 15 minutes.
 * This is intentionally broad enough for normal frontend
 * navigation, repository browsing, and API polling.
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 120,
});

/**
 * Authentication protection.
 *
 * 10 requests per IP per 15 minutes.
 * This helps reduce repeated login/register attempts.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message:
    "Too many authentication attempts. Please try again later.",
});

/**
 * AI / expensive-operation protection.
 *
 * 30 requests per IP per 15 minutes.
 * Apply this to Gemini-powered review, fix, repository chat,
 * repository review, and test-generation endpoints.
 */
export const aiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message:
    "Too many AI requests. Please wait before trying again.",
});
