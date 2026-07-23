import { OptimizationRun } from '../../features/resume/models/optimizationRun.model.js';
import { ProfessionalDNA } from '../../features/resume/models/professionalDNA.model.js';
import { CvDocumentService } from '../../features/resume/services/cvDocumentService.js';

import type { OptimizationDashboardData } from '../../features/resume/types/aiOptimization.types.js';
import type { SeedUserDocument, SeedUsersMap } from '../seed.types.js';

type RunConfig = {
  versionTag: string;
  jobTitle: string;
  score: number;
  company: string;
  role: string;
  originalBullet: string;
  optimizedBullet: string;
  matchedSkills: string[];
  missingSkills: string[];
};

function createDashboardData(
  run: RunConfig
): OptimizationDashboardData {
  return {
    bullets: [
      {
        id: `${run.versionTag}-bullet`,
        index: 0,
        company: run.company,
        role: run.role,
        originalBullet: run.originalBullet,
        optimizedBullet: run.optimizedBullet,
        explanation:
          'The rewritten bullet adds relevant job keywords and clearer impact.',
        confidenceScore: 0.9,
        confidenceLevel: 'high',
        keywordsUsed: run.matchedSkills,
        status: 'pending',
      },
    ],

    generalAdvice: `Highlight experience relevant to the ${run.jobTitle} position.`,

    hybridScore: {
      hardRuleScore: run.score,
      hardRuleWeight: 0.6,
      semanticScore: run.score,
      semanticWeight: 0.4,
      finalScore: run.score,

      hardRuleDetails: {
        totalRequired:
          run.matchedSkills.length + run.missingSkills.length,
        totalMatched: run.matchedSkills.length,
        matchedSkills: run.matchedSkills,
        missingSkills: run.missingSkills,
      },

      semanticDetails: {
        score: run.score,
        reasoning:
          'The resume contains relevant experience and several matching skills.',
        strongMatches: run.matchedSkills,
        weakMatches: run.missingSkills,
      },
    },

    gapsRemaining: run.missingSkills,

    meta: {
      generatedAt: new Date().toISOString(),
      promptVersion: 'seed-v1',
      modelUsed: 'seed-data',
    },
  };
}

async function createRuns(
  user: SeedUserDocument,
  runs: RunConfig[]
): Promise<void> {
  const dna = await ProfessionalDNA.findOne({
    userId: user._id,
    analysisStatus: 'completed',
  }).sort({ updatedAt: -1 });

  if (!dna?.rawResumeText) {
    throw new Error(`Professional DNA not found for ${user.email}`);
  }

  const snapshot = await CvDocumentService.snapshotForUser(
    user._id.toString()
  );

  if (!snapshot) {
    throw new Error(`CV snapshot not found for ${user.email}`);
  }

  for (const run of runs) {
    await OptimizationRun.create({
      userId: user._id,
      versionTag: run.versionTag,
      jobDescriptionText: run.jobTitle,
      originalResumeText: dna.rawResumeText,
      dnaSnapshot: snapshot,
      dashboardData:
        createDashboardData(run) as unknown as Record<string, unknown>,
    });
  }

  console.log(
    `[seed] Optimization history created for ${user.email}`
  );
}

export async function seedOptimizationRuns(
  users: SeedUsersMap
): Promise<void> {
  await createRuns(users.vered, [
    {
      versionTag: 'vered-project-manager-v1',
      jobTitle: 'Technical Project Manager',
      score: 90,
      company: 'IAI – Israel Aerospace Industries',
      role: 'Instructional Project Manager',
      originalBullet:
        'Managing instructional projects in the aerospace engineering domain, including schedule planning, budgeting, requirements analysis, knowledge-gap identification, and coordination between development, training, and management teams.',
      optimizedBullet:
        'Manage multidisciplinary aerospace projects through schedule planning, budgeting, requirements analysis and cross-functional stakeholder coordination.',
      matchedSkills: [
        'Project Management',
        'Requirements Analysis',
        'Leadership',
      ],
      missingSkills: ['Jira', 'Agile'],
    },
    {
      versionTag: 'vered-software-developer-v1',
      jobTitle: 'Junior Software Developer',
      score: 73,
      company: 'IAI – Israel Aerospace Industries',
      role: 'Instructional Project Manager',
      originalBullet:
        'Managing instructional projects in the aerospace engineering domain, including schedule planning, budgeting, requirements analysis, knowledge-gap identification, and coordination between development, training, and management teams.',
      optimizedBullet:
        'Apply requirements analysis, data analysis and technical problem-solving while coordinating software-oriented learning systems.',
      matchedSkills: ['C', 'C++', 'Data Structures'],
      missingSkills: ['Git', 'SQL'],
    },
  ]);

  await createRuns(users.yuval, [
    {
      versionTag: 'yuval-full-stack-v1',
      jobTitle: 'Full-Stack Developer',
      score: 94,
      company: 'Israel Aerospace Industries',
      role: 'Full-Stack Information Systems Developer',
      originalBullet:
        'End-to-end development of enterprise information systems, including requirements analysis, system design, database development, backend and frontend implementation, testing, deployment and ongoing maintenance.',
      optimizedBullet:
        'Develop and maintain enterprise full-stack systems using Angular, TypeScript, C#, .NET and Oracle SQL from requirements through production.',
      matchedSkills: [
        'Angular',
        'TypeScript',
        'C#',
        '.NET Framework',
        'Oracle SQL',
      ],
      missingSkills: ['Docker', 'Cloud'],
    },
    {
      versionTag: 'yuval-backend-v1',
      jobTitle: 'Backend .NET Developer',
      score: 84,
      company: 'Israel Aerospace Industries',
      role: 'Full-Stack Information Systems Developer',
      originalBullet:
        'End-to-end development of enterprise information systems, including requirements analysis, system design, database development, backend and frontend implementation, testing, deployment and ongoing maintenance.',
      optimizedBullet:
        'Design and maintain C# and .NET backend services with Oracle SQL, production support and requirements-driven system development.',
      matchedSkills: ['C#', '.NET Framework', 'Oracle SQL'],
      missingSkills: ['ASP.NET Core', 'CI/CD'],
    },
  ]);
}