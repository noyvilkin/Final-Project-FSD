import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { getAssignment, getAssignmentResults } from "../services/api";

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

function fileNameFromKey(key) {
  if (!key || typeof key !== "string") return "Not provided";
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [assignment, setAssignment] = useState(null);

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
    return (
      <PageLayout title="Technical Assignment" subtitle="Results unavailable" showBack>
        <Card className="p-6">
          <p className="text-sm text-red-600">{error || "Could not load results."}</p>
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
    >
      <div className="space-y-4">
        <Card className={["p-5 ring-1", viewModel.tone.ringClass].join(" ")}>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overall Score</p>
            <p className="mt-1 text-5xl font-bold text-blue-700">{viewModel.score}%</p>
            <div className="mt-2">
              <Badge className={viewModel.tone.badgeClass}>{viewModel.tone.label}</Badge>
            </div>
          </div>
          <Progress value={viewModel.score} className="mt-4" />
          <p className="mt-2 text-center text-xs text-gray-600">Grade: {viewModel.grade}</p>
        </Card>

        <Card className="p-4">
          <h3 className="text-base font-semibold text-gray-900">Submission Summary</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">Assignment File</p>
              <p className="truncate text-sm text-gray-800">
                {fileNameFromKey(assignment?.requirementsFileKey)}
              </p>
            </div>
            <div className="rounded-lg border bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">Solution File</p>
              <p className="truncate text-sm text-gray-800">{fileNameFromKey(assignment?.solutionFileKey)}</p>
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
