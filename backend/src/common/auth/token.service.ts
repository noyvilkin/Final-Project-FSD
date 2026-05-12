import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { authConfig } from "./auth.config.js";
import type { AuthTokenPayload, AuthTokenType } from "./auth.types.js";

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthTokenService {
  static issueTokenPair(userId: string, email: string): AuthTokenPair {
    return {
      accessToken: this.signAccessToken(userId, email),
      refreshToken: this.signRefreshToken(userId, email),
    };
  }

  static signAccessToken(userId: string, email: string): string {
    return this.signToken("access", userId, email);
  }

  static signRefreshToken(userId: string, email: string): string {
    return this.signToken("refresh", userId, email);
  }

  static verifyAccessToken(token: string): AuthTokenPayload {
    return this.verifyToken(token, authConfig.accessToken.secret, "access");
  }

  static verifyRefreshToken(token: string): AuthTokenPayload {
    return this.verifyToken(token, authConfig.refreshToken.secret, "refresh");
  }

  private static signToken(type: AuthTokenType, userId: string, email: string): string {
    const payload: AuthTokenPayload = {
      sub: userId,
      email,
      type,
    };

    const tokenConfig = type === "access" ? authConfig.accessToken : authConfig.refreshToken;

    const signOptions: SignOptions = {
      expiresIn: Math.floor(tokenConfig.maxAgeMs / 1000),
    };

    return jwt.sign(payload, tokenConfig.secret as Secret, signOptions);
  }

  private static verifyToken(
    token: string,
    secret: string,
    expectedType: AuthTokenType
  ): AuthTokenPayload {
    const decoded = jwt.verify(token, secret as Secret);

    if (typeof decoded !== "object" || decoded === null) {
      throw new Error("invalid token payload");
    }

    const sub = decoded.sub;
    const email = decoded.email;
    const type = decoded.type;

    if (typeof sub !== "string" || typeof email !== "string") {
      throw new Error("invalid token payload shape");
    }

    if (type !== expectedType) {
      throw new Error("invalid token type");
    }

    return {
      sub,
      email,
      type,
    };
  }
}
