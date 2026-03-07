import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import type { RequestHandler } from "express";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { logger } from "./common/middlewares/logger.js";
import { requestId } from "./common/middlewares/requestId.js";
import authRoutes from "./features/auth/routes/auth.routes.js";
import commentRoutes from "./features/comment/routes/comment.routes.js";
import postRoutes from "./features/post/routes/post.routes.js";
import uploadRouter from "./features/upload/routes/upload.routes.js";
import userRoutes from "./features/user/routes/user.routes.js";
import assignmentRoutes from "./features/assignment/routes/assignment.routes.js";
import internalRoutes from "./features/assignment/routes/internal.routes.js";

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
app.use("/api/assignments", assignmentRoutes);

app.use("/api/v1/internal", internalRoutes);

app.use(errorHandler);

export default app;
