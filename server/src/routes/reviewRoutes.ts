import { Router } from "express";

import { review } from "../controllers/reviewController";
import { fix } from "../controllers/fixController";
import { authMiddleware } from "../middleware/authMiddleware";

import {
  aiRateLimiter,
} from "../middleware/rateLimit.middleware";

import { validateBody } from "../middleware/validate.middleware";
import { reviewSchema } from "../schemas/review.schema";

const router = Router();

router.post(
  "/",
  authMiddleware,
  aiRateLimiter,
  validateBody(reviewSchema),
  review
);

router.post(
  "/fix",
  authMiddleware,
  aiRateLimiter,
  fix
);

export default router;