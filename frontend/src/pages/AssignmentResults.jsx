import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { getAssignment, getAssignmentResults, reanalyzeAssignment, retryAssignment } from "../services/api";

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

function splitRequirementText(requirement) {
  const text = String(requirement || "").trim();
  if (!text) {
    return { title: "Requirement", detail: "" };
  }

  const parentheticalMatches = [...text.matchAll(/\(([^()]+)\)/g)].map((match) => match[1].trim()).filter(Boolean);
  const title = text.replace(/\s*\([^()]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return {
    title: title || text,
    detail: parentheticalMatches.join(" • "),
  };
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function extractRequirementsFromText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter((line) => line.length >= 8);

  const deduped = [];
  const seen = new Set();
  for (const line of lines) {
    const key = normalizeText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }

  if (deduped.length <= 1) {
    const sentenceChunks = text
      .split(/[.;]\s+|\n+|\s+-\s+|\s+—\s+|\s+while\s+|\s+but\s+|\s+however\s+/i)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 16);

    const sentenceUnique = [];
    const sentenceSeen = new Set();
    for (const chunk of sentenceChunks) {
      const key = normalizeText(chunk);
      if (!key || sentenceSeen.has(key)) continue;
      sentenceSeen.add(key);
      sentenceUnique.push(chunk);
    }
    if (sentenceUnique.length > 1) {
      return sentenceUnique.slice(0, 12);
    }

    const clauseChunks = text
      .split(/\s+(?:and|plus|including|along with|together with)\s+/i)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 16);

    const clauseUnique = [];
    const clauseSeen = new Set();
    for (const chunk of clauseChunks) {
      const key = normalizeText(chunk);
      if (!key || clauseSeen.has(key)) continue;
      clauseSeen.add(key);
      clauseUnique.push(chunk);
    }

    return clauseUnique.slice(0, 12);
  }

  return deduped.slice(0, 20);
}

function evaluateRequirementCoverage(requirement, missingFeatures, meetsRequirements) {
  const requirementTokens = tokenize(requirement);

  const overlapWithMissing = missingFeatures.some((missingFeature) => {
    const missingTokens = tokenize(missingFeature);
    if (missingTokens.length === 0 || requirementTokens.length === 0) return false;

    const overlap = missingTokens.filter((token) => requirementTokens.includes(token));
    return overlap.length >= 1;
  });

  if (overlapWithMissing) {
    return {
      status: "gap",
      note: "Potentially not satisfied based on detected missing features.",
    };
  }

  if (meetsRequirements) {
    return {
      status: "covered",
      note: "Likely covered by the submitted solution.",
    };
  }

  return {
    status: "unknown",
    note: "No direct evidence either way from current AI feedback.",
  };
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

function RequirementMappingSection({ items }) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      { covered: 0, gap: 0, unknown: 0 }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.status === filter);
  }, [items, filter]);

  const tone = {
    covered: "bg-emerald-100 text-emerald-700",
    gap: "bg-rose-100 text-rose-700",
    unknown: "bg-amber-100 text-amber-700",
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Requirement Coverage</h3>
          <p className="text-xs text-gray-600">Interactive breakdown of extracted requirements</p>
        </div>
        <Badge className="bg-blue-100 text-blue-700">{items.length} items</Badge>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          All ({items.length})
        </Button>
        <Button size="sm" variant={filter === "covered" ? "default" : "outline"} onClick={() => setFilter("covered")}>
          Covered ({counts.covered})
        </Button>
        <Button size="sm" variant={filter === "gap" ? "default" : "outline"} onClick={() => setFilter("gap")}>
          Gaps ({counts.gap})
        </Button>
        <Button size="sm" variant={filter === "unknown" ? "default" : "outline"} onClick={() => setFilter("unknown")}>
          Unclear ({counts.unknown})
        </Button>
      </div>

      <div className="space-y-2">
        {filteredItems.length > 0 ? (
          filteredItems.map((item, idx) => {
            const statusLabel = item.status === "covered" ? "Covered" : item.status === "gap" ? "Gap" : "Unclear";
            const requirementParts = splitRequirementText(item.requirement);

            return (
              <div key={`${item.requirement}-${idx}`} className="rounded-lg border bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-900">{requirementParts.title}</p>
                    {requirementParts.detail ? (
                      <p className="mt-1 text-xs text-gray-500">{requirementParts.detail}</p>
                    ) : null}
                  </div>
                  <Badge className={tone[item.status]}>{statusLabel}</Badge>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
            No requirements in this filter.
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AssignmentResults() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const backTo = location.state?.from === "history" ? "/assignment/history" : "/assignment";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const requestUserId = userId || assignment?.userId;

  async function handleReanalyze() {
    if (!id || !requestUserId) return;

    try {
      setActionBusy(true);
      await reanalyzeAssignment(id, requestUserId);
      navigate(`/assignment/${id}/processing`, { replace: true });
    } catch (err) {
      setError(err?.message || "Re-analysis failed.");
    } finally {
      setActionBusy(false);
    }
  }

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

    const extractedRequirements = extractRequirementsFromText(assignment?.metadata?.requirements);
    const missingFeatures = safeArray(results.feedback?.functionality?.missingFeatures);
    const meetsRequirements = Boolean(results.feedback?.functionality?.meetsRequirements);

    const requirementCoverage = extractedRequirements.map((requirement) => {
      const coverage = evaluateRequirementCoverage(requirement, missingFeatures, meetsRequirements);
      return {
        requirement,
        status: coverage.status,
        note: coverage.note,
        source: "Parsed from assignment requirements text",
      };
    });

    if (requirementCoverage.length === 0 && missingFeatures.length > 0) {
      missingFeatures.forEach((feature) => {
        requirementCoverage.push({
          requirement: feature,
          status: "gap",
          note: "",
          source: "AI missing-features analysis",
        });
      });
    }

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
      requirementCoverage,
      metadata: {
        language: results.metadata?.language || "Unknown",
        frameworks: safeArray(results.metadata?.frameworks),
        analysisDate: results.metadata?.analysisDate,
      },
    };
  }, [results, assignment]);

  if (loading) {
    return (
      <PageLayout title="Technical Assignment" subtitle="Loading your analysis" showBack backTo={backTo}>
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
      <PageLayout title="Technical Assignment" subtitle="Results unavailable" showBack backTo={backTo}>
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
      backTo={backTo}
      right={<Button size="sm" variant="outline" onClick={() => navigate("/assignment/history")}>History</Button>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          {viewModel.requirementCoverage.length > 0 ? (
            <RequirementMappingSection items={viewModel.requirementCoverage} />
          ) : null}

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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => navigate("/assignment")}>Submit Another</Button>
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={actionBusy || !id || !requestUserId || assignment?.canReanalyze === false}
            >
              {actionBusy ? "Re-analyzing..." : "Re-analyze"}
            </Button>
            <Button onClick={() => navigate("/profile")}>Return to Profile</Button>
          </div>
        </div>

        <div className="order-1 space-y-4 lg:order-2 lg:col-span-1">
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
            <div className="mt-3 grid grid-cols-1 gap-2">
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
        </div>
      </div>
    </PageLayout>
  );
}
