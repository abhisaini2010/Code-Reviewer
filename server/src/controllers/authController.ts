import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { registerUser, loginUser } from "../services/authService";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, email, and password are required.",
        },
      });

      return;
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_NAME",
          message: "Name must be between 2 and 100 characters.",
        },
      });

      return;
    }

    if (!isValidEmail(normalizedEmail) || normalizedEmail.length > 254) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address.",
        },
      });

      return;
    }

    if (password.length < 8 || password.length > 128) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PASSWORD",
          message: "Password must be between 8 and 128 characters.",
        },
      });

      return;
    }

    const user = await registerUser({
      name: trimmedName,
      email: normalizedEmail,
      password,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required.",
        },
      });

      return;
    }

    const { user, accessToken } = await loginUser({
      email,
      password,
    });

    res.cookie("accessToken", accessToken, getCookieOptions());

    res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = (
  _req: Request,
  res: Response
): void => {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
  });

  res.status(200).json({
    success: true,
    message: "Logout successful.",
  });
};

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required.",
        },
      });

      return;
    }

    const user = await User.findById(req.userId).select(
      "_id name email createdAt updatedAt"
    );

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found.",
        },
      });

      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};