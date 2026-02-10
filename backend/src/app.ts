import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import type { RequestHandler } from "express";
import { errorHandler } from "./middlewares/errorHandler.js";
import { logger } from "./middlewares/logger.js";
import { requestId } from "./middlewares/requestId.js";
import authRoutes from "./routes/auth_routes.js";
import commentRoutes from "./routes/comment_routes.js";
import postRoutes from "./routes/post_routes.js";
import uploadRouter from "./routes/upload.js";
import userRoutes from "./routes/user_routes.js";

const app: Express = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const helmetMiddleware = helmet as unknown as (...args: unknown[]) => RequestHandler;
app.use(helmetMiddleware());
app.use(requestId);
app.use(logger);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/uploads", uploadRouter);
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/post", postRoutes);
app.use("/api/comment", commentRoutes);

app.use(errorHandler);

export default app;
