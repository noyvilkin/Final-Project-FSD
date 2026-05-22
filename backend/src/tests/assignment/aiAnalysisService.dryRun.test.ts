import { AIAnalysisService } from '../../features/assignment/services/aiAnalysisService.js';
import { AssignmentFeedback } from '../../features/assignment/models/assignmentFeedback.model.js';

describe('AIAnalysisService dry-run mode', () => {
  const originalDryRun = process.env.ASSIGNMENT_AI_DRY_RUN;

  afterEach(() => {
    if (originalDryRun === undefined) {
      delete process.env.ASSIGNMENT_AI_DRY_RUN;
    } else {
      process.env.ASSIGNMENT_AI_DRY_RUN = originalDryRun;
    }
    jest.restoreAllMocks();
  });

  test('returns deterministic feedback without calling Gemini', async () => {
    process.env.ASSIGNMENT_AI_DRY_RUN = 'true';

    jest.spyOn(AssignmentFeedback, 'findById').mockResolvedValue({
      _id: 'assignment-1',
      metadata: {
        detectedLanguage: 'javascript',
        detectedFrameworks: ['express'],
        totalFiles: 3,
        totalLines: 120,
        sourceCodeContent: {
          'src/index.js': "const express = require('express');\nconst app = express();\napp.listen(3000);"
        },
        requirements: 'Hard Requirements:\n- Use Node.js and Express to implement a REST API\n- Implement authentication via JWT\n- Provide a health endpoint at GET /health returning 200'
      }
    } as any);

    const result = await AIAnalysisService.analyzeAssignmentWithAI('assignment-1');

    expect(result.success).toBe(true);
    expect(result.feedback).toBeDefined();
    expect(result.feedback?.functionalCorrectness.missingFeatures.length).toBeGreaterThan(0);
    expect(result.feedback?.overall.summary).toContain('Dry-run AI analysis');
  });
});
