import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { getAssignment, getAssignmentResults, retryAssignment } from "../services/api";

function getScoreTone(score) {
  if (score >= 85) {
    return {
      label: "Excellent Performance",
      badgeClass: "bg-blue-600 text-white",
      ringClass: "ring-blue-200",
    };
  }

  if (score >= 70) {
    return {
      label: "Good Work",
      badgeClass: "bg-emerald-600 text-white",
      ringClass: "ring-emerald-200",
    };
  }

  if (score >= 50) {
    return {
      label: "Needs Improvement",
      badgeClass: "bg-amber-600 text-white",
      ringClass: "ring-amber-200",
    };
  }

  return {
    label: "Requires Attention",
    badgeClass: "bg-rose-600 text-white",
    ringClass: "ring-rose-200",
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function stripLeadingUuids(fileName) {
  if (!fileName) return fileName;

  const uuidPattern = '(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-)';
  const leadingUuidsRegex = new RegExp(`^(?:${uuidPattern})+`, 'i');
  return fileName.replace(leadingUuidsRegex, '');
}

function prettifyFileName(fileName) {
  if (!fileName) return 'Not provided';

  const withoutUuids = stripLeadingUuids(fileName);
  const withoutKnownPrefixes = withoutUuids
    .replace(/^requirement-/i, '')
    .replace(/^solution-/i, '');

  return withoutKnownPrefixes || withoutUuids || fileName;
}

function fileNameFromKey(key) {
  if (!key || typeof key !== "string") return "Not provided";
  const parts = key.split("/");
  const fileName = parts[parts.length - 1] || key;
  return prettifyFileName(fileName);
}

function ReadinessMetric({ label, score, toneClass }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className={"text-sm font-bold " + toneClass}>{score}%</p>
      </div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

function ScoreRing({ score, label, size = 104 }) {
  const normalizedScore = clampScore(score);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedScore / 100) * circumference;
  const colorClass =
    normalizedScore >= 70 ? "text-emerald-500" : normalizedScore >= 50 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="relative flex flex-col items-center gap-1">
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
          className={colorClass}
        />
      </svg>
      <span className="absolute top-8 text-2xl font-bold text-gray-900">{normalizedScore}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function ListSection({ title, subtitle, toneClass, icon, items }) {
  return (
    <Card className={["p-4", toneClass].join(" ")}>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-gray-600">{subtitle}</p> : null}
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <div key={`${title}-${idx}`} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-800">
              <span className="mr-2 font-semibold text-gray-500">{icon}</span>
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-700">No items to show.</div>
        )}
      </div>
    </Card>
  );
}

export default function AssignmentResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      if (!id) {
        setError("Assignment ID is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [resultsRes, assignmentRes] = await Promise.all([
          getAssignmentResults(id, "summary"),
          getAssignment(id),
        ]);

        if (cancelled) return;

        setResults(resultsRes?.results || null);
        setAssignment(assignmentRes?.assignment || null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to load assignment results.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const viewModel = useMemo(() => {
    if (!results) return null;

    const score = Number(results.overallScore || 0);
    const tone = getScoreTone(score);

    const strengths = safeArray(results.feedback?.codeQuality?.highlights);

    if (results.feedback?.functionality?.meetsRequirements) {
      strengths.unshift("Core assignment requirements appear to be met.");
    }

    const improvements = [
      ...safeArray(results.feedback?.codeQuality?.improvements),
      ...safeArray(results.feedback?.functionality?.missingFeatures),
    ];

    const recommendations = safeArray(results.feedback?.bestPractices?.recommendations);

    return {
      score,
      grade: results.overallGrade || "-",
      summary: results.feedback?.summary || "Summary unavailable.",
      tone,
      readiness: {
        overall: clampScore(results.overallScore),
        codeQuality: clampScore(results.feedback?.codeQuality?.score),
        functionality: clampScore(results.feedback?.functionality?.score),
        bestPractices: clampScore(results.feedback?.bestPractices?.score),
      },
      strengths,
      improvements,
      recommendations,
      metadata: {
        language: results.metadata?.language || "Unknown",
        frameworks: safeArray(results.metadata?.frameworks),
        analysisDate: results.metadata?.analysisDate,
      },
    };
  }, [results]);

  if (loading) {
    return (
      <PageLayout title="Technical Assignment" subtitle="Loading your analysis" showBack>
        <Card className="p-6">
          <p className="text-sm text-gray-600">Fetching your results...</p>
        </Card>
      </PageLayout>
    );
  }

  if (error || !viewModel) {
    const failedAssignment = assignment?.status === "failed" ? assignment : null;

    async function handleRetry() {
      if (!id || !userId) return;
      try {
        setActionBusy(true);
        await retryAssignment(id, userId);
        navigate(`/assignment/${id}/processing`, { replace: true });
      } catch (err) {
        setError(err?.message || "Retry failed.");
      } finally {
        setActionBusy(false);
      }
    }

    return (
      <PageLayout title="Technical Assignment" subtitle="Results unavailable" showBack>
        <Card className="p-6">
          <p className="text-sm text-red-600">{error || "Could not load results."}</p>

          {failedAssignment ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" disabled={actionBusy || !failedAssignment.canRetry} onClick={handleRetry}>
                {actionBusy ? "Retrying..." : "Retry"}
              </Button>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate("/assignment")}>Submit Another</Button>
            <Button variant="outline" onClick={() => navigate("/profile")}>Return to Profile</Button>
          </div>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Technical Assignment"
      subtitle="Upload your completed homework for review"
      showBack
      right={<Button size="sm" variant="outline" onClick={() => navigate("/assignment/history")}>History</Button>}
    >
      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Score Breakdown</h3>

          <div className="mb-6 flex justify-center">
            <ScoreRing score={viewModel.readiness.overall} label="Overall Readiness" size={110} />
          </div>

          <div className="space-y-3">
            <ReadinessMetric label="Code Quality" score={viewModel.readiness.codeQuality} toneClass="text-blue-700" />
            <ReadinessMetric label="Functionality" score={viewModel.readiness.functionality} toneClass="text-emerald-700" />
            <ReadinessMetric label="Best Practices" score={viewModel.readiness.bestPractices} toneClass="text-amber-700" />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-base font-semibold text-gray-900">Submission Summary</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">Assignment File</p>
              <p className="truncate text-sm font-medium text-gray-800" title={fileNameFromKey(assignment?.requirementsFileKey)}>
                {fileNameFromKey(assignment?.requirementsFileKey)}
              </p>
            </div>
            <div className="rounded-lg border bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">Solution File</p>
              <p className="truncate text-sm font-medium text-gray-800" title={fileNameFromKey(assignment?.solutionFileKey)}>
                {fileNameFromKey(assignment?.solutionFileKey)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-600">{viewModel.summary}</p>
        </Card>

        <ListSection
          title="What You Did Well"
          subtitle={`${viewModel.strengths.length} strengths identified`}
          toneClass="border-emerald-400 bg-emerald-50"
          icon="✓"
          items={viewModel.strengths}
        />

        <ListSection
          title="Areas for Improvement"
          subtitle={`${viewModel.improvements.length} opportunities to improve`}
          toneClass="border-orange-400 bg-orange-50"
          icon="!"
          items={viewModel.improvements}
        />

        <ListSection
          title="Recommendations & Next Steps"
          subtitle="Actionable resources to level up your code"
          toneClass="border-amber-400 bg-amber-50"
          icon="→"
          items={viewModel.recommendations}
        />

        <Card className="p-4">
          <h4 className="text-sm font-semibold text-gray-900">Technical Details</h4>
          <p className="mt-2 text-xs text-gray-600">Language: {viewModel.metadata.language}</p>
          <p className="mt-1 text-xs text-gray-600">
            Frameworks: {viewModel.metadata.frameworks.length ? viewModel.metadata.frameworks.join(", ") : "None detected"}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Analysis time: {viewModel.metadata.analysisDate ? new Date(viewModel.metadata.analysisDate).toLocaleString() : "Unknown"}
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/assignment")}>Submit Another</Button>
          <Button onClick={() => navigate("/profile")}>Return to Profile</Button>
        </div>
      </div>
    </PageLayout>
  );
}
