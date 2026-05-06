import type { CookieOptions, Response } from "express";
import { authConfig } from "./auth.config.js";
import type { AuthTokenPair } from "./token.service.js";

export class AuthCookieService {
  private static readonly ACCESS_COOKIE_PATH = "/";
  private static readonly REFRESH_COOKIE_PATH = "/";

  static setAuthCookies(res: Response, tokenPair: AuthTokenPair): void {
    res.cookie(
      authConfig.accessToken.cookieName,
      tokenPair.accessToken,
      this.buildCookieOptions(authConfig.accessToken.maxAgeMs, this.ACCESS_COOKIE_PATH)
    );

    res.cookie(
      authConfig.refreshToken.cookieName,
      tokenPair.refreshToken,
      this.buildCookieOptions(authConfig.refreshToken.maxAgeMs, this.REFRESH_COOKIE_PATH)
    );
  }

  static clearAuthCookies(res: Response): void {
    res.clearCookie(
      authConfig.accessToken.cookieName,
      this.buildCookieOptions(authConfig.accessToken.maxAgeMs, this.ACCESS_COOKIE_PATH)
    );

    res.clearCookie(
      authConfig.refreshToken.cookieName,
      this.buildCookieOptions(authConfig.refreshToken.maxAgeMs, this.REFRESH_COOKIE_PATH)
    );
  }

  private static buildCookieOptions(maxAgeMs: number, path: string): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      secure: authConfig.cookies.secure,
      sameSite: authConfig.cookies.sameSite,
      maxAge: maxAgeMs,
      path,
    };

    if (authConfig.cookies.domain) {
      options.domain = authConfig.cookies.domain;
    }

    return options;
  }
}
