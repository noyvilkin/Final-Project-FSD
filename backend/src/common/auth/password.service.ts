import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config.js";

export class AuthPasswordService {
  static async hashPassword(plainPassword: string): Promise<string> {
    return this.hashValue(plainPassword);
  }

  static async verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return this.compareValue(plainPassword, passwordHash);
  }

  static async hashRefreshToken(refreshToken: string): Promise<string> {
    return this.hashValue(refreshToken);
  }

  static async verifyRefreshToken(refreshToken: string, refreshTokenHash: string): Promise<boolean> {
    return this.compareValue(refreshToken, refreshTokenHash);
  }

  private static async hashValue(rawValue: string): Promise<string> {
    if (!rawValue || rawValue.trim().length === 0) {
      throw new Error("value must not be empty");
    }

    return bcrypt.hash(rawValue, authConfig.bcryptSaltRounds);
  }

  private static async compareValue(rawValue: string, hashValue: string): Promise<boolean> {
    if (!rawValue || !hashValue) {
      return false;
    }

    return bcrypt.compare(rawValue, hashValue);
  }
}
