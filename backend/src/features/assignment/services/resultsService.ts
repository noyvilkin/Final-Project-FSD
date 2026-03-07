import { AssignmentFeedback } from "../models/assignmentFeedback.model.js";
import { appLogger } from "../../../common/services/logger.js";
import { publishEvent } from "../../../common/services/mq.service.js";

export interface AssignmentResultsSummary {
  assignmentId: string;
  userId: string;
  status: 'completed' | 'failed' | 'partial';
  overallGrade: string;
  overallScore: number;
  feedback: {
    summary: string;
    codeQuality: {
      score: number;
      highlights: string[];
      improvements: string[];
    };
    functionality: {
      score: number;
      meetsRequirements: boolean;
      missingFeatures: string[];
    };
    bestPractices: {
      score: number;
      recommendations: string[];
    };
  };
  metadata: {
    language: string;
    frameworks: string[];
    analysisDate: Date;
    processingTime?: number; // in seconds
  };
}

export class ResultsService {
  /**
   * Generates a comprehensive results summary for a completed assignment
   */
  static async generateResultsSummary(assignmentId: string): Promise<AssignmentResultsSummary | null> {
    try {
      appLogger.info("[ResultsService] Generating results summary", { assignmentId });

      const assignment = await AssignmentFeedback.findById(assignmentId);
      
      if (!assignment) {
        appLogger.error("[ResultsService] Assignment not found", { assignmentId });
        return null;
      }

      if (!assignment.aiFeedback) {
        appLogger.warn("[ResultsService] AI feedback missing for assignment", { assignmentId });
        return null;
      }

      // Calculate processing time if possible
      let processingTime: number | undefined;
      if (assignment.createdAt && assignment.aiAnalysisCompletedAt) {
        processingTime = Math.floor(
          (assignment.aiAnalysisCompletedAt.getTime() - assignment.createdAt.getTime()) / 1000
        );
      }

      const summary: AssignmentResultsSummary = {
        assignmentId,
        userId: assignment.userId.toString(),
        status: assignment.status === 'completed' ? 'completed' : 'partial',
        overallGrade: assignment.aiFeedback.overall.grade,
        overallScore: assignment.aiFeedback.overall.score,
        feedback: {
          summary: assignment.aiFeedback.overall.summary,
          codeQuality: {
            score: assignment.aiFeedback.codeQuality.score,
            highlights: assignment.aiFeedback.codeQuality.strengths,
            improvements: assignment.aiFeedback.codeQuality.weaknesses
          },
          functionality: {
            score: assignment.aiFeedback.functionalCorrectness.score,
            meetsRequirements: assignment.aiFeedback.functionalCorrectness.meetsRequirements,
            missingFeatures: assignment.aiFeedback.functionalCorrectness.missingFeatures
          },
          bestPractices: {
            score: assignment.aiFeedback.bestPractices.score,
            recommendations: assignment.aiFeedback.bestPractices.suggestions
          }
        },
        metadata: {
          language: assignment.metadata?.detectedLanguage || 'Unknown',
          frameworks: assignment.metadata?.detectedFrameworks || [],
          analysisDate: assignment.aiAnalysisCompletedAt || assignment.updatedAt,
          processingTime
        }
      };

      appLogger.info("[ResultsService] Results summary generated successfully", {
        assignmentId,
        grade: summary.overallGrade,
        score: summary.overallScore
      });

      return summary;

    } catch (error) {
      appLogger.error("[ResultsService] Failed to generate results summary", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Triggers final results compilation after AI analysis completion
   */
  static async triggerResultsGeneration(assignmentId: string, userId: string): Promise<void> {
    try {
      appLogger.info("[ResultsService] Triggering results generation", { assignmentId });

      await publishEvent("results-generated", { 
        assignmentId, 
        userId 
      });

      appLogger.info("[ResultsService] Results generation queued successfully", { assignmentId });

    } catch (error) {
      appLogger.error("[ResultsService] Failed to trigger results generation", {
        assignmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Gets a user-friendly status message based on assignment state
   */
  static getStatusMessage(assignment: any): string {
    switch (assignment.status) {
      case 'pending':
        return 'Assignment received and queued for processing';
      case 'scanning':
        return 'Analyzing uploaded files and extracting source code';
      case 'processing':
        return 'Running AI analysis on your code';
      case 'completed':
        return 'Analysis complete! Your feedback is ready';
      case 'failed':
        return 'Analysis failed. Please try uploading your files again';
      default:
        return 'Unknown status';
    }
  }

  /**
   * Gets the overall performance level based on score
   */
  static getPerformanceLevel(score: number): string {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Satisfactory';
    if (score >= 60) return 'Needs Improvement';
    return 'Poor';
  }

  /**
   * Creates a detailed feedback report for display
   */
  static formatDetailedReport(summary: AssignmentResultsSummary): {
    header: string;
    sections: Array<{
      title: string;
      content: string[];
      score?: number;
    }>;
  } {
    const performanceLevel = this.getPerformanceLevel(summary.overallScore);
    
    return {
      header: `Assignment Analysis Complete - Grade: ${summary.overallGrade} (${summary.overallScore}/100) - ${performanceLevel}`,
      sections: [
        {
          title: 'Overall Summary',
          content: [summary.feedback.summary],
          score: summary.overallScore
        },
        {
          title: 'Code Quality Analysis',
          content: [
            ...summary.feedback.codeQuality.highlights.map(h => `✓ ${h}`),
            ...summary.feedback.codeQuality.improvements.map(i => `⚠ ${i}`)
          ],
          score: summary.feedback.codeQuality.score
        },
        {
          title: 'Functional Correctness',
          content: [
            summary.feedback.functionality.meetsRequirements 
              ? '✓ Requirements are met' 
              : '⚠ Some requirements not fully satisfied',
            ...summary.feedback.functionality.missingFeatures.map(f => `• Missing: ${f}`)
          ],
          score: summary.feedback.functionality.score
        },
        {
          title: 'Best Practices & Recommendations',
          content: summary.feedback.bestPractices.recommendations.map(r => `• ${r}`),
          score: summary.feedback.bestPractices.score
        },
        {
          title: 'Technical Details',
          content: [
            `Language: ${summary.metadata.language}`,
            `Frameworks: ${summary.metadata.frameworks.join(', ') || 'None detected'}`,
            `Analyzed: ${summary.metadata.analysisDate.toLocaleString()}`,
            ...(summary.metadata.processingTime ? [`Processing time: ${summary.metadata.processingTime}s`] : [])
          ]
        }
      ]
    };
  }
}
