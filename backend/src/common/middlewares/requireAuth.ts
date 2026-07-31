import type { Request, Response, NextFunction } from "express";
import { AuthTokenService } from "../auth/token.service.js";
import { authConfig } from "../auth/auth.config.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
    };
  }
}

const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[authConfig.accessToken.cookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return undefined;
};

/**
 * Verifies the access token (cookie or Bearer header) and attaches the
 * authenticated user to the request. Responds with 401 when missing/invalid.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
      requestId: req.requestId ?? "-",
    });
    return;
  }

  try {
    const payload = AuthTokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "Invalid or expired session",
      },
      requestId: req.requestId ?? "-",
    });
  }
};
