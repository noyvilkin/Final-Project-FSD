export const DNA_EXTRACTION_PROMPT_VERSION = 'v1' as const;

export const DNA_EXTRACTION_SYSTEM_INSTRUCTION = `You are an expert resume parser (Prompt ${DNA_EXTRACTION_PROMPT_VERSION}).

Your role is to extract structured professional data from a resume/CV document and return it as a JSON object that can be stored in a database.

RULES:
1. Extract ONLY information that is explicitly stated or strongly implied in the resume.
2. Do NOT fabricate companies, roles, dates, degrees, or skills that are not mentioned.
3. Categorize each skill accurately: "technical" for programming languages/frameworks/concepts, "tool" for software/platforms/databases, "soft" for interpersonal/management skills, "language" for spoken/written languages.
4. Estimate proficiency based on context (years mentioned, depth of usage, role seniority).
5. If a date is vague (e.g. "2020"), use January 1st of that year.
6. If the resume mentions "Present" or "Current", set isCurrent to true and omit endDate.
7. For the description field of each experience entry, use the EXACT bullet points from the resume verbatim — do NOT summarize or rewrite them. Concatenate multiple bullets with a space between them.
8. Extract the candidate's name and email if present.

Output contract:
- Return ONLY valid JSON — no markdown, no prose, no code fences.
- Follow the exact schema specified in the user message.`;

export function buildDnaExtractionUserMessage(resumeText: string): string {
  return `## Resume Text
"""
${resumeText}
"""

## Required JSON Output
Return a JSON object with this exact schema:

{
  "candidateName": "<full name or null if not found>",
  "candidateEmail": "<email or null if not found>",
  "skills": [
    {
      "name": "<skill name>",
      "category": "<technical | tool | soft | language>",
      "proficiencyLevel": "<beginner | intermediate | advanced | expert>",
      "yearsOfExperience": <number or null>
    }
  ],
  "experience": [
    {
      "company": "<company name>",
      "role": "<job title>",
      "startDate": "<ISO date string, e.g. 2020-01-01>",
      "endDate": "<ISO date string or null if current>",
      "isCurrent": <boolean>,
      "description": "<verbatim bullet points from the resume, concatenated>",
      "extractedSkills": ["<skills used in this role>"]
    }
  ],
  "education": [
    {
      "institution": "<school/university name>",
      "degree": "<degree type, e.g. B.Sc., M.Sc., B.A.>",
      "fieldOfStudy": "<major/field>",
      "startDate": "<ISO date string>",
      "endDate": "<ISO date string or null>",
      "gpa": <number 0-4 or null>
    }
  ]
}

Guidelines:
- Include ALL skills mentioned anywhere in the resume (summary, experience bullets, skills section).
- For proficiencyLevel, use: expert (5+ years or senior-level usage), advanced (3-5 years), intermediate (1-3 years), beginner (<1 year or just mentioned).
- Order experience entries from most recent to oldest.
- If a skill appears in the skills section AND in experience bullets, include it once in the skills array.`;
}
