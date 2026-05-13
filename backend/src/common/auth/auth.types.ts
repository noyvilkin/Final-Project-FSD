export type AuthTokenType = "access" | "refresh";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  type: AuthTokenType;
}

export interface AuthPublicUser {
  id: string;
  email: string;
  profile: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    linkedIn?: string;
  };
}

export interface AuthCookiePolicy {
  name: string;
  maxAgeMs: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
}

export interface AuthConfig {
  bcryptSaltRounds: number;
  accessToken: {
    secret: string;
    expiresIn: string;
    maxAgeMs: number;
    cookieName: string;
  };
  refreshToken: {
    secret: string;
    expiresIn: string;
    maxAgeMs: number;
    cookieName: string;
  };
  cookies: {
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
    domain?: string;
  };
}
