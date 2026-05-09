import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { AuthTokenService } from "../../common/auth/token.service.js";
import { User } from "../../features/user/models/user.model.js";
import { AuthService } from "../../features/auth/services/authService.js";
import { RefreshTokenService } from "../../features/auth/services/refreshTokenService.js";

describe("Auth service unit coverage", () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("throws USER_NOT_FOUND when refresh payload is valid but user does not exist", async () => {
    const missingUserId = new Types.ObjectId().toString();

    jest.spyOn(AuthTokenService, "verifyRefreshToken").mockReturnValue({
      sub: missingUserId,
      email: "missing@example.com",
      type: "refresh",
    });

    jest.spyOn(RefreshTokenService, "validateUserRefreshToken").mockResolvedValue(true);

    await expect(AuthService.refresh("valid-looking-token")).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      status: 401,
    });
  });

  it("does not throw when logout is called with no token", async () => {
    await expect(AuthService.logout(undefined)).resolves.toBeUndefined();
  });

  it("swallows token parsing errors in logout", async () => {
    jest.spyOn(AuthTokenService, "verifyRefreshToken").mockImplementation(() => {
      throw new Error("bad token");
    });

    await expect(AuthService.logout("malformed-token")).resolves.toBeUndefined();
  });

  it("throws user not found when rotating token for unknown user", async () => {
    await expect(
      RefreshTokenService.rotateUserRefreshToken(new Types.ObjectId().toString(), "refresh-token-value")
    ).rejects.toThrow("user not found");
  });

  it("returns false when validating token for user without stored refresh token", async () => {
    const user = await User.create({
      email: "no-refresh-hash@example.com",
      passwordHash: "placeholder-hash",
      isActive: true,
    });

    await expect(
      RefreshTokenService.validateUserRefreshToken(user.id, "refresh-token-value")
    ).resolves.toBe(false);
  });

  it("throws user not found when invalidating unknown user refresh token", async () => {
    await expect(
      RefreshTokenService.invalidateUserRefreshToken(new Types.ObjectId().toString())
    ).rejects.toThrow("user not found");
  });
});
