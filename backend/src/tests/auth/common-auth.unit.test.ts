import jwt from "jsonwebtoken";

const REQUIRED_ENV: Record<string, string> = {
  JWT_ACCESS_TOKEN_SECRET: "test-access-secret-1234567890",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-1234567890",
  JWT_ACCESS_TOKEN_MAX_AGE_MS: "900000",
  JWT_REFRESH_TOKEN_MAX_AGE_MS: "604800000",
  AUTH_BCRYPT_SALT_ROUNDS: "10",
};

describe("Common auth modules", () => {
  const originalEnv = process.env;

  const applyRequiredEnv = (): void => {
    for (const [key, value] of Object.entries(REQUIRED_ENV)) {
      process.env[key] = value;
    }
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    applyRequiredEnv();
    delete process.env.AUTH_COOKIE_DOMAIN;
    delete process.env.AUTH_COOKIE_SAME_SITE;
    delete process.env.AUTH_COOKIE_SECURE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("loads auth config with default sameSite and secure behavior", async () => {
    process.env.NODE_ENV = "test";

    const { authConfig } = await import("../../common/auth/auth.config.js");

    expect(authConfig.cookies.sameSite).toBe("lax");
    expect(authConfig.cookies.secure).toBe(false);
  });

  it("rejects invalid sameSite policy", async () => {
    process.env.AUTH_COOKIE_SAME_SITE = "invalid";

    await expect(import("../../common/auth/auth.config.js")).rejects.toThrow(
      "AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none"
    );
  });

  it("rejects sameSite none when secure cookies are false", async () => {
    process.env.AUTH_COOKIE_SAME_SITE = "none";
    process.env.AUTH_COOKIE_SECURE = "false";

    await expect(import("../../common/auth/auth.config.js")).rejects.toThrow(
      "AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none"
    );
  });

  it("rejects invalid bcrypt rounds", async () => {
    process.env.AUTH_BCRYPT_SALT_ROUNDS = "8";

    await expect(import("../../common/auth/auth.config.js")).rejects.toThrow(
      "AUTH_BCRYPT_SALT_ROUNDS must be between 10 and 12"
    );
  });

  it("rejects missing required JWT env", async () => {
    delete process.env.JWT_ACCESS_TOKEN_SECRET;

    await expect(import("../../common/auth/auth.config.js")).rejects.toThrow(
      "JWT_ACCESS_TOKEN_SECRET environment variable is required"
    );
  });

  it("hashes and verifies passwords and refresh tokens", async () => {
    const { AuthPasswordService } = await import("../../common/auth/password.service.js");

    const passwordHash = await AuthPasswordService.hashPassword("Password123!");
    expect(await AuthPasswordService.verifyPassword("Password123!", passwordHash)).toBe(true);
    expect(await AuthPasswordService.verifyPassword("WrongPass", passwordHash)).toBe(false);

    const refreshHash = await AuthPasswordService.hashRefreshToken("refresh-token");
    expect(await AuthPasswordService.verifyRefreshToken("refresh-token", refreshHash)).toBe(true);
    expect(await AuthPasswordService.verifyRefreshToken("wrong-token", refreshHash)).toBe(false);

    await expect(AuthPasswordService.hashPassword("   ")).rejects.toThrow("value must not be empty");
    await expect(AuthPasswordService.hashRefreshToken("")).rejects.toThrow("value must not be empty");
    await expect(AuthPasswordService.verifyPassword("", passwordHash)).resolves.toBe(false);
    await expect(AuthPasswordService.verifyRefreshToken("token", "")).resolves.toBe(false);
  });

  it("issues and verifies access and refresh tokens", async () => {
    const { AuthTokenService } = await import("../../common/auth/token.service.js");

    const pair = AuthTokenService.issueTokenPair("user-id", "user@example.com");

    expect(AuthTokenService.verifyAccessToken(pair.accessToken)).toMatchObject({
      sub: "user-id",
      email: "user@example.com",
      type: "access",
    });

    expect(AuthTokenService.verifyRefreshToken(pair.refreshToken)).toMatchObject({
      sub: "user-id",
      email: "user@example.com",
      type: "refresh",
    });
  });

  it("rejects wrong token type", async () => {
    const { AuthTokenService } = await import("../../common/auth/token.service.js");
    const accessSecret = process.env.JWT_ACCESS_TOKEN_SECRET as string;

    const refreshTypedAccessToken = jwt.sign(
      { sub: "user-id", email: "user@example.com", type: "refresh" },
      accessSecret
    );

    expect(() => AuthTokenService.verifyAccessToken(refreshTypedAccessToken)).toThrow(
      "invalid token type"
    );
  });

  it("rejects invalid token payload shape and non-object payload", async () => {
    const { AuthTokenService } = await import("../../common/auth/token.service.js");
    const refreshSecret = process.env.JWT_REFRESH_TOKEN_SECRET as string;

    const missingEmailToken = jwt.sign({ sub: "user-id", type: "refresh" }, refreshSecret);
    expect(() => AuthTokenService.verifyRefreshToken(missingEmailToken)).toThrow(
      "invalid token payload shape"
    );

    const stringPayloadToken = jwt.sign("text-payload", refreshSecret);
    expect(() => AuthTokenService.verifyRefreshToken(stringPayloadToken)).toThrow(
      "invalid token payload"
    );
  });

  it("sets and clears cookies including optional domain", async () => {
    process.env.AUTH_COOKIE_DOMAIN = "example.com";
    jest.resetModules();

    const { AuthCookieService } = await import("../../common/auth/cookie.service.js");

    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    AuthCookieService.setAuthCookies(res as never, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    AuthCookieService.clearAuthCookies(res as never);

    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);

    const firstCookieOptions = res.cookie.mock.calls[0][2] as { domain?: string; httpOnly: boolean };
    expect(firstCookieOptions.httpOnly).toBe(true);
    expect(firstCookieOptions.domain).toBe("example.com");
  });
});
