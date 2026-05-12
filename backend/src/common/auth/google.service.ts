import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { authConfig } from "./auth.config.js";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

export class GoogleAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.status = status;
    this.code = code;
  }
}

let cachedClient: OAuth2Client | null = null;

const getClient = (): OAuth2Client => {
  const clientId = authConfig.google.clientId;
  if (!clientId) {
    throw new GoogleAuthError(
      "google sign-in is not configured on the server",
      503,
      "GOOGLE_AUTH_NOT_CONFIGURED"
    );
  }

  if (!cachedClient) {
    cachedClient = new OAuth2Client(clientId);
  }
  return cachedClient;
};

export class GoogleAuthService {
  static async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (!idToken || idToken.trim().length === 0) {
      throw new GoogleAuthError("google id token is required", 400, "GOOGLE_ID_TOKEN_MISSING");
    }

    const client = getClient();

    let payload: TokenPayload | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: authConfig.google.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new GoogleAuthError("invalid google id token", 401, "INVALID_GOOGLE_TOKEN");
    }

    if (!payload?.sub || !payload.email) {
      throw new GoogleAuthError("invalid google token payload", 401, "INVALID_GOOGLE_TOKEN");
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      firstName: payload.given_name,
      lastName: payload.family_name,
      picture: payload.picture,
    };
  }

  // exposed for tests so they can reset the cached client if they swap env vars
  static resetClientForTests(): void {
    cachedClient = null;
  }
}
