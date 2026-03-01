// types/models.ts
export interface ISkill {
  name: string;
  category: 'technical' | 'soft' | 'tool' | 'language';
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number;
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