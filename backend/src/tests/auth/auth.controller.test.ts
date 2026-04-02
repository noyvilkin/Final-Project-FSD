import type { Request, Response } from "express";

import { logout, signUp } from "../../features/auth/controllers/authController.js";
import { AuthService, AuthServiceError } from "../../features/auth/services/authService.js";

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

const createMockResponse = (): MockResponse => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as MockResponse;

  res.status.mockReturnValue(res);
  return res;
};

describe("Auth controller branch coverage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rethrows unexpected errors from signUp", async () => {
    jest.spyOn(AuthService, "signUp").mockRejectedValue(new Error("unexpected"));

    const req = {
      body: { email: "x@example.com", password: "Password123!" },
      requestId: "req-1",
    } as Request;

    const res = createMockResponse();

    await expect(signUp(req, res)).rejects.toThrow("unexpected");
  });

  it("returns structured auth error from logout when service throws AuthServiceError", async () => {
    jest
      .spyOn(AuthService, "logout")
      .mockRejectedValue(new AuthServiceError("invalid refresh token", 401, "INVALID_REFRESH_TOKEN"));

    const req = {
      cookies: {},
      requestId: "req-2",
    } as Request;

    const res = createMockResponse();

    await logout(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "invalid refresh token",
      },
      requestId: "req-2",
    });
  });
});
