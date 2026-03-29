export const PROFILE_ANALYSIS_PROMPT_VERSION = "v1" as const;

export const PROFILE_ANALYSIS_SYSTEM_INSTRUCTION = `You are an expert resume analyzer (Prompt ${PROFILE_ANALYSIS_PROMPT_VERSION}).

Your role is to analyze a candidate resume and extract profile-oriented insights for a career dashboard.

RULES:
1. Extract only information explicitly stated or strongly implied in the resume.
2. Do not invent degrees, grades, skills, roles, or years of experience.
3. If no degree is found, set hasDegree to false.
4. If no grade average / GPA is explicitly found, set gradeAverage to null.
5. totalYearsOfExperience should be estimated from the experience timeline as accurately as possible.
6. topSkills must contain the strongest and best-supported skills in the resume.
7. recommendedCourses must be realistic learning topics based on missing depth, likely next-step growth areas, or gaps implied by the resume.
8. Return only valid JSON.

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
    "topSkills": ["<top skill>", "<top skill>", "<top skill>"],
    "recommendedCourses": ["<course/topic>", "<course/topic>", "<course/topic>"]
  }
}

Guidelines:
- topSkills should contain 3 to 5 items maximum.
- recommendedCourses should contain 3 to 5 items maximum.
- gradeAverage should preserve the numeric value as it appears in the resume.
- If the resume does not contain enough evidence for a field, return null or an empty array as appropriate.`;
}