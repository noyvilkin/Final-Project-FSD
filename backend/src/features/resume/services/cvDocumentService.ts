import { Types } from 'mongoose';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import { ProfessionalDNA } from '../models/professionalDNA.model.js';
import type { ICvSnapshot } from '../models/optimizationRun.model.js';
import { User } from '../../user/models/user.model.js';

interface AcceptedBullet {
  originalBullet: string;
  optimizedBullet: string;
  userEdit?: string;
  index?: number;
}

const ACCENT = '1F3864'; // navy heading color
const TEXT = '262626';
const MUTED = '6B6B6B';

// A4 page geometry (twips). Right tab sits flush with the right margin.
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN_X = 1134; // ~2cm
const MARGIN_Y = 1021; // ~1.8cm
const RIGHT_TAB = PAGE_W - MARGIN_X * 2;

// Parser placeholders that should never be shown to the reader.
const PLACEHOLDERS = new Set(['unknown', 'general', 'n/a', 'na', 'none', '-', '–']);

function clean(value?: string): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  return PLACEHOLDERS.has(s.toLowerCase()) ? '' : s;
}

/**
 * Composes a clean, ATS-friendly Word (.docx) CV from the user's
 * structured Professional DNA, integrating any accepted/edited bullets
 * into the Work Experience section.
 *
 * Sections (each rendered only when data exists):
 *   NAME · CONTACT · ABOUT ME · EDUCATION · WORK EXPERIENCE · SKILLS · LANGUAGE
 */
// Only the structured fields the composer actually renders — keeps the
// DNA read lean (no rawResumeText).
const SNAPSHOT_FIELDS =
  'candidateName candidateEmail candidatePhone candidateLocation candidateLinks ' +
  'aboutMe profileSummary skills experience education';

export class CvDocumentService {
  /**
   * Compose the CV from a frozen DNA snapshot captured at optimization
   * time. This is the source of truth for downloads: accepted-bullet
   * indexes always line up with the experience entries they were
   * optimized against.
   */
  static async buildDocxFromSnapshot(
    snapshot: ICvSnapshot,
    acceptedBullets: AcceptedBullet[]
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = this.compose(snapshot, acceptedBullets || []);
    const buffer = await Packer.toBuffer(doc);

    const base = (snapshot.candidateName || 'optimized')
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '');
    const fileName = `${base || 'optimized'}_CV.docx`;

    return { buffer, fileName };
  }

  // ── Data access ─────────────────────────────────────────────────

  /**
   * Build a structured DNA snapshot for the user's current profile.
   * Used at optimize time to freeze the DNA onto the run, and as a
   * fallback for legacy runs that predate snapshots.
   */
  static async snapshotForUser(userId: string): Promise<ICvSnapshot | null> {
    if (!Types.ObjectId.isValid(userId)) return null;

    const user = await User.findById(userId).lean();
    let dna = null;
    if (user?.latestProfessionalDNA) {
      dna = await ProfessionalDNA.findById(user.latestProfessionalDNA)
        .select(SNAPSHOT_FIELDS)
        .lean();
    }
    if (!dna) {
      dna = await ProfessionalDNA.findOne({ userId: new Types.ObjectId(userId) })
        .select(SNAPSHOT_FIELDS)
        .sort({ updatedAt: -1 })
        .lean();
    }
    if (!dna) return null;

    return {
      candidateName: dna.candidateName,
      candidateEmail: dna.candidateEmail,
      candidatePhone: dna.candidatePhone,
      candidateLocation: dna.candidateLocation,
      candidateLinks: dna.candidateLinks,
      aboutMe: dna.aboutMe,
      profileSummary: dna.profileSummary,
      skills: dna.skills || [],
      experience: dna.experience || [],
      education: dna.education || [],
    };
  }

  // ── Composition ─────────────────────────────────────────────────

  private static compose(dna: ICvSnapshot, acceptedBullets: AcceptedBullet[]): Document {
    const children: Paragraph[] = [];

    // NAME
    const name = clean(dna.candidateName) || 'Your Name';
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({ text: name.toUpperCase(), bold: true, size: 40, color: ACCENT, characterSpacing: 24 }),
        ],
      })
    );

    // Optional subtitle: most recent role title
    const subtitle = clean(dna.profileSummary?.lastRoleTitle);
    if (subtitle) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: subtitle.toUpperCase(), size: 19, color: MUTED, characterSpacing: 36 }),
          ],
        })
      );
    }

    // CONTACT — centered, separated by a middle dot, with a divider rule under it
    const contactBits = [
      clean(dna.candidateEmail),
      clean(dna.candidatePhone),
      clean(dna.candidateLocation),
      ...(dna.candidateLinks || []).map((l) => clean(l)),
    ].filter(Boolean);
    if (contactBits.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          border: { bottom: { color: 'D9D9D9', size: 6, style: BorderStyle.SINGLE, space: 6 } },
          children: [new TextRun({ text: contactBits.join('   •   '), size: 18, color: MUTED })],
        })
      );
    }

    // ABOUT ME
    const aboutMe = clean(dna.aboutMe);
    if (aboutMe) {
      children.push(this.sectionHeading('ABOUT ME'));
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120, line: 264 },
          children: [new TextRun({ text: aboutMe, size: 20, color: TEXT })],
        })
      );
    }

    // EDUCATION
    const education = (dna.education || []).filter(
      (e) => e && (clean(e.degree) || clean(e.fieldOfStudy) || clean(e.institution))
    );
    if (education.length > 0) {
      children.push(this.sectionHeading('EDUCATION'));
      education.forEach((edu, idx) => {
        const title = [clean(edu.degree), clean(edu.fieldOfStudy)].filter(Boolean).join(', ');
        const inst = clean(edu.institution);
        const headerText = title || inst || 'Education';
        const dateRange = this.formatDateRange(edu.startDate, edu.endDate, false);

        const detailParts: string[] = [];
        if (title && inst) detailParts.push(inst);
        if (edu.gpa != null) detailParts.push(`GPA: ${edu.gpa}`);
        const hasDetail = detailParts.length > 0;
        const isLast = idx === education.length - 1;

        children.push(this.entryHeader(headerText, dateRange, { after: hasDetail ? 0 : isLast ? 60 : 140 }));
        if (hasDetail) {
          children.push(
            new Paragraph({
              spacing: { after: isLast ? 60 : 140 },
              children: [new TextRun({ text: detailParts.join('   •   '), italics: true, size: 19, color: MUTED })],
            })
          );
        }
      });
    }

    // WORK EXPERIENCE
    // Keep each entry's ORIGINAL array position: accepted-bullet `index`
    // values come from the (unfiltered) experience array the run was
    // optimized against, so matching must use that original index — not
    // the position within this filtered/displayed list.
    const experience = (dna.experience || [])
      .map((exp, originalIndex) => ({ exp, originalIndex }))
      .filter(({ exp }) => exp && (clean(exp.company) || clean(exp.role)));
    if (experience.length > 0) {
      children.push(this.sectionHeading('WORK EXPERIENCE'));
      experience.forEach(({ exp, originalIndex }, idx) => {
        const role = clean(exp.role);
        const company = clean(exp.company);
        const dateRange = this.formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);

        const headerRuns: TextRun[] = [];
        headerRuns.push(new TextRun({ text: role || company || 'Role', bold: true, size: 22, color: TEXT }));
        if (role && company) {
          headerRuns.push(new TextRun({ text: `   ${company}`, size: 21, color: MUTED }));
        }
        if (dateRange) {
          headerRuns.push(new TextRun({ text: `\t ${dateRange}`, size: 18, color: MUTED, italics: true }));
        }
        children.push(
          new Paragraph({
            spacing: { before: idx === 0 ? 40 : 140, after: 40 },
            tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
            children: headerRuns,
          })
        );

        const originalBullets = this.splitBullets(exp.description || '');
        const acceptedForExp = acceptedBullets.filter((b) =>
          typeof b.index === 'number'
            ? b.index === originalIndex
            : this.sameSegment(b.originalBullet, exp.description || '')
        );
        const finalBullets = this.mergeAccepted(originalBullets, acceptedForExp);

        for (const b of finalBullets) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 40, line: 252 },
              children: [new TextRun({ text: b, size: 20, color: TEXT })],
            })
          );
        }
      });
    }

    // SKILLS (technical / tool / soft — languages handled separately)
    const uniqueSkills = Array.from(
      new Set(
        (dna.skills || [])
          .filter((s) => s && s.category !== 'language' && clean(s.name))
          .map((s) => s.name.trim())
      )
    );
    if (uniqueSkills.length > 0) {
      children.push(this.sectionHeading('SKILLS'));
      children.push(
        new Paragraph({
          spacing: { after: 120, line: 264 },
          children: [new TextRun({ text: uniqueSkills.join('   •   '), size: 20, color: TEXT })],
        })
      );
    }

    // LANGUAGE
    const uniqueLanguages = Array.from(
      new Set(
        (dna.skills || [])
          .filter((s) => s && s.category === 'language' && clean(s.name))
          .map((s) => s.name.trim())
      )
    );
    if (uniqueLanguages.length > 0) {
      children.push(this.sectionHeading('LANGUAGE'));
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: uniqueLanguages.join('   •   '), size: 20, color: TEXT })],
        })
      );
    }

    return new Document({
      creator: 'CareerPilot',
      title: `${name} CV`,
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 20, color: TEXT } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: PAGE_W, height: PAGE_H },
              margin: { top: MARGIN_Y, bottom: MARGIN_Y, left: MARGIN_X, right: MARGIN_X },
            },
          },
          children,
        },
      ],
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private static sectionHeading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 120 },
      border: {
        bottom: { color: ACCENT, size: 4, style: BorderStyle.SINGLE, space: 3 },
      },
      children: [new TextRun({ text, bold: true, size: 23, color: ACCENT, characterSpacing: 40 })],
    });
  }

  /** A title on the left with a date range flush-right via a tab stop. */
  private static entryHeader(
    title: string,
    dateRange: string,
    spacing: { before?: number; after?: number }
  ): Paragraph {
    return new Paragraph({
      spacing,
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      children: [
        new TextRun({ text: title, bold: true, size: 21, color: TEXT }),
        ...(dateRange ? [new TextRun({ text: `\t ${dateRange}`, size: 18, color: MUTED, italics: true })] : []),
      ],
    });
  }

  private static formatDateRange(
    start?: Date,
    end?: Date,
    isCurrent?: boolean
  ): string {
    const fmt = (d?: Date): string => {
      if (!d) return '';
      const date = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };
    const s = fmt(start);
    const e = isCurrent ? 'Present' : fmt(end);
    if (s && e) return s === e ? s : `${s} – ${e}`;
    return s || e || '';
  }

  /**
   * Break a concatenated description (verbatim bullets joined with
   * spaces) into individual bullet lines: split on common bullet
   * glyphs first, then on sentence boundaries.
   */
  private static splitBullets(text: string): string[] {
    if (!text || !text.trim()) return [];

    const normalized = text
      .replace(/\r/g, '\n')
      .replace(/\s*[•▪◦‣·]\s*/g, '\n')
      .replace(/\n\s*[-–]\s+/g, '\n');

    const lines = normalized
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const out: string[] = [];
    for (const line of lines) {
      const sentences = line
        .split(/(?<=[.!?])\s+(?=[A-Z(])/)
        .map((s) => s.trim())
        .filter(Boolean);
      out.push(...(sentences.length > 0 ? sentences : [line]));
    }

    return out
      .map((s) => s.replace(/^[-–•▪◦‣·]\s*/, '').trim())
      .filter((s) => s.length > 1);
  }

  /**
   * Merge accepted/edited rewrites into an experience's bullets.
   *
   * Each suggestion carries the WHOLE concatenated description as its
   * `originalBullet`, and each `optimizedBullet` is a full rewrite of that
   * same description (the prompt emits one entry per experience). So once
   * any rewrite is accepted for a role, it supersedes the entire original
   * description: we replace ALL original bullets with the accepted
   * rewrite(s), re-split into individual bullets. This avoids leaving
   * stale original sentences alongside the rewrite. Roles with no accepted
   * rewrites keep their original bullets untouched.
   */
  private static mergeAccepted(
    originalBullets: string[],
    accepted: AcceptedBullet[]
  ): string[] {
    const replacements = accepted
      .map((acc) => (acc.userEdit || acc.optimizedBullet || '').trim())
      .filter(Boolean);

    if (replacements.length === 0) return originalBullets;

    return replacements.flatMap((text) => this.splitBullets(text));
  }

  /** Whether two texts refer to the same experience description. */
  private static sameSegment(a: string, b: string): boolean {
    const norm = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }
}
