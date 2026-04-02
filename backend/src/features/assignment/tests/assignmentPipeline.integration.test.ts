import { Types } from 'mongoose';

jest.mock('../../../common/services/s3Upload.js', () => ({
  fetchBlobAsBuffer: jest.fn(),
}));

jest.mock('../services/assignmentAnalysisService.js', () => ({
  AssignmentAnalysisService: {
    analyzeAssignment: jest.fn(),
  },
}));

jest.mock('../services/aiAnalysisService.js', () => ({
  AIAnalysisService: {
    analyzeAssignmentWithAI: jest.fn(),
    saveAnalysisResults: jest.fn(),
  },
}));

let AssignmentService: typeof import('../services/assignmentService.js').AssignmentService;
let AssignmentFeedback: typeof import('../models/assignmentFeedback.model.js').AssignmentFeedback;
let s3Upload: any;
let ZipProcessor: any;
let AssignmentAnalysisService: any;
let AIAnalysisService: any;

const validUserId = new Types.ObjectId().toString();
const assignmentId = new Types.ObjectId().toString();

const baseSolutionFile = {
  bucket: 'test-bucket',
  key: 'solution.zip',
  url: 'https://example.test/solution.zip',
  mimeType: 'application/zip',
  size: 123,
};

describe('AssignmentService pipeline integration', () => {
  beforeAll(async () => {
    process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'test-bucket';

    ({ AssignmentService } = await import('../services/assignmentService.js'));
    ({ AssignmentFeedback } = await import('../models/assignmentFeedback.model.js'));
    s3Upload = await import('../../../common/services/s3Upload.js');
    ({ ZipProcessor } = await import('../../../common/utils/zipProcessor.js'));
    ({ AssignmentAnalysisService } = await import('../services/assignmentAnalysisService.js'));
    ({ AIAnalysisService } = await import('../services/aiAnalysisService.js'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('transitions initial pipeline pending -> scanning -> processing -> completed', async () => {
    const saveSpy = jest
      .spyOn(AssignmentFeedback.prototype as any, 'save')
      .mockResolvedValue({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
      });

    const updateSpy = jest
      .spyOn(AssignmentFeedback, 'findByIdAndUpdate')
      .mockResolvedValue(null as any);

    jest.spyOn(s3Upload, 'fetchBlobAsBuffer').mockResolvedValue(Buffer.from('fake-zip'));

    jest.spyOn(ZipProcessor, 'scanZipFile').mockResolvedValue({
      isValid: true,
      errors: [],
      detectedLanguage: 'TypeScript',
      sourceFiles: [{ path: 'src/index.ts', content: 'console.log("ok")' }],
      metadata: { frameworks: ['Express'] },
      projectScope: 'small',
    } as any);

    jest.spyOn(AssignmentAnalysisService, 'analyzeAssignment').mockResolvedValue({
      success: true,
      metadata: {
        detectedLanguage: 'TypeScript',
        detectedFrameworks: ['Express'],
      },
      errors: [],
    } as any);

    jest.spyOn(AIAnalysisService, 'analyzeAssignmentWithAI').mockResolvedValue({
      success: true,
      feedback: {
        codeQuality: { score: 80, strengths: ['Clean code'], weaknesses: [] },
        functionalCorrectness: { score: 85, meetsRequirements: true, missingFeatures: [] },
        bestPractices: { score: 78, followsConventions: true, suggestions: [] },
        overall: { score: 82, grade: 'B', summary: 'Good submission' },
      },
    });

    const saveAnalysisSpy = jest
      .spyOn(AIAnalysisService, 'saveAnalysisResults')
      .mockResolvedValue(undefined);

    const result = await AssignmentService.createAssignment(validUserId, {
      solution: baseSolutionFile,
    });

    expect(saveSpy).toHaveBeenCalled();
    expect(result.analysisTriggered).toBe(true);
    expect(result.status).toBe('processing');

    expect(updateSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'scanning' }),
      })
    );

    expect(updateSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'processing' }),
      })
    );

    expect(saveAnalysisSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({ success: true })
    );
  });

  it('marks assignment as failed when AI analysis fails after processing', async () => {
    jest
      .spyOn(AssignmentFeedback.prototype as any, 'save')
      .mockResolvedValue({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
      });

    const updateSpy = jest
      .spyOn(AssignmentFeedback, 'findByIdAndUpdate')
      .mockResolvedValue(null as any);

    jest.spyOn(s3Upload, 'fetchBlobAsBuffer').mockResolvedValue(Buffer.from('fake-zip'));

    jest.spyOn(ZipProcessor, 'scanZipFile').mockResolvedValue({
      isValid: true,
      errors: [],
      detectedLanguage: 'TypeScript',
      sourceFiles: [{ path: 'src/index.ts', content: 'console.log("ok")' }],
      metadata: { frameworks: ['Express'] },
      projectScope: 'small',
    } as any);

    jest.spyOn(AssignmentAnalysisService, 'analyzeAssignment').mockResolvedValue({
      success: true,
      metadata: {
        detectedLanguage: 'TypeScript',
        detectedFrameworks: ['Express'],
      },
      errors: [],
    } as any);

    jest.spyOn(AIAnalysisService, 'analyzeAssignmentWithAI').mockResolvedValue({
      success: false,
      error: 'Request timed out while contacting Gemini',
    });

    jest.spyOn(AIAnalysisService, 'saveAnalysisResults').mockResolvedValue(undefined);

    const result = await AssignmentService.createAssignment(validUserId, {
      solution: baseSolutionFile,
    });

    expect(result.analysisTriggered).toBe(false);
    expect(result.status).toBe('uploaded');

    expect(updateSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          'recovery.failureCategory': 'transient',
        }),
      })
    );
  });

  it('runs retry flow with claimed retry run and updated retry metadata', async () => {
    const findByIdSpy = jest
      .spyOn(AssignmentFeedback, 'findById')
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
        status: 'failed',
        requirementsFileKey: 'requirements.pdf',
        solutionFileKey: 'solution.zip',
        recovery: { retryCount: 0, maxRetryCount: 2, failureCategory: 'transient' },
      } as any)
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
        status: 'completed',
      } as any);

    const claimSpy = jest
      .spyOn(AssignmentFeedback, 'findOneAndUpdate')
      .mockResolvedValue({ _id: new Types.ObjectId(assignmentId) } as any);

    const updateSpy = jest
      .spyOn(AssignmentFeedback, 'findByIdAndUpdate')
      .mockResolvedValue(null as any);

    jest.spyOn(s3Upload, 'fetchBlobAsBuffer').mockResolvedValue(Buffer.from('fake-zip'));

    jest.spyOn(ZipProcessor, 'scanZipFile').mockResolvedValue({
      isValid: true,
      errors: [],
      detectedLanguage: 'TypeScript',
      sourceFiles: [{ path: 'src/index.ts', content: 'console.log("ok")' }],
      metadata: { frameworks: [] },
      projectScope: 'small',
    } as any);

    jest.spyOn(AssignmentAnalysisService, 'analyzeAssignment').mockResolvedValue({
      success: true,
      metadata: { detectedLanguage: 'TypeScript', detectedFrameworks: [] },
      errors: [],
    } as any);

    jest.spyOn(AIAnalysisService, 'analyzeAssignmentWithAI').mockResolvedValue({ success: true } as any);
    jest.spyOn(AIAnalysisService, 'saveAnalysisResults').mockResolvedValue(undefined);

    await AssignmentService.retryFailedAssignment(assignmentId, validUserId);

    expect(findByIdSpy).toHaveBeenCalledTimes(2);

    expect(claimSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: assignmentId, status: 'failed' }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'processing',
          'recovery.activeRunType': 'retry',
        }),
        $inc: { 'recovery.retryCount': 1 },
      }),
      { new: true }
    );

    expect(updateSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'scanning',
          'recovery.activeRunType': 'retry',
        }),
      })
    );
  });

  it('runs re-analysis flow for completed assignments without retry increment', async () => {
    jest
      .spyOn(AssignmentFeedback, 'findById')
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
        status: 'completed',
        requirementsFileKey: 'requirements.pdf',
        solutionFileKey: 'solution.zip',
        recovery: { retryCount: 1, maxRetryCount: 2, failureCategory: 'unknown' },
      } as any)
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(assignmentId),
        userId: new Types.ObjectId(validUserId),
        status: 'completed',
      } as any);

    const claimSpy = jest
      .spyOn(AssignmentFeedback, 'findOneAndUpdate')
      .mockResolvedValue({ _id: new Types.ObjectId(assignmentId) } as any);

    const updateSpy = jest
      .spyOn(AssignmentFeedback, 'findByIdAndUpdate')
      .mockResolvedValue(null as any);

    jest.spyOn(s3Upload, 'fetchBlobAsBuffer').mockResolvedValue(Buffer.from('fake-zip'));

    jest.spyOn(ZipProcessor, 'scanZipFile').mockResolvedValue({
      isValid: true,
      errors: [],
      detectedLanguage: 'TypeScript',
      sourceFiles: [{ path: 'src/index.ts', content: 'console.log("ok")' }],
      metadata: { frameworks: [] },
      projectScope: 'small',
    } as any);

    jest.spyOn(AssignmentAnalysisService, 'analyzeAssignment').mockResolvedValue({
      success: true,
      metadata: { detectedLanguage: 'TypeScript', detectedFrameworks: [] },
      errors: [],
    } as any);

    jest.spyOn(AIAnalysisService, 'analyzeAssignmentWithAI').mockResolvedValue({ success: true } as any);
    jest.spyOn(AIAnalysisService, 'saveAnalysisResults').mockResolvedValue(undefined);

    await AssignmentService.reanalyzeAssignment(assignmentId, validUserId);

    expect(claimSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: assignmentId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'processing',
          'recovery.activeRunType': 'reanalysis',
        }),
      }),
      { new: true }
    );

    const claimUpdate = claimSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(claimUpdate).not.toHaveProperty('$inc');

    expect(updateSpy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'scanning',
          'recovery.activeRunType': 'reanalysis',
        }),
      })
    );
  });
});