import type { AuthConfig } from "./auth.types.js";

const MIN_BCRYPT_SALT_ROUNDS = 10;
const MAX_BCRYPT_SALT_ROUNDS = 12;

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
};

const getRequiredIntegerEnv = (name: string): number => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

const getSameSitePolicy = (): "strict" | "lax" | "none" => {
  const raw = process.env.AUTH_COOKIE_SAME_SITE?.toLowerCase();
  if (!raw) {
    return "lax";
  }

  if (raw === "strict" || raw === "lax" || raw === "none") {
    return raw;
  }

  throw new Error("AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none");
};

const normalizeBcryptSaltRounds = (rounds: number): number => {
  if (rounds < MIN_BCRYPT_SALT_ROUNDS || rounds > MAX_BCRYPT_SALT_ROUNDS) {
    throw new Error(
      `AUTH_BCRYPT_SALT_ROUNDS must be between ${MIN_BCRYPT_SALT_ROUNDS} and ${MAX_BCRYPT_SALT_ROUNDS}`
    );
  }

  return rounds;
};

const sameSite = getSameSitePolicy();
const explicitSecure = process.env.AUTH_COOKIE_SECURE;
const secureCookies =
  explicitSecure === undefined ? process.env.NODE_ENV === "production" : explicitSecure === "true";

if (sameSite === "none" && !secureCookies) {
  throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none");
}

export const authConfig: AuthConfig = {
  bcryptSaltRounds: normalizeBcryptSaltRounds(getRequiredIntegerEnv("AUTH_BCRYPT_SALT_ROUNDS")),
  accessToken: {
    secret: getRequiredEnv("JWT_ACCESS_TOKEN_SECRET"),
    maxAgeMs: getRequiredIntegerEnv("JWT_ACCESS_TOKEN_MAX_AGE_MS"),
    cookieName: process.env.ACCESS_TOKEN_COOKIE_NAME ?? "accessToken",
  },
  refreshToken: {
    secret: getRequiredEnv("JWT_REFRESH_TOKEN_SECRET"),
    maxAgeMs: getRequiredIntegerEnv("JWT_REFRESH_TOKEN_MAX_AGE_MS"),
    cookieName: process.env.REFRESH_TOKEN_COOKIE_NAME ?? "refreshToken",
  },
  cookies: {
    secure: secureCookies,
    sameSite,
    domain: process.env.AUTH_COOKIE_DOMAIN,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },
};
