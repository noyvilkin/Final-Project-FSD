export type ProfileAnalysisExpectedOutput = {
  candidateName: string | null;
  candidateEmail: string | null;
  profileSummary: {
    hasDegree: boolean;
    highestDegree: string | null;
    fieldOfStudy: string | null;
    institution: string | null;
    gradeAverage: number | null;
    totalYearsOfExperience: number | null;
    lastRoleTitle: string | null;
    lastRoleCompany: string | null;
    topSkills: string[];
    recommendedCourses: string[];
  };
};

export type ProfileAnalysisEvalSample = {
  id: string;
  description: string;
  resumeText: string;
  expected: ProfileAnalysisExpectedOutput;
};

export type FieldScore = {
  field: string;
  score: number;
  reason: string;
};

export type EvalResult = {
  sampleId: string;
  description: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: "A" | "B" | "C" | "D" | "F";
  fieldScores: FieldScore[];
};