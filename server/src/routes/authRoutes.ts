import { Router } from "express";

import {
  getCurrentUser,
  login,
  logout,
  register,
} from "../controllers/authController";

import { authMiddleware } from "../middleware/authMiddleware";

import {
  authRateLimiter,
} from "../middleware/rateLimit.middleware";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  register
);

router.post(
  "/login",
  authRateLimiter,
  login
);

router.post(
  "/logout",
  logout
);

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

export default router;