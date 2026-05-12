import { Types } from "mongoose";

import { appLogger } from "../../../common/services/logger.js";
import {
  ProfessionalDNA,
  type IProfessionalDNA,
} from "../../resume/models/professionalDNA.model.js";
import type {
  IDnaAuditEntry,
  ISkill,
} from "../../resume/types/professionalDNA.types.js";

// ---------------------------------------------------------------------------
// Proficiency ladder + safety clamps
// ---------------------------------------------------------------------------

type ProficiencyLevel = ISkill["proficiencyLevel"];

const PROFICIENCY_LADDER: ProficiencyLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

const MAX_BOOST_STEPS_PER_INTERVIEW = 1;
// MAX_DROP_STEPS_PER_INTERVIEW = 1; — reserved for future "drop on demonstrated
// weakness" pathway. Enrichment currently never drops proficiency.

function rank(level: ProficiencyLevel): number {
  return PROFICIENCY_LADDER.indexOf(level);
}

function fromRank(idx: number): ProficiencyLevel {
  const clamped = Math.max(0, Math.min(PROFICIENCY_LADDER.length - 1, idx));
  return PROFICIENCY_LADDER[clamped];
}

// ---------------------------------------------------------------------------
// Demonstrated-skill detection
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A skill counts as "demonstrated" in the interview if its canonical name
// appears in the transcript as a whole word (case-insensitive).
export function findDemonstratedSkills(
  skills: ISkill[],
  transcript: string
): ISkill[] {
  const lower = transcript.toLowerCase();
  return skills.filter((s) => {
    const pattern = new RegExp(`\\b${escapeRegExp(s.name.toLowerCase())}\\b`);
    return pattern.test(lower);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnrichDnaFromInterviewArgs {
  userId:          string;
  interviewJobId:  string;
  transcript:      string;
  readinessScore:  number;
}

export interface EnrichDnaFromInterviewResult {
  dnaVersion:        number;
  skillsBoosted:     Array<{ name: string; from: ProficiencyLevel; to: ProficiencyLevel }>;
  newProfessionalDnaId: string;
  /** True when there was no prior DNA to enrich. */
  noPriorDna?:       boolean;
}

/**
 * enrichDnaFromInterview — applies one interview's outcomes to the user's
 * Professional DNA:
 *
 *   1. Load the latest DNA (by dnaVersion if present, else createdAt).
 *   2. For each skill that appears in the transcript, boost proficiency by
 *      one ladder step (clamped to 'expert').
 *   3. Never drops a skill by more than MAX_DROP_STEPS_PER_INTERVIEW.
 *   4. Persist a NEW DNA document with dnaVersion+1 and an auditTrail entry.
 *
 * Safe to no-op: if the user has no prior DNA we return early — Mission 03
 * shouldn't be the layer that creates the very first DNA doc.
 */
export async function enrichDnaFromInterview(
  args: EnrichDnaFromInterviewArgs
): Promise<EnrichDnaFromInterviewResult> {
  const userObjectId = new Types.ObjectId(args.userId);

  // 1) Load latest DNA. dnaVersion is optional on docs created before
  //    Mission 03 — sort on (dnaVersion desc, createdAt desc) to handle both.
  const latest = (await ProfessionalDNA
    .findOne({ userId: userObjectId })
    .sort({ dnaVersion: -1, createdAt: -1 })) as IProfessionalDNA | null;

  if (!latest) {
    appLogger.info("DNA enrichment skipped — no prior DNA for user", {
      userId: args.userId,
    });
    return {
      dnaVersion:        0,
      skillsBoosted:     [],
      newProfessionalDnaId: "",
      noPriorDna:        true,
    };
  }

  // 2) Find demonstrated skills.
  const demonstrated = findDemonstratedSkills(latest.skills ?? [], args.transcript);
  const demonstratedNames = new Set(demonstrated.map((s) => s.name.toLowerCase()));

  // 3) Apply boost with clamp.
  const boosts: EnrichDnaFromInterviewResult["skillsBoosted"] = [];

  const newSkills: ISkill[] = (latest.skills ?? []).map((s) => {
    if (!demonstratedNames.has(s.name.toLowerCase())) return s;

    const fromIdx = rank(s.proficiencyLevel);
    const toIdx   = Math.min(
      fromIdx + MAX_BOOST_STEPS_PER_INTERVIEW,
      PROFICIENCY_LADDER.length - 1
    );

    if (toIdx === fromIdx) return s; // already at expert

    const next: ISkill = { ...s, proficiencyLevel: fromRank(toIdx) };
    boosts.push({ name: s.name, from: s.proficiencyLevel, to: next.proficiencyLevel });
    return next;
  });

  // 4) Persist new DNA doc.
  const nextVersion = (latest.dnaVersion ?? 1) + 1;

  const auditEntry: IDnaAuditEntry = {
    source:    "interview",
    refId:     args.interviewJobId,
    summary:   boosts.length > 0
      ? `Interview ${args.interviewJobId} boosted ${boosts.length} skill(s); readiness ${Math.round(args.readinessScore)}`
      : `Interview ${args.interviewJobId} reviewed; no skill changes`,
    timestamp: new Date(),
  };

  const auditTrail: IDnaAuditEntry[] = [
    ...(latest.auditTrail ?? []),
    auditEntry,
  ];

  const next = await ProfessionalDNA.create({
    userId:         userObjectId,
    resumeId:       latest.resumeId,
    skills:         newSkills,
    experience:     latest.experience,
    education:      latest.education,
    gapAnalysis:    latest.gapAnalysis,
    rawResumeText:  latest.rawResumeText,
    analysisStatus: latest.analysisStatus,
    dnaVersion:     nextVersion,
    auditTrail,
  });

  appLogger.info("DNA enriched from interview", {
    userId:         args.userId,
    dnaVersion:     nextVersion,
    skillsBoosted:  boosts.length,
    interviewJobId: args.interviewJobId,
  });

  return {
    dnaVersion:           nextVersion,
    skillsBoosted:        boosts,
    newProfessionalDnaId: (next._id as Types.ObjectId).toString(),
  };
}
