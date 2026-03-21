import { randomUUID } from 'crypto';
import { appLogger } from '../../../common/services/logger.js';
import { uploadBlob, deleteBlob, fetchBlobAsText } from '../../../common/services/s3Upload.js';
import type { ProfessionalDNASummary } from '../types/resumeOptimization.types.js';
import type { OptimizationDashboardData, OptimizedBulletUI } from '../types/aiOptimization.types.js';
import { User } from '../../user/models/user.model.js';

const BUCKET = 'optimized-cvs';

export class CvReconstructionService {

  /**
   * Build a complete Markdown CV from the user's Professional DNA
   * with AI-optimized bullets replacing the originals, upload it to
   * MinIO, and return the storage key + download URL.
   */
  static async reconstructAndStore(
    userId: string,
    dashboardData: OptimizationDashboardData,
    dna: ProfessionalDNASummary
  ): Promise<{ artifactKey: string; downloadUrl: string; versionTag: string }> {
    const markdown = await this.buildMarkdown(userId, dashboardData, dna);
    const versionTag = Date.now().toString(36);
    const artifactKey = `${userId}_${versionTag}_${randomUUID().slice(0, 8)}.md`;

    const { url } = await uploadBlob(artifactKey, markdown, 'text/markdown', BUCKET);

    appLogger.info('[CvReconstruction] CV stored', { userId, artifactKey, bytes: markdown.length });

    return { artifactKey, downloadUrl: url, versionTag };
  }

  /**
   * Retrieve the reconstructed CV text from MinIO.
   */
  static async fetchArtifact(artifactKey: string): Promise<string> {
    return fetchBlobAsText(artifactKey, BUCKET);
  }

  /**
   * Delete the reconstructed CV blob from MinIO.
   */
  static async deleteArtifact(artifactKey: string): Promise<void> {
    await deleteBlob(artifactKey, BUCKET);
    appLogger.info('[CvReconstruction] Artifact deleted', { artifactKey });
  }

  // ── Markdown builder ──────────────────────────────────────────

  private static async buildMarkdown(
    userId: string,
    dashboard: OptimizationDashboardData,
    dna: ProfessionalDNASummary
  ): Promise<string> {
    const sections: string[] = [];

    sections.push(await this.headerSection(userId, dna));
    sections.push(this.summarySection(dashboard));
    sections.push(this.experienceSection(dashboard, dna));
    sections.push(this.educationSection(dna));
    sections.push(this.skillsSection(dna));

    return sections.filter(Boolean).join('\n\n---\n\n');
  }

  private static async headerSection(
    userId: string,
    _dna: ProfessionalDNASummary
  ): Promise<string> {
    let name = 'Candidate';
    let email = '';
    let linkedIn = '';

    try {
      const user = await User.findById(userId).lean();
      if (user) {
        const first = user.profile?.firstName ?? '';
        const last = user.profile?.lastName ?? '';
        name = [first, last].filter(Boolean).join(' ') || 'Candidate';
        email = user.email ?? '';
        linkedIn = user.profile?.linkedIn ?? '';
      }
    } catch { /* proceed with defaults */ }

    const contactParts: string[] = [];
    if (email) contactParts.push(email);
    if (linkedIn) contactParts.push(`[LinkedIn](${linkedIn})`);

    const lines = [`# ${name}`];
    if (contactParts.length) lines.push(contactParts.join(' | '));
    return lines.join('\n\n');
  }

  private static summarySection(dashboard: OptimizationDashboardData): string {
    if (!dashboard.generalAdvice) return '';
    return `## Summary\n\n${dashboard.generalAdvice}`;
  }

  private static experienceSection(
    dashboard: OptimizationDashboardData,
    dna: ProfessionalDNASummary
  ): string {
    if (!dna.experience.length) return '';

    const bulletMap = new Map<number, OptimizedBulletUI>();
    for (const b of dashboard.bullets) {
      bulletMap.set(b.index, b);
    }

    const entries = dna.experience.map((exp, i) => {
      const bullet = bulletMap.get(i);
      const optimized = bullet
        ? (bullet.userEdit || bullet.optimizedBullet)
        : (exp.description || '');

      const start = exp.startDate
        ? new Date(exp.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : '';
      const end = exp.isCurrent
        ? 'Present'
        : exp.endDate
          ? new Date(exp.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : '';
      const dateRange = [start, end].filter(Boolean).join(' – ');

      return [
        `### ${exp.role} — ${exp.company}`,
        dateRange ? `*${dateRange}*` : '',
        '',
        optimized ? `- ${optimized}` : '',
      ].filter(Boolean).join('\n');
    });

    return `## Experience\n\n${entries.join('\n\n')}`;
  }

  private static educationSection(dna: ProfessionalDNASummary): string {
    if (!dna.education.length) return '';

    const entries = dna.education.map((edu) => {
      const start = edu.startDate
        ? new Date(edu.startDate).toLocaleDateString('en-US', { year: 'numeric' })
        : '';
      const end = edu.endDate
        ? new Date(edu.endDate).toLocaleDateString('en-US', { year: 'numeric' })
        : '';
      const dateRange = [start, end].filter(Boolean).join(' – ');

      const parts = [`### ${edu.degree} in ${edu.fieldOfStudy}`, `*${edu.institution}*`];
      if (dateRange) parts.push(dateRange);
      if (edu.gpa) parts.push(`GPA: ${edu.gpa}`);
      return parts.join('  \n');
    });

    return `## Education\n\n${entries.join('\n\n')}`;
  }

  private static skillsSection(dna: ProfessionalDNASummary): string {
    if (!dna.skills.length) return '';

    const grouped: Record<string, string[]> = {};
    for (const s of dna.skills) {
      const cat = s.category.charAt(0).toUpperCase() + s.category.slice(1);
      (grouped[cat] ??= []).push(s.name);
    }

    const lines = Object.entries(grouped).map(
      ([cat, names]) => `**${cat}:** ${names.join(', ')}`
    );

    return `## Skills\n\n${lines.join('  \n')}`;
  }
}
