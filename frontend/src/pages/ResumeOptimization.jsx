import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { optimizeResume, uploadResume } from "../services/api";

// ── Confidence helpers ──────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high:   { label: "High",   bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-300" },
  medium: { label: "Medium", bg: "bg-amber-100",   text: "text-amber-700",   ring: "ring-amber-300"   },
  low:    { label: "Low",    bg: "bg-red-100",      text: "text-red-700",      ring: "ring-red-300"     },
};

function ConfidenceBadge({ level, score }) {
  const cfg = CONFIDENCE_CONFIG[level] || CONFIDENCE_CONFIG.medium;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring}`}
    >
      {cfg.label} — {(score * 100).toFixed(0)}%
    </span>
  );
}

// ── Score ring (circular gauge) ─────────────────────────────────────

function ScoreRing({ score, label, size = 100 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";

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
      <span className="absolute mt-8 text-2xl font-bold">{score}</span>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
}

// ── Bullet comparison card ──────────────────────────────────────────

function BulletCard({ bullet, onAccept, onDiscard, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(bullet.optimizedBullet);

  const handleSaveEdit = () => {
    onEdit(bullet.id, editValue);
    setIsEditing(false);
  };

  const isResolved = bullet.status === "accepted" || bullet.status === "discarded";

  return (
    <Card
      className={`p-4 transition-all ${
        bullet.status === "accepted"
          ? "border-emerald-300 bg-emerald-50/30"
          : bullet.status === "discarded"
          ? "border-gray-300 bg-gray-50 opacity-60"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">
            {bullet.role} @ {bullet.company}
          </span>
          <ConfidenceBadge level={bullet.confidenceLevel} score={bullet.confidenceScore} />
        </div>
        {bullet.status !== "pending" && (
          <Badge
            className={
              bullet.status === "accepted"
                ? "bg-emerald-100 text-emerald-700"
                : bullet.status === "edited"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-200 text-gray-600"
            }
          >
            {bullet.status}
          </Badge>
        )}
      </div>

      {/* Original bullet */}
      <div className="mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Original
        </div>
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100">
          {bullet.originalBullet}
        </p>
      </div>

      {/* Optimized bullet (editable) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">
            AI Suggestion
          </span>
          {!isResolved && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-[10px] text-blue-500 hover:text-blue-700 underline"
            >
              Edit
            </button>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-lg border border-blue-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditValue(bullet.optimizedBullet);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-900 bg-blue-50/50 rounded-lg p-3 border border-blue-100">
            {bullet.userEdit || bullet.optimizedBullet}
          </p>
        )}
      </div>

      {/* Explanation */}
      <p className="text-xs text-gray-500 italic mb-3">{bullet.explanation}</p>

      {/* Keywords used */}
      {bullet.keywordsUsed.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {bullet.keywordsUsed.map((kw) => (
            <span
              key={kw}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isResolved && (
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => onAccept(bullet.id)}
          >
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDiscard(bullet.id)}>
            Discard
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Gaps remaining panel ────────────────────────────────────────────

function GapsPanel({ gaps }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Gaps Remaining</h3>
      <p className="text-xs text-gray-500 mb-3">
        JD skills your profile hasn't addressed yet. Consider adding relevant experience or
        coursework to your DNA.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {gaps.map((gap) => (
          <span
            key={gap}
            className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
          >
            {gap}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── Score breakdown panel ───────────────────────────────────────────

function ScorePanel({ hybridScore }) {
  if (!hybridScore) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Match Score Breakdown</h3>

      <div className="flex justify-center mb-6 relative">
        <ScoreRing score={hybridScore.finalScore} label="Overall Match" size={110} />
      </div>

      <div className="space-y-4">
        {/* Hard rule score */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">
              Hard Skills ({(hybridScore.hardRuleWeight * 100).toFixed(0)}% weight)
            </span>
            <span className="font-semibold">
              {hybridScore.hardRuleDetails.totalMatched}/{hybridScore.hardRuleDetails.totalRequired}
            </span>
          </div>
          <Progress value={hybridScore.hardRuleScore} />
        </div>

        {/* Semantic score */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">
              Semantic Match ({(hybridScore.semanticWeight * 100).toFixed(0)}% weight)
            </span>
            <span className="font-semibold">{hybridScore.semanticScore}/100</span>
          </div>
          <Progress value={hybridScore.semanticScore} />
        </div>

        {/* Semantic reasoning */}
        {hybridScore.semanticDetails?.reasoning && (
          <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
            {hybridScore.semanticDetails.reasoning}
          </p>
        )}
      </div>
    </Card>
  );
}

// ── Main Dashboard Page ─────────────────────────────────────────────

export default function ResumeOptimization() {
  const { userId: authUserId } = useAuth();
  const navigate = useNavigate();
  const [manualUserId, setManualUserId] = useState("");
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [runMeta, setRunMeta] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [needsResumeUpload, setNeedsResumeUpload] = useState(false);

  const effectiveUserId =
    authUserId || uploadResult?.userId || manualUserId.trim();

  const showUploadSection = !authUserId || needsResumeUpload;

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const res = await uploadResume(file, authUserId || undefined);
      setUploadResult(res.data);
      setManualUserId(res.data.userId);
      setNeedsResumeUpload(false);
    } catch (err) {
      setError(err.message || "Resume upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleOptimize = async () => {
    if (!jdText.trim()) return;
    if (!effectiveUserId) {
      setError("Please upload a resume or enter a User ID.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await optimizeResume({
        userId: effectiveUserId,
        jobDescriptionText: jdText,
      });
      setData(response.data);
      if (response.run) setRunMeta(response.run);
      setNeedsResumeUpload(false);
    } catch (err) {
      if (err?.payload?.error?.code === "RESUME_NOT_UPLOADED") {
        setNeedsResumeUpload(true);
        setError(
          err.message ||
            "Please upload your resume before running an optimization."
        );
      } else {
        setError(err.message || "Optimization failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = (bulletId) => {
    setData((prev) => ({
      ...prev,
      bullets: prev.bullets.map((b) =>
        b.id === bulletId ? { ...b, status: "accepted" } : b
      ),
    }));
  };

  const handleDiscard = (bulletId) => {
    setData((prev) => ({
      ...prev,
      bullets: prev.bullets.map((b) =>
        b.id === bulletId ? { ...b, status: "discarded" } : b
      ),
    }));
  };

  const handleEdit = (bulletId, newText) => {
    setData((prev) => ({
      ...prev,
      bullets: prev.bullets.map((b) =>
        b.id === bulletId ? { ...b, userEdit: newText, status: "edited" } : b
      ),
    }));
  };

  const acceptedCount = data?.bullets?.filter(
    (b) => b.status === "accepted" || b.status === "edited"
  ).length ?? 0;
  const totalCount = data?.bullets?.length ?? 0;

  return (
    <PageLayout
      title="CV Optimization"
      subtitle="AI-powered ATS alignment"
      showBack
    >
      {/* History link */}
      {!data && effectiveUserId && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/cv/history?userId=${encodeURIComponent(effectiveUserId)}`)}
          >
            View History
          </Button>
        </div>
      )}

      {/* JD input phase */}
      {!data && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Paste a Job Description
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              We'll analyze the JD against your Professional DNA and generate ATS-optimized
              bullet points.
            </p>

            {showUploadSection && (
              <div className="mb-4 space-y-3">
                {needsResumeUpload && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">
                      Resume required
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      We couldn't find a resume on your account. Upload your CV as a
                      PDF below and we'll parse it before running the optimization.
                    </p>
                  </div>
                )}

                {/* Resume upload option */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Upload Your Resume (PDF)
                  </label>
                  <div className="flex items-center gap-3">
                    <label
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm cursor-pointer transition-colors ${
                        uploading
                          ? "border-gray-200 bg-gray-50 text-gray-400 cursor-wait"
                          : uploadResult
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 text-gray-500"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleResumeUpload}
                        disabled={uploading || loading}
                      />
                      {uploading ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                          Parsing resume with AI...
                        </>
                      ) : uploadResult ? (
                        <>
                          Loaded: {uploadResult.candidateName || "Resume"} —{" "}
                          {uploadResult.skillCount} skills, {uploadResult.experienceCount} roles
                        </>
                      ) : (
                        "Click to upload a PDF resume"
                      )}
                    </label>
                  </div>
                </div>

                {!authUserId && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-gray-200" />
                      <span className="text-[10px] font-medium text-gray-400 uppercase">or</span>
                      <div className="flex-1 border-t border-gray-200" />
                    </div>

                    {/* Manual userId option */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Enter User ID
                      </label>
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="e.g. 665f1a2b3c4d5e6f7a8b9c0d"
                        value={manualUserId}
                        onChange={(e) => {
                          setManualUserId(e.target.value);
                          if (uploadResult) setUploadResult(null);
                        }}
                        disabled={loading || uploading}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <textarea
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              rows={8}
              placeholder="Paste the full job description here..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              disabled={loading}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {jdText.length > 0 ? `${jdText.length} chars` : ""}
              </span>
              <Button onClick={handleOptimize} disabled={loading || !jdText.trim() || !effectiveUserId}>
                {loading ? "Analyzing..." : "Optimize My CV"}
              </Button>
            </div>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </Card>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-500">
            Analyzing your CV against the Job Description...
          </p>
          <p className="text-xs text-gray-400 mt-1">This may take 15-30 seconds</p>
        </div>
      )}

      {/* Results dashboard */}
      {data && !loading && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Optimization Results</h2>
              <p className="text-xs text-gray-500">
                {acceptedCount}/{totalCount} suggestions accepted
              </p>
            </div>
            <div className="flex gap-2">
              {runMeta?._id && (
                <Button
                  size="sm"
                  onClick={() => navigate(`/cv/history/${runMeta._id}?userId=${encodeURIComponent(effectiveUserId)}`, { state: { bullets: data?.bullets } })}
                >
                  View Saved Run
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setData(null);
                  setJdText("");
                  setRunMeta(null);
                }}
              >
                New Analysis
              </Button>
            </div>
          </div>

          {/* General advice */}
          {data.generalAdvice && (
            <Card className="bg-blue-50/50 border-blue-200 p-4">
              <p className="text-xs font-semibold text-blue-600 mb-1">AI Advice</p>
              <p className="text-sm text-blue-900">{data.generalAdvice}</p>
            </Card>
          )}

          {/* Two-column: score + gaps on right, bullets on left */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bullet comparison cards */}
            <div className="md:col-span-2 space-y-3">
              {data.bullets?.map((bullet) => (
                <BulletCard
                  key={bullet.id}
                  bullet={bullet}
                  onAccept={handleAccept}
                  onDiscard={handleDiscard}
                  onEdit={handleEdit}
                />
              ))}

              {(!data.bullets || data.bullets.length === 0) && (
                <Card className="p-8 text-center">
                  <p className="text-sm text-gray-500">
                    No experience bullets found in your Professional DNA. Upload your resume
                    first.
                  </p>
                </Card>
              )}
            </div>

            {/* Sidebar: Score + Gaps */}
            <div className="space-y-4">
              <ScorePanel hybridScore={data.hybridScore} />
              <GapsPanel gaps={data.gapsRemaining} />

              {/* Meta info */}
              {data.meta && (
                <Card className="p-3">
                  <div className="space-y-1 text-[10px] text-gray-400">
                    <p>Prompt: {data.meta.promptVersion}</p>
                    <p>Model: {data.meta.modelUsed}</p>
                    <p>Generated: {new Date(data.meta.generatedAt).toLocaleString()}</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
