import { AuthPasswordService } from "../../../common/auth/password.service.js";
import { AuthTokenService, type AuthTokenPair } from "../../../common/auth/token.service.js";
import type { AuthPublicUser } from "../../../common/auth/auth.types.js";
import { User } from "../../user/models/user.model.js";
import { RefreshTokenService } from "./refreshTokenService.js";

interface SignUpInput {
  email: string;
  password: string;
  profile?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    linkedIn?: string;
  };
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthSuccessResult {
  user: AuthPublicUser;
  tokenPair: AuthTokenPair;
}

export class AuthServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
  }
}

export class AuthService {
  static async signUp(input: SignUpInput): Promise<AuthSuccessResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (!normalizedEmail || !input.password) {
      throw new AuthServiceError("email and password are required", 400, "INVALID_INPUT");
    }

    if (input.password.length < 8) {
      throw new AuthServiceError("password must be at least 8 characters", 400, "INVALID_PASSWORD");
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).lean();
    if (existingUser) {
      throw new AuthServiceError("email already registered", 409, "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await AuthPasswordService.hashPassword(input.password);

    const createdUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      profile: input.profile ?? {},
      isActive: true,
    });

    const tokenPair = AuthTokenService.issueTokenPair(createdUser.id, createdUser.email);
    await RefreshTokenService.rotateUserRefreshToken(createdUser.id, tokenPair.refreshToken);

    return {
      user: this.toPublicUser(createdUser),
      tokenPair,
    };
  }

  static async login(input: LoginInput): Promise<AuthSuccessResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    if (!normalizedEmail || !input.password) {
      throw new AuthServiceError("email and password are required", 400, "INVALID_INPUT");
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.isActive) {
      throw new AuthServiceError("invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const isValidPassword = await AuthPasswordService.verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthServiceError("invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const tokenPair = AuthTokenService.issueTokenPair(user.id, user.email);
    await RefreshTokenService.rotateUserRefreshToken(user.id, tokenPair.refreshToken);

    return {
      user: this.toPublicUser(user),
      tokenPair,
    };
  }

  static async refresh(refreshToken: string): Promise<AuthSuccessResult> {
    if (!refreshToken) {
      throw new AuthServiceError("refresh token is required", 401, "REFRESH_TOKEN_MISSING");
    }

    let payload;
    try {
      payload = AuthTokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthServiceError("invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
    }

    const isStoredTokenValid = await RefreshTokenService.validateUserRefreshToken(payload.sub, refreshToken);
    if (!isStoredTokenValid) {
      throw new AuthServiceError("refresh token revoked", 401, "REFRESH_TOKEN_REVOKED");
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new AuthServiceError("user not found", 401, "USER_NOT_FOUND");
    }

    const tokenPair = AuthTokenService.issueTokenPair(user.id, user.email);
    await RefreshTokenService.rotateUserRefreshToken(user.id, tokenPair.refreshToken);

    return {
      user: this.toPublicUser(user),
      tokenPair,
    };
  }

  static async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = AuthTokenService.verifyRefreshToken(refreshToken);
      await RefreshTokenService.invalidateUserRefreshToken(payload.sub);
    } catch {
      // Treat logout as idempotent and always clear client cookies.
    }
  }

  private static toPublicUser(user: {
    id: string;
    email: string;
    profile?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      linkedIn?: string;
    };
  }): AuthPublicUser {
    return {
      id: user.id,
      email: user.email,
      profile: user.profile ?? {},
    };
  }
}
