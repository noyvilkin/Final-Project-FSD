import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { ProfessionalDNA } from "../../features/resume/models/professionalDNA.model.js";
import type { ISkill } from "../../features/resume/types/professionalDNA.types.js";
import {
  enrichDnaFromInterview,
  findDemonstratedSkills,
} from "../../features/interview/services/dnaEnrichment.js";

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await ProfessionalDNA.deleteMany({});
});

function seedDna(userId: string, skills: ISkill[], dnaVersion?: number) {
  return ProfessionalDNA.create({
    userId: new Types.ObjectId(userId),
    skills,
    experience: [],
    education:  [],
    analysisStatus: "completed",
    dnaVersion,
  });
}

describe("findDemonstratedSkills", () => {
  it("matches case-insensitive whole-word", () => {
    const skills: ISkill[] = [
      { name: "TypeScript", category: "technical", proficiencyLevel: "intermediate" },
      { name: "Kafka",      category: "technical", proficiencyLevel: "beginner" },
      { name: "Java",       category: "technical", proficiencyLevel: "expert" },
    ];
    const transcript = "I migrated the codebase to typescript, no Kafka involved.";

    const result = findDemonstratedSkills(skills, transcript);
    const names  = result.map((s) => s.name);

    expect(names).toContain("TypeScript");
    expect(names).toContain("Kafka");
    // "Java" should not match "javascript" or anything else
    expect(names).not.toContain("Java");
  });
});

describe("enrichDnaFromInterview", () => {
  it("returns noPriorDna when the user has no DNA yet", async () => {
    const userId = new Types.ObjectId().toString();

    const result = await enrichDnaFromInterview({
      userId,
      interviewJobId: new Types.ObjectId().toString(),
      transcript:     "anything",
      readinessScore: 70,
    });

    expect(result.noPriorDna).toBe(true);
    expect(result.skillsBoosted).toEqual([]);
    expect(await ProfessionalDNA.countDocuments({})).toBe(0);
  });

  it("boosts demonstrated skills by one ladder step and bumps dnaVersion", async () => {
    const userId = new Types.ObjectId().toString();
    const jobId  = new Types.ObjectId().toString();
    await seedDna(userId, [
      { name: "TypeScript", category: "technical", proficiencyLevel: "intermediate" },
      { name: "Kafka",      category: "technical", proficiencyLevel: "beginner" },
      { name: "Rust",       category: "technical", proficiencyLevel: "beginner" },
    ], 3);

    const result = await enrichDnaFromInterview({
      userId,
      interviewJobId: jobId,
      transcript:     "We used TypeScript and Kafka across the migration.",
      readinessScore: 80,
    });

    expect(result.noPriorDna).toBeUndefined();
    expect(result.dnaVersion).toBe(4);
    expect(result.skillsBoosted).toHaveLength(2);
    expect(result.skillsBoosted.map((b) => b.name).sort()).toEqual(["Kafka", "TypeScript"]);

    const newDna = await ProfessionalDNA.findById(result.newProfessionalDnaId);
    expect(newDna).not.toBeNull();
    expect(newDna!.dnaVersion).toBe(4);
    const byName = (n: string) => newDna!.skills.find((s) => s.name === n)!;
    expect(byName("TypeScript").proficiencyLevel).toBe("advanced");
    expect(byName("Kafka").proficiencyLevel).toBe("intermediate");
    expect(byName("Rust").proficiencyLevel).toBe("beginner"); // not in transcript
    expect(newDna!.auditTrail?.length).toBe(1);
    expect(newDna!.auditTrail?.[0].source).toBe("interview");
    expect(newDna!.auditTrail?.[0].refId).toBe(jobId);
  });

  it("never boosts past 'expert' (proficiency cap)", async () => {
    const userId = new Types.ObjectId().toString();
    await seedDna(userId, [
      { name: "TypeScript", category: "technical", proficiencyLevel: "expert" },
    ], 1);

    const result = await enrichDnaFromInterview({
      userId,
      interviewJobId: new Types.ObjectId().toString(),
      transcript:     "TypeScript TypeScript TypeScript",
      readinessScore: 90,
    });

    expect(result.skillsBoosted).toEqual([]);
    const newDna = await ProfessionalDNA.findById(result.newProfessionalDnaId);
    expect(newDna!.skills[0].proficiencyLevel).toBe("expert");
    expect(newDna!.dnaVersion).toBe(2);
  });

  it("appends to the auditTrail of the latest DNA", async () => {
    const userId = new Types.ObjectId().toString();
    const prev   = await seedDna(userId, [
      { name: "TypeScript", category: "technical", proficiencyLevel: "intermediate" },
    ], 1);
    prev.auditTrail = [{
      source:    "resume",
      summary:   "Initial DNA from resume upload",
      timestamp: new Date(),
    }];
    await prev.save();

    const result = await enrichDnaFromInterview({
      userId,
      interviewJobId: "abc123",
      transcript:     "Used TypeScript heavily.",
      readinessScore: 80,
    });

    const newDna = await ProfessionalDNA.findById(result.newProfessionalDnaId);
    expect(newDna!.auditTrail?.length).toBe(2);
    expect(newDna!.auditTrail?.[0].source).toBe("resume");
    expect(newDna!.auditTrail?.[1].source).toBe("interview");
  });

  it("works when the latest DNA has no dnaVersion (backward-compat)", async () => {
    const userId = new Types.ObjectId().toString();
    // Seed a doc with no dnaVersion (simulating data created before Mission 03).
    await ProfessionalDNA.collection.insertOne({
      userId: new Types.ObjectId(userId),
      skills: [
        { name: "TypeScript", category: "technical", proficiencyLevel: "intermediate" },
      ],
      experience: [],
      education:  [],
      analysisStatus: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await enrichDnaFromInterview({
      userId,
      interviewJobId: new Types.ObjectId().toString(),
      transcript:     "Used TypeScript today.",
      readinessScore: 80,
    });

    expect(result.dnaVersion).toBe(2); // (undefined ?? 1) + 1
  });
});
