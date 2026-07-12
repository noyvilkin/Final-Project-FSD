// types/models.ts
export interface ISkill {
  name: string;
  category: 'technical' | 'soft' | 'tool' | 'language';
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number;
  // True when the skill was explicitly listed in a dedicated skills/
  // technologies section of the original resume (as opposed to only being
  // mentioned inside an experience bullet or summary). Used to keep the
  // composed CV's SKILLS section faithful to the original. Optional for
  // records parsed before this field existed.
  inSkillsSection?: boolean;
}

export interface IExperience {
  company: string;
  role: string;
  startDate: Date;
  endDate?: Date;
  isCurrent: boolean;
  description?: string;
  extractedSkills: string[];
}

export interface IEducation {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: Date;
  endDate?: Date;
  gpa?: number;
}

export interface IRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  suggestion: string;
  resourceLinks: string[];
}

export interface IGapAnalysis {
  overallScore: number;
  strengths: string[];
  gaps: string[];
  recommendations: IRecommendation[];
}

// Consumed by the My Profile page; the optimizer ignores it.
export interface IProfileSummary {
  hasDegree: boolean;
  highestDegree?: string;
  fieldOfStudy?: string;
  institution?: string;
  gradeAverage?: number;
  totalYearsOfExperience?: number;
  lastRoleTitle?: string;
  lastRoleCompany?: string;
  topSkills: string[];
  recommendedCourses: string[];
}

// Assignment-related interfaces
export interface AssignmentMetadata {
  solutionFileKey: string;
  detectedLanguage?: string;
  detectedFrameworks?: string[];
  projectScope?: 'small' | 'medium' | 'large';
  totalFiles?: number;
  totalLines?: number;
  requirements?: string;
  sourceCodeContent?: { [filePath: string]: string };
  extractedRequirements?: string;
  sourceCodeSummary?: string;
  scanMetadata?: {
    frameworks?: string[];
    buildSystem?: string;
    hasTests?: boolean;
    hasDocumentation?: boolean;
    qualityScore?: number;
    complexity?: {
      linesOfCode: number;
      cyclomaticComplexity: number;
      testCoverage: number;
    };
    projectType?: 'web-frontend' | 'web-backend' | 'mobile' | 'desktop' | 'library' | 'data-science' | 'game' | 'other';
    recommendations?: string[];
  };
}
