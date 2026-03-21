import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import {
  getOptimizationRun,
  getOptimizationArtifact,
  deleteOptimizationRun,
} from "../services/api";

// ── Full-CV Preview Modal ───────────────────────────────────────────

function PreviewModal({ text, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-3xl max-h-[85vh] rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Full Optimized CV Preview
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ── Score ring ───────────────────────────────────────────────────────

function ScoreRing({ score, label, size = 100 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70
      ? "text-emerald-500"
      : score >= 50
      ? "text-amber-500"
      : "text-red-500";

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

// ── Confidence badge ────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high: {
    label: "High",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    ring: "ring-emerald-300",
  },
  medium: {
    label: "Medium",
    bg: "bg-amber-100",
    text: "text-amber-700",
    ring: "ring-amber-300",
  },
  low: {
    label: "Low",
    bg: "bg-red-100",
    text: "text-red-700",
    ring: "ring-red-300",
  },
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

// ── Main Page ───────────────────────────────────────────────────────

export default function OptimizationRunDetail() {
  const { runId } = useParams();
  const { userId: authUserId } = useAuth();
  const navigate = useNavigate();

  const [manualUserId, setManualUserId] = useState("");
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [previewText, setPreviewText] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const effectiveUserId = authUserId || manualUserId.trim();

  useEffect(() => {
    if (!effectiveUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getOptimizationRun(runId, effectiveUserId);
        if (!cancelled) setRun(res.data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load run");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, effectiveUserId]);

  const fetchArtifactText = async () => {
    if (previewText) return previewText;
    const text = await getOptimizationArtifact(runId, effectiveUserId);
    setPreviewText(text);
    return text;
  };

  const handlePreview = async () => {
    setDownloading(true);
    try {
      await fetchArtifactText();
      setShowPreview(true);
    } catch (err) {
      setError(err.message || "Failed to load preview");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const text = await fetchArtifactText();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `optimized-cv-${runId}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this run and its stored CV?")) return;
    try {
      await deleteOptimizationRun(runId, effectiveUserId);
      navigate("/cv/history");
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const data = run?.dashboardData;
  const hybridScore = data?.hybridScore;

  return (
    <PageLayout
      title="Run Detail"
      subtitle={run ? `v${run.versionTag}` : ""}
      showBack
    >
      {!authUserId && !effectiveUserId && (
        <Card className="p-4 mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            User ID
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Enter your userId"
              value={manualUserId}
              onChange={(e) => setManualUserId(e.target.value)}
            />
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        </div>
      )}

      {!loading && run && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? "Loading..." : "Download Optimized CV"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePreview}
              disabled={downloading}
            >
              Full Preview
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500 hover:bg-red-50 ml-auto"
              onClick={handleDelete}
            >
              Delete Run
            </Button>
          </div>

          {/* Meta */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400">Created</span>
                <p className="font-medium text-gray-700">
                  {new Date(run.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Version</span>
                <p className="font-medium text-gray-700">{run.versionTag}</p>
              </div>
            </div>
          </Card>

          {/* JD snippet */}
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Job Description
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">
              {run.jobDescriptionText}
            </p>
          </Card>

          {/* Score panel */}
          {hybridScore && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Match Score
              </h3>
              <div className="flex justify-center mb-5 relative">
                <ScoreRing
                  score={hybridScore.finalScore}
                  label="Overall"
                  size={100}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Hard Skills</span>
                    <span className="font-semibold">
                      {hybridScore.hardRuleDetails?.totalMatched}/
                      {hybridScore.hardRuleDetails?.totalRequired}
                    </span>
                  </div>
                  <Progress value={hybridScore.hardRuleScore} />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Semantic Match</span>
                    <span className="font-semibold">
                      {hybridScore.semanticScore}/100
                    </span>
                  </div>
                  <Progress value={hybridScore.semanticScore} />
                </div>
              </div>
            </Card>
          )}

          {/* Optimized bullets */}
          {data?.bullets?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Optimized Bullets ({data.bullets.length})
              </h3>
              {data.bullets.map((b, i) => (
                <Card key={b.id || i} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">
                      {b.role} @ {b.company}
                    </span>
                    <ConfidenceBadge
                      level={b.confidenceLevel}
                      score={b.confidenceScore}
                    />
                    {b.status && b.status !== "pending" && (
                      <Badge
                        className={
                          b.status === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : b.status === "edited"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-200 text-gray-600"
                        }
                      >
                        {b.status}
                      </Badge>
                    )}
                  </div>
                  <div className="mb-2">
                    <p className="text-[10px] uppercase text-gray-400 mb-0.5">
                      Original
                    </p>
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100">
                      {b.originalBullet}
                    </p>
                  </div>
                  <div className="mb-2">
                    <p className="text-[10px] uppercase text-blue-500 mb-0.5">
                      Optimized
                    </p>
                    <p className="text-sm text-gray-900 bg-blue-50/50 rounded-lg p-2 border border-blue-100">
                      {b.userEdit || b.optimizedBullet}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 italic">
                    {b.explanation}
                  </p>
                </Card>
              ))}
            </div>
          )}

          {/* Gaps */}
          {data?.gapsRemaining?.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Gaps Remaining
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.gapsRemaining.map((gap) => (
                  <span
                    key={gap}
                    className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
                  >
                    {gap}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* General advice */}
          {data?.generalAdvice && (
            <Card className="bg-blue-50/50 border-blue-200 p-4">
              <p className="text-xs font-semibold text-blue-600 mb-1">
                AI Advice
              </p>
              <p className="text-sm text-blue-900">{data.generalAdvice}</p>
            </Card>
          )}
        </div>
      )}

      {showPreview && previewText && (
        <PreviewModal
          text={previewText}
          onClose={() => setShowPreview(false)}
        />
      )}
    </PageLayout>
  );
}
