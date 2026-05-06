import { AuthPasswordService } from "../../../common/auth/password.service.js";
import { User } from "../../user/models/user.model.js";

export class RefreshTokenService {
  static async rotateUserRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const refreshTokenHash = await AuthPasswordService.hashRefreshToken(refreshToken);

    const updatedUser = await User.findByIdAndUpdate(userId, {
      refreshTokenHash,
      refreshTokenIssuedAt: new Date(),
    });

    if (!updatedUser) {
      throw new Error("user not found");
    }
  }

  static async validateUserRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const user = await User.findById(userId).select("refreshTokenHash").lean();
    if (!user?.refreshTokenHash) {
      return false;
    }

    return AuthPasswordService.verifyRefreshToken(refreshToken, user.refreshTokenHash);
  }

  static async invalidateUserRefreshToken(userId: string): Promise<void> {
    const updatedUser = await User.findByIdAndUpdate(userId, {
      $unset: {
        refreshTokenHash: "",
        refreshTokenIssuedAt: "",
      },
    });

    if (!updatedUser) {
      throw new Error("user not found");
    }
  }
}
