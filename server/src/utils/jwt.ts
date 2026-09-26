import jwt from "jsonwebtoken";

interface JwtPayload {
  userId: string;
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in the environment variables.");
  }

  return secret;
};

export const generateAccessToken = (userId: string): string => {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    { userId } satisfies JwtPayload,
    getJwtSecret(),
    { expiresIn } as jwt.SignOptions
  );
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
};