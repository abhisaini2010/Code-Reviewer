import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { errorHandler } from "./middleware/errorHandler";
import {
  generalRateLimiter,
} from "./middleware/rateLimit.middleware";

import authRoutes from "./routes/authRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import githubRoutes from "./routes/githubRoutes";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "AI Code Reviewer API is running",
  });
});

/*
 * Phase 17 — General API rate limiting
 *
 * 120 requests per 15 minutes per IP.
 *
 * The health endpoint stays above the limiter so local/deployment
 * health checks are not unnecessarily rate limited.
 */
app.use(generalRateLimiter);

app.use(
  "/api/v1/auth",
  authRoutes
);

app.use(
  "/api/v1/reviews",
  reviewRoutes
);

app.use(
  "/api/v1/github",
  githubRoutes
);

app.use(errorHandler);

export default app;