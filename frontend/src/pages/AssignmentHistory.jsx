import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { getAssignmentHistory, deleteAssignment } from "../services/api";

const PAGE_SIZE = 20;

const STATUS_STYLES = {
  completed: "bg-emerald-100 text-emerald-700",
  processing: "bg-blue-100 text-blue-700",
  scanning: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "In progress" },
  { value: "failed", label: "Failed" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "score", label: "Top score" },
];

function StatusBadge({ status }) {
  if (!status) return null;
  const color = STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
  return <Badge className={`${color} capitalize`}>{status}</Badge>;
}

function ScorePill({ score }) {
  if (score == null) return null;
  const color =
    score >= 70
      ? "bg-emerald-100 text-emerald-700"
      : score >= 50
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return <Badge className={color}>{score}%</Badge>;
}

function MetaBadge({ children }) {
  return (
    <Badge className="bg-slate-100 text-slate-600 font-normal">{children}</Badge>
  );
}

// Small +/- delta chip comparing a score to the chronologically previous one.
function DeltaBadge({ delta }) {
  if (delta == null) return null;
  if (delta === 0) {
    return <span className="text-[10px] font-semibold text-gray-400">no change</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`text-[10px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}
      title="Change vs your previous completed submission"
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}{delta}
    </span>
  );
}

// Dependency-free sparkline of scores over time (oldest → newest).
function Sparkline({ scores, width = 160, height = 36 }) {
  if (!scores || scores.length < 2) return null;
  const pad = 3;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (scores.length - 1);
  const points = scores.map((s, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (s - min) / span);
    return [x, y];
  });
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={path}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="3" fill="#2563eb" />
    </svg>
  );
}

function ProgressTrend({ chrono }) {
  const scores = chrono.map((c) => c.score);
  const latest = scores[scores.length - 1];
  const previous = scores[scores.length - 2];
  const best = Math.max(...scores);
  const delta = latest - previous;
  const up = delta > 0;

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Score Progress
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-blue-700">{latest}%</span>
            <span
              className={`text-sm font-semibold ${up ? "text-emerald-600" : delta === 0 ? "text-gray-400" : "text-rose-600"}`}
            >
              {delta === 0 ? "no change" : `${up ? "▲ +" : "▼ "}${delta} vs previous`}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Best {best}% · {chrono.length} completed submissions
          </p>
        </div>
        <Sparkline scores={scores} />
      </div>
    </Card>
  );
}

function fileNameFromKey(key) {
  if (!key) return "solution";
  const base = key.split("/").pop() || key;
  return base
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/^(requirement|solution)-/i, "");
}

function notesPreview(text) {
  if (!text) return null;
  return text.length > 140 ? text.slice(0, 140) + "..." : text;
}

function isInProgress(status) {
  return status === "pending" || status === "scanning" || status === "processing";
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="flex gap-2">
              <div className="h-5 w-20 rounded-full bg-gray-200" />
              <div className="h-5 w-12 rounded-full bg-gray-200" />
            </div>
            <div className="h-4 w-1/2 rounded bg-gray-200" />
            <div className="h-3 w-1/3 rounded bg-gray-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.querySelector("[data-autofocus]")?.focus();
    const onKey = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            data-autofocus
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Deleting..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AssignmentHistory() {
  const { userId: authUserId } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const navigate = useNavigate();

  const effectiveUserId = authUserId;

  const loadHistory = useCallback(
    async (targetPage = 0) => {
      if (!effectiveUserId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getAssignmentHistory(effectiveUserId, {
          limit: PAGE_SIZE,
          offset: targetPage * PAGE_SIZE,
        });
        setAssignments(res.assignments || []);
        setTotal(res.total ?? (res.assignments || []).length);
        setPage(targetPage);
      } catch (err) {
        setError(err.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    },
    [effectiveUserId]
  );

  useEffect(() => {
    if (effectiveUserId) loadHistory(0);
  }, [effectiveUserId, loadHistory]);

  const visibleAssignments = useMemo(() => {
    let list = assignments;
    if (statusFilter !== "all") {
      list = list.filter((a) =>
        statusFilter === "processing"
          ? isInProgress(a.status)
          : a.status === statusFilter
      );
    }
    const sorted = [...list];
    if (sortBy === "score") {
      sorted.sort((a, b) => (b.aiFeedback?.score ?? -1) - (a.aiFeedback?.score ?? -1));
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [assignments, statusFilter, sortBy]);

  // Chronological trend of completed submissions (oldest → newest) from the
  // loaded page, plus a per-assignment delta vs the previous completed score.
  const { chrono, deltaById } = useMemo(() => {
    const completed = assignments
      .filter((a) => a.status === "completed" && typeof a.aiFeedback?.score === "number")
      .map((a) => ({ id: a.id, score: a.aiFeedback.score, createdAt: a.createdAt }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const deltas = {};
    completed.forEach((c, i) => {
      deltas[c.id] = i === 0 ? null : c.score - completed[i - 1].score;
    });

    return { chrono: completed, deltaById: deltas };
  }, [assignments]);

  const handleView = (assignment) => {
    if (assignment.status === "completed") {
      navigate(`/assignment/${assignment.id}/results`);
    } else {
      navigate(`/assignment/${assignment.id}/processing`);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteAssignment(pendingDeleteId, effectiveUserId);
      const remaining = assignments.length - 1;
      setPendingDeleteId(null);
      // If we just emptied a non-first page, step back; otherwise refresh the
      // current page so it backfills from the server and totals stay accurate.
      if (remaining <= 0 && page > 0) {
        await loadHistory(page - 1);
      } else {
        await loadHistory(page);
      }
    } catch (err) {
      setError(err.message || "Delete failed");
      setPendingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + assignments.length;

  return (
    <PageLayout
      title="Assignment History"
      subtitle="Your past submissions"
      showBack
      backTo="/assignment"
    >
      {effectiveUserId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  statusFilter === f.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                ].join(" ")}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadHistory(page)}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {!loading && chrono.length >= 2 && <ProgressTrend chrono={chrono} />}

      {loading && <HistorySkeleton />}

      {!loading && assignments.length === 0 && effectiveUserId && (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">No submissions yet.</p>
          <Button size="sm" onClick={() => navigate("/assignment")}>
            Submit your first assignment
          </Button>
        </Card>
      )}

      {!loading && assignments.length > 0 && visibleAssignments.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">
            No submissions match this filter.
          </p>
        </Card>
      )}

      {!loading && visibleAssignments.length > 0 && (
        <>
          <div className="space-y-3">
            {visibleAssignments.map((assignment) => {
              const score = assignment.aiFeedback?.score;
              const meta = assignment.metadata || {};
              const frameworks = (meta.detectedFrameworks || []).slice(0, 2);
              return (
                <Card
                  key={assignment.id}
                  className="p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <StatusBadge status={assignment.status} />
                        <ScorePill score={score} />
                        {assignment.aiFeedback?.grade && (
                          <span className="text-[10px] font-semibold text-gray-500">
                            {assignment.aiFeedback.grade}
                          </span>
                        )}
                        {assignment.status === "completed" && (
                          <DeltaBadge delta={deltaById[assignment.id]} />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {fileNameFromKey(assignment.solutionFileKey)}
                      </p>
                      {(meta.detectedLanguage ||
                        frameworks.length > 0 ||
                        meta.totalFiles) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {meta.detectedLanguage && (
                            <MetaBadge>{meta.detectedLanguage}</MetaBadge>
                          )}
                          {frameworks.map((fw) => (
                            <MetaBadge key={fw}>{fw}</MetaBadge>
                          ))}
                          {meta.totalFiles ? (
                            <MetaBadge>{meta.totalFiles} files</MetaBadge>
                          ) : null}
                        </div>
                      )}
                      {notesPreview(assignment.userNotes) && (
                        <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                          {notesPreview(assignment.userNotes)}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(assignment.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleView(assignment)}
                      >
                        View
                      </Button>
                      {assignment.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("/assignment")}
                        >
                          Resubmit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50"
                        onClick={() => setPendingDeleteId(assignment.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-500">
                Showing {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 0}
                  onClick={() => loadHistory(page - 1)}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => loadHistory(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete submission"
          message="This will permanently delete this submission and its stored files. This action cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => !deleting && setPendingDeleteId(null)}
        />
      )}
    </PageLayout>
  );
}
