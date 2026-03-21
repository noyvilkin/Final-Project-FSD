import { useState, useCallback } from "react";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Progress } from "../components/ui/progress";
import { optimizeResume, acceptBullet } from "../services/api";

// ── Confidence badge colors ─────────────────────────────────────────

const CONFIDENCE_STYLES = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
};

const CONFIDENCE_LABELS = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
};

// ── Score ring component ────────────────────────────────────────────

function ScoreRing({ score, label, size = 100 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 75 ? "text-green-500" : score >= 50 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className="text-2xl font-bold -mt-16">{score}</span>
      <span className="text-xs text-gray-500 mt-8">{label}</span>
    </div>
  );
}

// ── Bullet suggestion card ──────────────────────────────────────────

function BulletCard({ bullet, onAccept, onDiscard, onEdit, saving }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">
          {bullet.role} — {bullet.company}
        </div>
        <Badge className={CONFIDENCE_STYLES[bullet.confidenceLevel]}>
          {CONFIDENCE_LABELS[bullet.confidenceLevel]} ({Math.round(bullet.confidenceScore * 100)}%)
        </Badge>
      </div>

      {/* Original vs Suggested */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Original
          </div>
          <p className="text-sm text-gray-700">{bullet.originalBullet}</p>
        </div>

        <div className="rounded-lg bg-blue-50 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
            AI Suggestion
          </div>
          {isEditing ? (
            <Textarea
              className="min-h-[80px] text-sm"
              value={bullet.editedBullet}
              onChange={(e) => onEdit(bullet.id, e.target.value)}
            />
          ) : (
            <p className="text-sm text-gray-900">{bullet.editedBullet}</p>
          )}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-gray-500 italic">{bullet.explanation}</p>

      {/* Keywords */}
      {bullet.keywordsUsed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bullet.keywordsUsed.map((kw) => (
            <span
              key={kw}
              className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {bullet.status === "pending" && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onAccept(bullet)}
            disabled={saving}
          >
            {saving ? "Saving…" : "Accept"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDiscard(bullet.id)}
          >
            Discard
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing((v) => !v)}
          >
            {isEditing ? "Done Editing" : "Edit"}
          </Button>
        </div>
      )}

      {bullet.status === "accepted" && (
        <Badge className="bg-green-100 text-green-800">Accepted</Badge>
      )}
      {bullet.status === "discarded" && (
        <Badge className="bg-gray-100 text-gray-500">Discarded</Badge>
      )}
    </Card>
  );
}

// ── Gaps Remaining panel ────────────────────────────────────────────

function GapsPanel({ gaps }) {
  if (!gaps || gaps.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-green-700 mb-1">No Gaps Remaining</h3>
        <p className="text-xs text-gray-500">
          Your DNA covers all required areas for this position.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-red-700 mb-2">
        Gaps Remaining ({gaps.length})
      </h3>
      <ul className="space-y-1">
        {gaps.map((gap, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
            {gap}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────

export default function OptimizationDashboard() {
  const [dnaId, setDnaId] = useState("");
  const [jdRaw, setJdRaw] = useState("");
  const [jdTitle, setJdTitle] = useState("");
  const [jdCompany, setJdCompany] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [responsibilities, setResponsibilities] = useState("");

  const [bullets, setBullets] = useState([]);
  const [hybridScore, setHybridScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  const handleOptimize = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const jobDescription = {
        title: jdTitle,
        company: jdCompany || undefined,
        description: jdRaw,
        requiredSkills: requiredSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        preferredSkills: preferredSkills
          ? preferredSkills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        coreResponsibilities: responsibilities
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const result = await optimizeResume({
        professionalDNAId: dnaId,
        jobDescription,
      });

      setBullets(result.bullets);
      setHybridScore(result.hybridScore);
    } catch (err) {
      setError(err.message || "Optimization failed");
    } finally {
      setLoading(false);
    }
  }, [dnaId, jdRaw, jdTitle, jdCompany, requiredSkills, preferredSkills, responsibilities]);

  const handleAccept = useCallback(
    async (bullet) => {
      setSavingId(bullet.id);
      try {
        await acceptBullet({
          professionalDNAId: dnaId,
          experienceIndex: bullet.experienceIndex,
          finalBullet: bullet.editedBullet,
        });
        setBullets((prev) =>
          prev.map((b) =>
            b.id === bullet.id ? { ...b, status: "accepted" } : b
          )
        );
      } catch (err) {
        setError(err.message || "Failed to save bullet");
      } finally {
        setSavingId(null);
      }
    },
    [dnaId]
  );

  const handleDiscard = useCallback((id) => {
    setBullets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "discarded" } : b))
    );
  }, []);

  const handleEdit = useCallback((id, value) => {
    setBullets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, editedBullet: value } : b))
    );
  }, []);

  const hasResults = bullets.length > 0 || hybridScore;

  return (
    <PageLayout
      title="Resume Optimizer"
      subtitle="AI-powered CV optimization for ATS"
      showBack
    >
      <div className="space-y-6">
        {/* ── Input Form ─────────────────────────────────────────── */}
        <Card className="p-5 space-y-4">
          <h2 className="text-base font-semibold">Configuration</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Professional DNA ID
            </label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Paste your ProfessionalDNA _id"
              value={dnaId}
              onChange={(e) => setDnaId(e.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Job Title
              </label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="e.g. Senior Frontend Engineer"
                value={jdTitle}
                onChange={(e) => setJdTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Company (optional)
              </label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="e.g. Google"
                value={jdCompany}
                onChange={(e) => setJdCompany(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Job Description
            </label>
            <Textarea
              placeholder="Paste the full job description text here…"
              value={jdRaw}
              onChange={(e) => setJdRaw(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Required Skills (comma-separated)
            </label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="React, TypeScript, Node.js, AWS"
              value={requiredSkills}
              onChange={(e) => setRequiredSkills(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Preferred Skills (comma-separated, optional)
            </label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="GraphQL, Docker, CI/CD"
              value={preferredSkills}
              onChange={(e) => setPreferredSkills(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Core Responsibilities (one per line)
            </label>
            <Textarea
              placeholder={"Build scalable web applications\nCollaborate with cross-functional teams\nMentor junior developers"}
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
            />
          </div>

          <Button
            onClick={handleOptimize}
            disabled={loading || !dnaId || !jdTitle || !requiredSkills || !responsibilities}
            className="w-full"
          >
            {loading ? "Optimizing with AI…" : "Optimize Resume"}
          </Button>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </Card>

        {/* ── Results ────────────────────────────────────────────── */}
        {hasResults && (
          <>
            {/* Score overview */}
            {hybridScore && (
              <Card className="p-5">
                <h2 className="text-base font-semibold mb-4">Match Score</h2>

                <div className="flex items-center justify-around">
                  <ScoreRing
                    score={hybridScore.finalScore}
                    label="Overall"
                    size={110}
                  />
                  <ScoreRing
                    score={hybridScore.hardRuleMatch.score}
                    label="Hard Skills (40%)"
                    size={90}
                  />
                  <ScoreRing
                    score={hybridScore.semanticSimilarity.score}
                    label="Semantic (60%)"
                    size={90}
                  />
                </div>

                {/* Matched / Missing skills */}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-green-700 mb-1">
                      Matched Skills ({hybridScore.hardRuleMatch.matchedSkills.length}/{hybridScore.hardRuleMatch.totalRequired})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {hybridScore.hardRuleMatch.matchedSkills.map((s) => (
                        <Badge key={s} className="bg-green-100 text-green-800 text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-red-700 mb-1">
                      Missing Skills ({hybridScore.hardRuleMatch.missingSkills.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {hybridScore.hardRuleMatch.missingSkills.map((s) => (
                        <Badge key={s} className="bg-red-100 text-red-800 text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Match Progress</span>
                    <span>{hybridScore.finalScore}/100</span>
                  </div>
                  <Progress value={hybridScore.finalScore} />
                </div>
              </Card>
            )}

            {/* Gaps panel */}
            {hybridScore && <GapsPanel gaps={hybridScore.gapsRemaining} />}

            {/* Bullet suggestions */}
            {bullets.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold">
                  AI Suggestions ({bullets.length})
                </h2>
                {bullets.map((bullet) => (
                  <BulletCard
                    key={bullet.id}
                    bullet={bullet}
                    onAccept={handleAccept}
                    onDiscard={handleDiscard}
                    onEdit={handleEdit}
                    saving={savingId === bullet.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
