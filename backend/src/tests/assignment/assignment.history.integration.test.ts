import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

const deleteBlobMock = jest.fn().mockResolvedValue(undefined);

jest.mock("../../common/services/s3Upload.js", () => ({
  deleteBlob: (...args: unknown[]) => deleteBlobMock(...args),
  fetchBlobAsBuffer: jest.fn(),
}));

// The analysis pipeline pulls in heavy modules (pdf/zip processors, Gemini) that
// are irrelevant to the history list/delete endpoints under test.
jest.mock("../../features/assignment/services/assignmentAnalysisService.js", () => ({
  AssignmentAnalysisService: {},
}));
jest.mock("../../features/assignment/services/aiAnalysisService.js", () => ({
  AIAnalysisService: {},
}));
jest.mock("../../features/assignment/services/resultsService.js", () => ({
  ResultsService: { getStatusMessage: jest.fn() },
}));
jest.mock("../../common/utils/zipProcessor.js", () => ({
  ZipProcessor: {},
}));

import { authConfig } from "../../common/auth/auth.config.js";
import { AuthTokenService } from "../../common/auth/token.service.js";
import { errorHandler } from "../../common/middlewares/errorHandler.js";
import assignmentRoutes from "../../features/assignment/routes/assignment.routes.js";
import { AssignmentFeedback } from "../../features/assignment/models/assignmentFeedback.model.js";

const authCookie = (userId: string, email = "user@example.com"): string => {
  const token = AuthTokenService.signAccessToken(userId, email);
  return `${authConfig.accessToken.cookieName}=${token}`;
};

const seedAssignment = (userId: string, overrides: Record<string, unknown> = {}) =>
  AssignmentFeedback.create({
    userId,
    requirementsFileKey: `assignments/${userId}/req.pdf`,
    solutionFileKey: `assignments/${userId}/solution.zip`,
    status: "completed",
    metadata: {
      detectedLanguage: "TypeScript",
      detectedFrameworks: ["Express"],
      totalFiles: 12,
      totalLines: 3400,
      sourceCodeContent: { "index.ts": "console.log('secret source')" },
      extractedRequirements: "a very long requirements string",
    },
    aiFeedback: {
      overall: { score: 88, grade: "A", summary: "Great work" },
    },
    ...overrides,
  });

describe("Assignment history API integration", () => {
  let mongoServer: MongoMemoryServer;
  let testApp: Express;

  beforeAll(async () => {
    testApp = express();
    testApp.use(express.json());
    testApp.use(cookieParser());
    testApp.use("/api/assignments", assignmentRoutes);
    testApp.use(errorHandler);

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterEach(async () => {
    await AssignmentFeedback.deleteMany({});
    deleteBlobMock.mockClear();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe("GET /api/assignments/user/:userId", () => {
    it("requires authentication", async () => {
      const userId = new Types.ObjectId().toString();
      const res = await request(testApp).get(`/api/assignments/user/${userId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("forbids listing another user's assignments", async () => {
      const userId = new Types.ObjectId().toString();
      const otherUserId = new Types.ObjectId().toString();

      const res = await request(testApp)
        .get(`/api/assignments/user/${otherUserId}`)
        .set("Cookie", [authCookie(userId)]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns a slim list with AI scores and total, excluding heavy metadata", async () => {
      const userId = new Types.ObjectId().toString();
      await seedAssignment(userId);
      await seedAssignment(userId, { status: "failed", aiFeedback: undefined });

      const res = await request(testApp)
        .get(`/api/assignments/user/${userId}`)
        .set("Cookie", [authCookie(userId)]);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.assignments).toHaveLength(2);

      const completed = res.body.assignments.find(
        (a: { status: string }) => a.status === "completed"
      );
      expect(completed.aiFeedback).toEqual({
        score: 88,
        grade: "A",
        summary: "Great work",
      });
      expect(completed.metadata.detectedLanguage).toBe("TypeScript");
      expect(completed.metadata.totalFiles).toBe(12);
      // Heavy fields must NOT be part of the list payload.
      expect(completed.metadata.sourceCodeContent).toBeUndefined();
      expect(completed.metadata.extractedRequirements).toBeUndefined();
    });
  });

  describe("GET /api/assignments/:assignmentId", () => {
    it("requires authentication", async () => {
      const userId = new Types.ObjectId().toString();
      const doc = await seedAssignment(userId);

      const res = await request(testApp).get(`/api/assignments/${doc._id}`);

      expect(res.status).toBe(401);
    });

    it("returns the assignment to its owner", async () => {
      const userId = new Types.ObjectId().toString();
      const doc = await seedAssignment(userId);

      const res = await request(testApp)
        .get(`/api/assignments/${doc._id}`)
        .set("Cookie", [authCookie(userId)]);

      expect(res.status).toBe(200);
      expect(res.body.assignment.id).toBe(String(doc._id));
    });

    it("forbids access to another user's assignment", async () => {
      const ownerId = new Types.ObjectId().toString();
      const attackerId = new Types.ObjectId().toString();
      const doc = await seedAssignment(ownerId);

      const res = await request(testApp)
        .get(`/api/assignments/${doc._id}`)
        .set("Cookie", [authCookie(attackerId)]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("DELETE /api/assignments/:assignmentId", () => {
    it("requires authentication", async () => {
      const assignmentId = new Types.ObjectId().toString();
      const res = await request(testApp).delete(`/api/assignments/${assignmentId}`);

      expect(res.status).toBe(401);
    });

    it("deletes the owner's assignment and cleans up its stored files", async () => {
      const userId = new Types.ObjectId().toString();
      const doc = await seedAssignment(userId);

      const res = await request(testApp)
        .delete(`/api/assignments/${doc._id}`)
        .set("Cookie", [authCookie(userId)]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const remaining = await AssignmentFeedback.findById(doc._id);
      expect(remaining).toBeNull();
      expect(deleteBlobMock).toHaveBeenCalledTimes(2);
    });

    it("does not delete an assignment owned by another user", async () => {
      const ownerId = new Types.ObjectId().toString();
      const attackerId = new Types.ObjectId().toString();
      const doc = await seedAssignment(ownerId);

      const res = await request(testApp)
        .delete(`/api/assignments/${doc._id}`)
        .set("Cookie", [authCookie(attackerId)]);

      expect(res.status).toBe(404);
      const stillThere = await AssignmentFeedback.findById(doc._id);
      expect(stillThere).not.toBeNull();
      expect(deleteBlobMock).not.toHaveBeenCalled();
    });
  });
});
