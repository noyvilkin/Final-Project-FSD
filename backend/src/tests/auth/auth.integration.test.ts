import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

import { authConfig } from "../../common/auth/auth.config.js";
import { errorHandler } from "../../common/middlewares/errorHandler.js";
import authRoutes from "../../features/auth/routes/auth.routes.js";
import { User } from "../../features/user/models/user.model.js";

type CookieMap = Record<string, string>;

const getSetCookieHeaders = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const extractCookies = (setCookieHeaders: string[] | undefined): CookieMap => {
  if (!setCookieHeaders) {
    return {};
  }

  return setCookieHeaders.reduce<CookieMap>((acc, header) => {
    const [nameValue] = header.split(";");
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex < 1) {
      return acc;
    }

    const name = nameValue.slice(0, separatorIndex);
    acc[name] = nameValue;
    return acc;
  }, {});
};

describe("Auth API integration", () => {
  let mongoServer: MongoMemoryServer;
  let testApp: Express;

  beforeAll(async () => {
    testApp = express();
    testApp.use(express.json());
    testApp.use(cookieParser());
    testApp.use("/api/auth", authRoutes);
    testApp.use(errorHandler);

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("creates a user via signup and sets auth cookies", async () => {
    const response = await request(testApp)
      .post("/api/auth/signup")
      .send({
        email: "TestUser@example.com",
        password: "Password123!",
        profile: {
          firstName: "Test",
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("testuser@example.com");
    expect(response.body.user.profile.firstName).toBe("Test");

    const cookies = extractCookies(getSetCookieHeaders(response.headers["set-cookie"]));
    expect(cookies[authConfig.accessToken.cookieName]).toBeDefined();
    expect(cookies[authConfig.refreshToken.cookieName]).toBeDefined();
  });

  it("rejects duplicate signup with conflict", async () => {
    await request(testApp).post("/api/auth/signup").send({
      email: "duplicate@example.com",
      password: "Password123!",
    });

    const duplicate = await request(testApp).post("/api/auth/signup").send({
      email: "DUPLICATE@example.com",
      password: "Password123!",
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects signup with missing email/password", async () => {
    const response = await request(testApp).post("/api/auth/signup").send({
      email: "",
      password: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects signup with short password", async () => {
    const response = await request(testApp).post("/api/auth/signup").send({
      email: "short-password@example.com",
      password: "short",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PASSWORD");
  });

  it("rejects login with invalid credentials", async () => {
    await request(testApp).post("/api/auth/signup").send({
      email: "login@example.com",
      password: "Password123!",
    });

    const login = await request(testApp).post("/api/auth/login").send({
      email: "login@example.com",
      password: "WrongPassword!",
    });

    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in successfully and sets auth cookies", async () => {
    await request(testApp).post("/api/auth/signup").send({
      email: "login-success@example.com",
      password: "Password123!",
    });

    const login = await request(testApp).post("/api/auth/login").send({
      email: "login-success@example.com",
      password: "Password123!",
    });

    expect(login.status).toBe(200);
    const cookies = extractCookies(getSetCookieHeaders(login.headers["set-cookie"]));
    expect(cookies[authConfig.accessToken.cookieName]).toBeDefined();
    expect(cookies[authConfig.refreshToken.cookieName]).toBeDefined();
  });

  it("rejects login when email/password are missing", async () => {
    const login = await request(testApp).post("/api/auth/login").send({
      email: "",
      password: "",
    });

    expect(login.status).toBe(400);
    expect(login.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects login for inactive user", async () => {
    const signup = await request(testApp).post("/api/auth/signup").send({
      email: "inactive@example.com",
      password: "Password123!",
    });

    await User.updateOne({ email: signup.body.user.email }, { isActive: false });

    const login = await request(testApp).post("/api/auth/login").send({
      email: "inactive@example.com",
      password: "Password123!",
    });

    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects refresh when refresh cookie is missing", async () => {
    const refresh = await request(testApp).post("/api/auth/refresh").send({});

    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe("REFRESH_TOKEN_MISSING");
  });

  it("rejects refresh for malformed token", async () => {
    const malformedToken = `${authConfig.refreshToken.cookieName}=not-a-jwt`;

    const refresh = await request(testApp)
      .post("/api/auth/refresh")
      .set("Cookie", [malformedToken])
      .send({});

    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("refreshes successfully and rotates refresh token", async () => {
    const signup = await request(testApp).post("/api/auth/signup").send({
      email: "refresh-success@example.com",
      password: "Password123!",
    });

    const firstCookies = extractCookies(getSetCookieHeaders(signup.headers["set-cookie"]));
    const firstRefreshCookie = firstCookies[authConfig.refreshToken.cookieName];
    expect(firstRefreshCookie).toBeDefined();

    const refresh = await request(testApp)
      .post("/api/auth/refresh")
      .set("Cookie", [firstRefreshCookie])
      .send({});

    expect(refresh.status).toBe(200);
    const secondCookies = extractCookies(getSetCookieHeaders(refresh.headers["set-cookie"]));
    const secondRefreshCookie = secondCookies[authConfig.refreshToken.cookieName];
    expect(secondRefreshCookie).toBeDefined();
  });

  it("invalidates refresh token on logout", async () => {
    const signup = await request(testApp).post("/api/auth/signup").send({
      email: "logout@example.com",
      password: "Password123!",
    });

    const cookies = extractCookies(getSetCookieHeaders(signup.headers["set-cookie"]));
    const refreshCookie = cookies[authConfig.refreshToken.cookieName];

    expect(refreshCookie).toBeDefined();

    const logout = await request(testApp)
      .post("/api/auth/logout")
      .set("Cookie", [refreshCookie])
      .send({});

    expect(logout.status).toBe(200);

    const clearCookies = extractCookies(getSetCookieHeaders(logout.headers["set-cookie"]));
    expect(clearCookies[authConfig.accessToken.cookieName]).toBeDefined();
    expect(clearCookies[authConfig.refreshToken.cookieName]).toBeDefined();

    const refreshAfterLogout = await request(testApp)
      .post("/api/auth/refresh")
      .set("Cookie", [refreshCookie])
      .send({});

    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe("REFRESH_TOKEN_REVOKED");
  });

  it("treats logout as idempotent without refresh token", async () => {
    const logout = await request(testApp).post("/api/auth/logout").send({});

    expect(logout.status).toBe(200);
    expect(logout.body.message).toBe("logged out");
  });

  it("treats logout as idempotent with malformed refresh token", async () => {
    const malformedToken = `${authConfig.refreshToken.cookieName}=not-a-jwt`;

    const logout = await request(testApp)
      .post("/api/auth/logout")
      .set("Cookie", [malformedToken])
      .send({});

    expect(logout.status).toBe(200);
    expect(logout.body.message).toBe("logged out");
  });
});
