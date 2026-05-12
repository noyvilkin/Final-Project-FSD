process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET ?? "test-access-secret-1234567890";
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET ?? "test-refresh-secret-1234567890";
process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? "15m";
process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? "7d";
process.env.JWT_ACCESS_TOKEN_MAX_AGE_MS = process.env.JWT_ACCESS_TOKEN_MAX_AGE_MS ?? "900000";
process.env.JWT_REFRESH_TOKEN_MAX_AGE_MS = process.env.JWT_REFRESH_TOKEN_MAX_AGE_MS ?? "604800000";
process.env.AUTH_BCRYPT_SALT_ROUNDS = process.env.AUTH_BCRYPT_SALT_ROUNDS ?? "10";
process.env.ACCESS_TOKEN_COOKIE_NAME = process.env.ACCESS_TOKEN_COOKIE_NAME ?? "accessToken";
process.env.REFRESH_TOKEN_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME ?? "refreshToken";
process.env.AUTH_COOKIE_SECURE = process.env.AUTH_COOKIE_SECURE ?? "false";
process.env.AUTH_COOKIE_SAME_SITE = process.env.AUTH_COOKIE_SAME_SITE ?? "lax";

// S3 / MinIO — required at module-load time by common/services/s3Upload.ts.
// Tests mock the file service so these values are never used, but they must
// be present for the module to import.
process.env.S3_ENDPOINT          = process.env.S3_ENDPOINT          ?? "http://localhost:9000";
process.env.S3_ACCESS_KEY_ID     = process.env.S3_ACCESS_KEY_ID     ?? "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "test-secret-key";
process.env.S3_BUCKET_NAME       = process.env.S3_BUCKET_NAME       ?? "test-bucket";
