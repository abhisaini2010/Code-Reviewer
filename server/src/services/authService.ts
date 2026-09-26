import bcrypt from "bcryptjs";
import User, { IUser } from "../models/User";
import { AppError } from "../errors/AppError";
import { generateAccessToken } from "../utils/jwt";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResult {
  user: IUser;
  accessToken: string;
}

export const registerUser = async ({
  name,
  email,
  password,
}: RegisterInput): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw new AppError(
      "A user with this email already exists.",
      409,
      "EMAIL_ALREADY_EXISTS"
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
  });

const accessToken = generateAccessToken(user._id.toString());

return {
  user,
  accessToken,
};
};

export const loginUser = async ({
  email,
  password,
}: LoginInput): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
  });

  if (!user) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const accessToken = generateAccessToken(user._id.toString());

  return {
    user,
    accessToken,
  };
};