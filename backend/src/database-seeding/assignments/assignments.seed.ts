import { AssignmentFeedback } from '../../features/assignment/models/assignmentFeedback.model.js';

import type { SeedUsersMap } from '../seed.types.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function completedDates(
  now: number,
  daysAgo: number,
  processingSeconds: number
) {
  const createdAt = new Date(now - daysAgo * DAY_IN_MS);
  const completedAt = new Date(
    createdAt.getTime() + processingSeconds * 1000
  );

  return {
    createdAt,
    updatedAt: completedAt,
    aiAnalysisCompletedAt: completedAt,
  };
}

export async function seedAssignments(
  users: SeedUsersMap
): Promise<void> {
  const now = Date.now();

  const assignments = [
    {
      userId: users.vered._id,

      requirementsFileKey:
        `assignments/${users.vered._id}/task-api/requirement-task-api.pdf`,

      solutionFileKey:
        `assignments/${users.vered._id}/task-api/solution-task-api.zip`,

      userNotes:
        'REST API assignment using TypeScript, Express and MongoDB.',

      status: 'completed' as const,

      metadata: {
        detectedLanguage: 'TypeScript',
        detectedFrameworks: ['Express', 'Mongoose', 'Jest'],
        projectScope: 'medium' as const,
        totalFiles: 8,
        totalLines: 184,
        fileCount: 8,

        extractedRequirements:
          'Create a task-management REST API with CRUD operations, MongoDB, JWT authentication and tests.',

        sourceCodeContent: {
          'src/server.ts':
            'Express application with task routes, MongoDB connection and health endpoint.',

          'src/routes/task.routes.ts':
            'CRUD routes protected by JWT authentication.',

          'src/tests/task.routes.test.ts':
            'Jest tests for task creation and retrieval.',
        },

        sourceCodeSummary:
          'TypeScript REST API with Express, MongoDB, JWT authentication and Jest tests.',

        scanMetadata: {
          frameworks: ['Express', 'Mongoose', 'Jest'],
          buildSystem: 'npm',
          hasTests: true,
          hasDocumentation: false,
          qualityScore: 88,

          complexity: {
            linesOfCode: 184,
            cyclomaticComplexity: 12,
            testCoverage: 76,
          },

          projectType: 'web-backend' as const,

          recommendations: [
            'Add centralized error handling.',
            'Add API documentation.',
          ],
        },
      },

      aiFeedback: {
        codeQuality: {
          score: 88,

          strengths: [
            'The project has a clear structure.',
            'TypeScript is used consistently.',
          ],

          weaknesses: [
            'Some route logic should be moved into services.',
          ],
        },

        functionalCorrectness: {
          score: 94,
          meetsRequirements: true,
          missingFeatures: [],
        },

        bestPractices: {
          score: 82,
          followsConventions: true,

          suggestions: [
            'Add centralized error handling.',
            'Increase integration-test coverage.',
          ],
        },

        overall: {
          score: 89,
          grade: 'B',

          summary:
            'The submission meets the assignment requirements and has a clear structure. Minor improvements are needed in error handling and service separation.',
        },
      },

      processingErrors: [],

      ...completedDates(now, 12, 42),
    },

    {
      userId: users.vered._id,

      requirementsFileKey:
        `assignments/${users.vered._id}/android-app/requirement-android-app.pdf`,

      solutionFileKey:
        `assignments/${users.vered._id}/android-app/solution-android-app.zip`,

      userNotes:
        'Android application using Kotlin, Room, Firebase and MVVM.',

      status: 'completed' as const,

      metadata: {
        detectedLanguage: 'Kotlin',
        detectedFrameworks: ['Android', 'Room', 'Firebase', 'MVVM'],
        projectScope: 'large' as const,
        totalFiles: 41,
        totalLines: 3680,
        fileCount: 41,

        extractedRequirements:
          'Build an Android application with authentication, Room persistence, Firebase synchronization and MVVM architecture.',

        sourceCodeContent: {
          'MainActivity.kt':
            'Android activity that initializes the application interface.',

          'AppDatabase.kt':
            'Room database containing the application entities.',

          'ProfileViewModel.kt':
            'ViewModel responsible for profile data and UI state.',
        },

        sourceCodeSummary:
          'Android application using Kotlin, Room, Firebase and MVVM.',

        scanMetadata: {
          frameworks: ['Android', 'Room', 'Firebase', 'MVVM'],
          buildSystem: 'Gradle',
          hasTests: true,
          hasDocumentation: true,
          qualityScore: 86,

          complexity: {
            linesOfCode: 3680,
            cyclomaticComplexity: 31,
            testCoverage: 68,
          },

          projectType: 'mobile' as const,

          recommendations: [
            'Increase ViewModel test coverage.',
            'Improve UI-state handling.',
          ],
        },
      },

      aiFeedback: {
        codeQuality: {
          score: 87,

          strengths: [
            'The application follows MVVM architecture.',
            'Room and Firebase responsibilities are separated.',
          ],

          weaknesses: [
            'Some UI-state logic could be centralized.',
          ],
        },

        functionalCorrectness: {
          score: 92,
          meetsRequirements: true,
          missingFeatures: [],
        },

        bestPractices: {
          score: 84,
          followsConventions: true,

          suggestions: [
            'Add more ViewModel tests.',
            'Use sealed classes for UI states.',
          ],
        },

        overall: {
          score: 88,
          grade: 'B',

          summary:
            'The Android application meets the assignment requirements and demonstrates a solid MVVM structure. Additional automated tests would improve maintainability.',
        },
      },

      processingErrors: [],

      ...completedDates(now, 9, 74),
    },

    {
      userId: users.yuval._id,

      requirementsFileKey:
        `assignments/${users.yuval._id}/react-dashboard/requirement-dashboard.pdf`,

      solutionFileKey:
        `assignments/${users.yuval._id}/react-dashboard/solution-dashboard.zip`,

      userNotes:
        'Responsive React dashboard with filtering and API integration.',

      status: 'completed' as const,

      metadata: {
        detectedLanguage: 'JavaScript',
        detectedFrameworks: ['React', 'Vite'],
        projectScope: 'medium' as const,
        totalFiles: 22,
        totalLines: 1450,
        fileCount: 22,

        extractedRequirements:
          'Create a responsive dashboard with API loading, error handling, cards, a table and filtering.',

        sourceCodeContent: {
          'src/App.jsx':
            'Main React application rendering the dashboard.',

          'src/pages/Dashboard.jsx':
            'Dashboard page with API loading, filtering and error handling.',
        },

        sourceCodeSummary:
          'Responsive React dashboard with filtering and API integration.',

        scanMetadata: {
          frameworks: ['React', 'Vite'],
          buildSystem: 'npm',
          hasTests: true,
          hasDocumentation: true,
          qualityScore: 82,

          complexity: {
            linesOfCode: 1450,
            cyclomaticComplexity: 20,
            testCoverage: 64,
          },

          projectType: 'web-frontend' as const,

          recommendations: [
            'Move API calls into a service.',
            'Add end-to-end tests.',
          ],
        },
      },

      aiFeedback: {
        codeQuality: {
          score: 84,

          strengths: [
            'The components are readable and focused.',
            'Loading and error states are handled clearly.',
          ],

          weaknesses: [
            'API access remains inside the page component.',
          ],
        },

        functionalCorrectness: {
          score: 91,
          meetsRequirements: true,
          missingFeatures: [],
        },

        bestPractices: {
          score: 79,
          followsConventions: true,

          suggestions: [
            'Extract API communication into a service.',
            'Add end-to-end tests.',
          ],
        },

        overall: {
          score: 85,
          grade: 'B',

          summary:
            'The dashboard meets the assignment requirements and handles loading, errors and filtering correctly. A dedicated API layer would improve separation of concerns.',
        },
      },

      processingErrors: [],

      ...completedDates(now, 7, 58),
    },

    {
      userId: users.yuval._id,

      requirementsFileKey:
        `assignments/${users.yuval._id}/java-library/requirement-library.pdf`,

      solutionFileKey:
        `assignments/${users.yuval._id}/java-library/solution-library.zip`,

      userNotes:
        'Java library-management assignment using object-oriented design.',

      status: 'completed' as const,

      metadata: {
        detectedLanguage: 'Java',
        detectedFrameworks: ['JUnit'],
        projectScope: 'medium' as const,
        totalFiles: 14,
        totalLines: 980,
        fileCount: 14,

        extractedRequirements:
          'Create a library-management application for books, members, borrowing, returns and unit tests.',

        sourceCodeContent: {
          'LibraryService.java':
            'Service responsible for borrowing and returning books.',

          'LibraryServiceTest.java':
            'JUnit tests for library borrowing rules.',
        },

        sourceCodeSummary:
          'Java object-oriented library-management application with JUnit tests.',

        scanMetadata: {
          frameworks: ['JUnit'],
          buildSystem: 'Maven',
          hasTests: true,
          hasDocumentation: true,
          qualityScore: 81,

          complexity: {
            linesOfCode: 980,
            cyclomaticComplexity: 16,
            testCoverage: 71,
          },

          projectType: 'desktop' as const,

          recommendations: [
            'Add repository interfaces.',
            'Add more edge-case tests.',
          ],
        },
      },

      aiFeedback: {
        codeQuality: {
          score: 82,

          strengths: [
            'The domain classes have clear responsibilities.',
            'Borrowing rules are implemented in a dedicated service.',
          ],

          weaknesses: [
            'Persistence is not abstracted behind interfaces.',
          ],
        },

        functionalCorrectness: {
          score: 90,
          meetsRequirements: true,
          missingFeatures: [],
        },

        bestPractices: {
          score: 76,
          followsConventions: true,

          suggestions: [
            'Introduce repository interfaces.',
            'Add more edge-case tests.',
          ],
        },

        overall: {
          score: 84,
          grade: 'B',

          summary:
            'The assignment meets the required library-management behavior and uses a clear object-oriented design. Persistence abstraction would improve maintainability.',
        },
      },

      processingErrors: [],

      ...completedDates(now, 4, 63),
    },
  ];

  await AssignmentFeedback.insertMany(assignments);

  console.log(
    `[seed] Assignment feedback records created: ${assignments.length}`
  );
}