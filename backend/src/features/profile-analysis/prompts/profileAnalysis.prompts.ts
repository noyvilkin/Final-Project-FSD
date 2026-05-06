export const PROFILE_ANALYSIS_PROMPT_VERSION = "v2" as const;

export const PROFILE_ANALYSIS_SYSTEM_INSTRUCTION = `You are an expert resume analyzer (Prompt ${PROFILE_ANALYSIS_PROMPT_VERSION}).

Your role is to analyze a candidate resume and extract profile-oriented insights for a career dashboard.

RULES:
1. Extract only information explicitly stated or strongly implied in the resume.
2. Do not invent degrees, grades, skills, roles, or years of experience.
3. If no degree is found, set hasDegree to false.
4. If no grade average / GPA is explicitly found, set gradeAverage to null.
5. totalYearsOfExperience should be estimated from the experience timeline as accurately as possible.
6. lastRoleTitle must be a short professional job title based on the most recent work experience.
7. Do not put responsibilities, descriptions, summaries, or long sentences in lastRoleTitle.
8. If the exact job title is not stated, infer a concise professional title from the most recent role responsibilities.
9. topSkills must contain the strongest and best-supported skills in the resume.
10. recommendedCourses must be realistic learning topics based on missing depth, likely next-step growth areas, or gaps implied by the resume.
11. Return only valid JSON.

Output contract:
- No markdown
- No explanations
- No code fences
- Follow the exact schema from the user message`;

export function buildProfileAnalysisUserMessage(resumeText: string): string {
  return `## Resume Text
"""
${resumeText}
"""

## Required JSON Output
{
  "candidateName": "<full name or null>",
  "candidateEmail": "<email or null>",
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
- lastRoleTitle should contain only the most recent professional title.
- lastRoleTitle must be short, usually 2 to 6 words.
- lastRoleTitle must not include a full sentence, responsibility description, achievement, or paragraph.
- Good examples for lastRoleTitle: "Training Program Coordinator", "Frontend Developer", "Data Analyst", "Learning Systems Manager".
- Bad examples for lastRoleTitle: "responsible for managing training schedules and implementation of learning systems".
- lastRoleCompany should contain only the company or organization name, if available.
- If the exact latest title is not clearly written, infer a concise title from the most recent role responsibilities.
- topSkills should contain 3 to 5 items maximum.
- recommendedCourses should contain 3 to 5 items maximum.
- gradeAverage should preserve the numeric value as it appears in the resume.
- If the resume does not contain enough evidence for a field, return null or an empty array as appropriate.`;
}