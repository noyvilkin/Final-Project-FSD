import type { Request, Response } from "express";
import { authConfig } from "../../../common/auth/auth.config.js";
import { AuthCookieService } from "../../../common/auth/cookie.service.js";
import { AuthService, AuthServiceError } from "../services/authService.js";

const sendAuthError = (req: Request, res: Response, error: unknown): void => {
  if (error instanceof AuthServiceError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
      },
      requestId: req.requestId ?? "-",
    });
    return;
  }

  throw error;
};

export const signUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await AuthService.signUp({
      email: String(req.body?.email ?? ""),
      password: String(req.body?.password ?? ""),
      profile: req.body?.profile,
    });

    AuthCookieService.setAuthCookies(res, result.tokenPair);

    res.status(201).json({
      user: result.user,
      requestId: req.requestId ?? "-",
    });
  } catch (error) {
    sendAuthError(req, res, error);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await AuthService.login({
      email: String(req.body?.email ?? ""),
      password: String(req.body?.password ?? ""),
    });

    AuthCookieService.setAuthCookies(res, result.tokenPair);

    res.status(200).json({
      user: result.user,
      requestId: req.requestId ?? "-",
    });
  } catch (error) {
    sendAuthError(req, res, error);
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.[authConfig.refreshToken.cookieName] as string | undefined;
    const result = await AuthService.refresh(refreshToken ?? "");

    AuthCookieService.setAuthCookies(res, result.tokenPair);

    res.status(200).json({
      user: result.user,
      requestId: req.requestId ?? "-",
    });
  } catch (error) {
    sendAuthError(req, res, error);
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.[authConfig.refreshToken.cookieName] as string | undefined;
    await AuthService.logout(refreshToken);
    AuthCookieService.clearAuthCookies(res);

    res.status(200).json({
      message: "logged out",
      requestId: req.requestId ?? "-",
    });
  } catch (error) {
    sendAuthError(req, res, error);
  }
};
