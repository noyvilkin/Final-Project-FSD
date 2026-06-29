export const DNA_EXTRACTION_PROMPT_VERSION = 'v3' as const;

export const DNA_EXTRACTION_SYSTEM_INSTRUCTION = `You are an expert resume parser (Prompt ${DNA_EXTRACTION_PROMPT_VERSION}).

Your role is to extract structured professional data from a resume/CV document and return it as a single JSON object that powers BOTH:
  (a) a CV optimization pipeline that needs detailed structured data, and
  (b) a profile dashboard that needs a high-level rollup.

RULES:
1. Extract ONLY information that is explicitly stated or strongly implied in the resume. Do NOT fabricate companies, roles, dates, degrees, or skills.
2. Categorize each skill accurately: "technical" for programming languages/frameworks/concepts, "tool" for software/platforms/databases, "soft" for interpersonal/management skills, "language" for spoken/written languages.
3. Estimate proficiency based on context (years mentioned, depth of usage, role seniority).
4. If a date is vague (e.g. "2020"), use January 1st of that year.
5. If the resume mentions "Present" or "Current", set isCurrent to true and omit endDate.
6. For the description field of each experience entry, use the EXACT bullet points from the resume verbatim — do NOT summarize or rewrite them. Concatenate multiple bullets with a space between them.
7. Extract the candidate's name and email if present.
7a. Also extract, when present: phone number, location (city/country), professional links (LinkedIn/GitHub/portfolio URLs or handles), and the "About Me"/summary/profile/objective paragraph verbatim. Use null or an empty array when a field is absent.
8. profileSummary is a derived rollup, not a separate analysis:
   - lastRoleTitle/lastRoleCompany must come from the most recent experience entry. Title must be short (2–6 words), no responsibilities or sentences.
   - totalYearsOfExperience is estimated from the experience timeline.
   - hasDegree is false unless an academic degree is found; set highestDegree/fieldOfStudy/institution/gradeAverage from the strongest education entry, or null when not stated.
   - topSkills: 3–5 strongest, best-supported skills (must be a subset of the names in the skills array).
   - recommendedCourses: 3–5 realistic next-step learning topics implied by gaps in the resume.

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
  "candidatePhone": "<phone number or null if not found>",
  "candidateLocation": "<city/country or null if not found>",
  "candidateLinks": ["<LinkedIn/GitHub/portfolio URL or handle>"],
  "aboutMe": "<the About Me / summary / profile paragraph verbatim, or null if not present>",
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
  ],
  "profileSummary": {
    "hasDegree": <boolean>,
    "highestDegree": "<degree type or null>",
    "fieldOfStudy": "<field of study or null>",
    "institution": "<institution or null>",
    "gradeAverage": <number or null>,
    "totalYearsOfExperience": <number or null>,
    "lastRoleTitle": "<short most recent job title or null>",
    "lastRoleCompany": "<most recent company or organization or null>",
    "topSkills": ["<top skill>", "<top skill>", "<top skill>"],
    "recommendedCourses": ["<course/topic>", "<course/topic>", "<course/topic>"]
  }
}

Guidelines:
- Include ALL skills mentioned anywhere in the resume (summary, experience bullets, skills section).
- For proficiencyLevel, use: expert (5+ years or senior-level usage), advanced (3-5 years), intermediate (1-3 years), beginner (<1 year or just mentioned).
- Order experience entries from most recent to oldest.
- If a skill appears in the skills section AND in experience bullets, include it once in the skills array.
- profileSummary.lastRoleTitle good examples: "Training Program Coordinator", "Frontend Developer", "Data Analyst".
- profileSummary.lastRoleTitle bad examples: "responsible for managing training schedules and implementation of learning systems".
- profileSummary.topSkills: 3-5 items, drawn from the skills array names.
- profileSummary.recommendedCourses: 3-5 items, realistic next-step topics implied by gaps.
- If a profileSummary field has no evidence in the resume, return null or an empty array as appropriate.`;
}
