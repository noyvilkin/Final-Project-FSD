import { detectFillerWords, FillerWordEntry } from '../../features/interview/services/fillerWordDetectionService.js';

describe('fillerWordDetectionService', () => {
  describe('detectFillerWords', () => {
    it('should return zero counts for empty transcript', () => {
      const result = detectFillerWords('');
      expect(result.totalCount).toBe(0);
      expect(result.ratePerMinute).toBe(0);
      expect(result.examples).toEqual([]);
    });

    it('should return zero counts for whitespace-only transcript', () => {
      const result = detectFillerWords('   \n\t  ');
      expect(result.totalCount).toBe(0);
      expect(result.ratePerMinute).toBe(0);
      expect(result.examples).toEqual([]);
    });

    it('should detect simple filler words', () => {
      const transcript = 'Um, I worked on the project. Uh, it was challenging.';
      const result = detectFillerWords(transcript);

      expect(result.totalCount).toBe(2);
      expect(result.examples).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ word: 'um', count: 1 }),
          expect.objectContaining({ word: 'uh', count: 1 }),
        ]),
      );
    });

    it('should count multiple occurrences of the same filler', () => {
      const transcript = 'Um, I was um working on um the project.';
      const result = detectFillerWords(transcript);

      const umEntry = result.examples.find((e: FillerWordEntry) => e.word === 'um');
      expect(umEntry).toBeDefined();
      expect(umEntry!.count).toBe(3);
    });

    it('should detect multi-word filler phrases', () => {
      const transcript = 'I was, you know, working on this thing, and, you know, it turned out great.';
      const result = detectFillerWords(transcript);

      const ykEntry = result.examples.find((e: FillerWordEntry) => e.word === 'you know');
      expect(ykEntry).toBeDefined();
      expect(ykEntry!.count).toBe(2);
    });

    it('should prioritize longer phrases over shorter overlapping ones', () => {
      // "you know" should be matched as a phrase, not "you" + "know" separately
      const transcript = 'It was, you know, really difficult.';
      const result = detectFillerWords(transcript);

      const ykEntry = result.examples.find((e: FillerWordEntry) => e.word === 'you know');
      expect(ykEntry).toBeDefined();
      expect(ykEntry!.count).toBe(1);
    });

    it('should be case-insensitive', () => {
      const transcript = 'UM, I was working. Basically it was fine. BASICALLY.';
      const result = detectFillerWords(transcript);

      const umEntry = result.examples.find((e: FillerWordEntry) => e.word === 'um');
      expect(umEntry).toBeDefined();
      expect(umEntry!.count).toBe(1);

      const basicallyEntry = result.examples.find((e: FillerWordEntry) => e.word === 'basically');
      expect(basicallyEntry).toBeDefined();
      expect(basicallyEntry!.count).toBe(2);
    });

    it('should sort examples by count descending', () => {
      const transcript = 'Um um um. Uh uh. Basically.';
      const result = detectFillerWords(transcript);

      expect(result.examples.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < result.examples.length; i++) {
        expect(result.examples[i - 1].count).toBeGreaterThanOrEqual(result.examples[i].count);
      }
    });

    it('should calculate rate per minute using provided duration', () => {
      const transcript = 'Um, uh, basically, you know, actually, I did the thing.';
      const result = detectFillerWords(transcript, { durationMinutes: 2 });

      expect(result.ratePerMinute).toBe(result.totalCount / 2);
    });

    it('should estimate duration from word count when not provided', () => {
      // ~150 words => ~1 minute at default 150 wpm
      const words = Array(150).fill('word').join(' ');
      const transcript = `Um ${words} um`;
      const result = detectFillerWords(transcript);

      // 2 fillers in ~1 minute => rate should be approximately 2
      expect(result.ratePerMinute).toBeGreaterThan(1);
      expect(result.ratePerMinute).toBeLessThan(4);
    });

    it('should detect "like" as a filler in filler context', () => {
      // "like" preceded by comma or at start of phrase (not after a verb)
      const transcript = 'It was, like, really challenging and, like, super complex.';
      const result = detectFillerWords(transcript);

      const likeEntry = result.examples.find((e: FillerWordEntry) => e.word === 'like');
      expect(likeEntry).toBeDefined();
      expect(likeEntry!.count).toBeGreaterThanOrEqual(1);
    });

    it('should NOT count "like" when used as a verb', () => {
      const transcript = 'I like coding and I like solving problems.';
      const result = detectFillerWords(transcript);

      const likeEntry = result.examples.find((e: FillerWordEntry) => e.word === 'like');
      // "I like" => structural, should not be counted
      expect(likeEntry).toBeUndefined();
    });

    it('should NOT count "well" after "as" (structural use)', () => {
      const transcript = 'I handled the frontend as well as the backend.';
      const result = detectFillerWords(transcript);

      const wellEntry = result.examples.find((e: FillerWordEntry) => e.word === 'well');
      expect(wellEntry).toBeUndefined();
    });

    it('should NOT count "right" in "right now" or "the right"', () => {
      const transcript = 'I need to finish this right now. It was the right decision.';
      const result = detectFillerWords(transcript);

      const rightEntry = result.examples.find((e: FillerWordEntry) => e.word === 'right');
      expect(rightEntry).toBeUndefined();
    });

    it('should accept custom filler phrases', () => {
      const transcript = 'Blorp, I was working on the blorp project. Blorp!';
      const result = detectFillerWords(transcript, { fillerPhrases: ['blorp'] });

      expect(result.totalCount).toBe(3);
      expect(result.examples).toEqual([{ word: 'blorp', count: 3 }]);
    });

    it('should handle transcripts with no fillers', () => {
      const transcript = 'I led the migration of our database from MySQL to PostgreSQL. ' +
        'The project reduced query latency by forty percent and saved the company ' +
        'twenty thousand dollars per month in hosting costs.';
      const result = detectFillerWords(transcript);

      expect(result.totalCount).toBe(0);
      expect(result.examples).toEqual([]);
    });

    it('should handle realistic interview transcript with mixed fillers', () => {
      const transcript =
        'Um, so basically what happened was, you know, our team was assigned this ' +
        'project and, uh, I was kind of the lead on it. I mean, I had to, like, ' +
        'coordinate with, you know, multiple teams. Actually, it was sort of a ' +
        'complex situation. Honestly, um, I think we did well.';

      const result = detectFillerWords(transcript, { durationMinutes: 1 });

      // Should detect: um(2), so(?), basically(1), you know(2), uh(1),
      // kind of(1), I mean(1), like(?), actually(1), sort of(1), honestly(1)
      expect(result.totalCount).toBeGreaterThanOrEqual(10);
      expect(result.ratePerMinute).toBeGreaterThanOrEqual(10);

      // Verify the highest-count fillers are present
      const words = result.examples.map((e: FillerWordEntry) => e.word);
      expect(words).toContain('um');
      expect(words).toContain('you know');
    });

    it('should have filler count within +/- 3 of manual count (acceptance criteria)', () => {
      // Manual count for this transcript:
      // um(1), uh(1), basically(1), you know(1), actually(1), kind of(1), I mean(1) = 7
      const transcript =
        'Um, I was working on a project and, uh, basically it was about improving ' +
        'our deployment pipeline. You know, we had these issues with, I mean, the ' +
        'CI was kind of slow. I actually managed to fix it.';

      const result = detectFillerWords(transcript);
      const manualCount = 7;

      expect(Math.abs(result.totalCount - manualCount)).toBeLessThanOrEqual(3);
    });

    it('should not match fillers inside other words', () => {
      // "um" should not match in "umbrella", "uh" should not match in "uhuru"
      const transcript = 'I used an umbrella during the humid weather near the forum.';
      const result = detectFillerWords(transcript);

      const umEntry = result.examples.find((e: FillerWordEntry) => e.word === 'um');
      expect(umEntry).toBeUndefined();
    });

    it('should handle punctuation-adjacent fillers', () => {
      // Fillers often appear next to commas, periods, etc.
      const transcript = 'Um... I was thinking. Uh—maybe we could. Basically, yeah.';
      const result = detectFillerWords(transcript);

      expect(result.totalCount).toBeGreaterThanOrEqual(3);
    });
  });
});
