import { z } from 'zod';

// ----- sub-schemas (mirror ISkill / IExperience / IEducation exactly) -----

const SkillSchema = z.object({
  name: z.string(),
  category: z.enum(['technical', 'soft', 'tool', 'language']),
  proficiencyLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  yearsOfExperience: z.number().optional(),
});

const ExperienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().optional(),
  extractedSkills: z.array(z.string()).default([]),
});

const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  fieldOfStudy: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  gpa: z.number().min(0).max(4).optional(),
});

// ----- root schema -----

export const DnaSchema = z.object({
  skills: z.array(SkillSchema),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  achievements: z.array(z.string()),
});

export type DnaResult = z.infer<typeof DnaSchema>;

// ----- parser -----

export function parseDna(raw: string): DnaResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`Invalid JSON — ${msg}`);
  }

  const result = DnaSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`DNA validation failed — ${detail}`);
  }

  return result.data;
}
