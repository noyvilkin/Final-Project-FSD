import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { getAssignment, getUserAssignments, retryAssignment } from "../services/api";

const LOCAL_ASSIGNMENT_HISTORY_KEY = "assignment.history.ids";

function getLocalAssignmentIds() {
  try {
    const raw = localStorage.getItem(LOCAL_ASSIGNMENT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && id.trim());
  } catch {
    return [];
  }
}

function scoreFromAssignment(assignment) {
  return assignment?.aiFeedback?.overall?.score ?? assignment?.results?.overallScore ?? null;
}

function statusTone(status) {
  switch (status) {
    case "completed":
      return "bg-emerald-600 text-white";
    case "failed":
      return "bg-rose-600 text-white";
    case "processing":
    case "scanning":
      return "bg-amber-600 text-white";
    default:
      return "bg-gray-600 text-white";
  }
}

function statusLabel(status) {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    case "scanning":
      return "Scanning";
    case "pending":
      return "Pending";
    default:
      return "Unknown";
  }
}

export default function AssignmentHistory() {
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [actionBusyId, setActionBusyId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        setLoading(true);
        setError("");

        if (userId) {
          const res = await getUserAssignments(userId, { limit: 30, offset: 0 });
          if (cancelled) return;
          setItems(Array.isArray(res?.assignments) ? res.assignments : []);
          return;
        }

        // Temporary fallback until auth is fully wired: build history from locally tracked assignment IDs.
        const localIds = getLocalAssignmentIds();
        if (localIds.length === 0) {
          if (!cancelled) {
            setItems([]);
            setError("No user session found. Showing local history only.");
          }
          return;
        }

        const responses = await Promise.allSettled(localIds.map((assignmentId) => getAssignment(assignmentId)));
        if (cancelled) return;

        const localAssignments = responses
          .filter((result) => result.status === "fulfilled" && result.value?.assignment)
          .map((result) => result.value.assignment);

        setItems(localAssignments);
        setError("No user session found. Showing local history only.");
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to load assignment history.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [items]);

  async function handleRetry(id) {
    if (!userId) {
      setError("Retry is temporarily unavailable without user session context.");
      return;
    }
    try {
      setActionBusyId(id);
      await retryAssignment(id, userId);
      navigate(`/assignment/${id}/processing`);
    } catch (err) {
      setError(err?.message || "Retry failed.");
    } finally {
      setActionBusyId("");
    }
  }

  return (
    <PageLayout title="Assignment History" subtitle="Past submissions and recovery actions" showBack>
      <div className="space-y-3">
        {loading ? (
          <Card className="p-4 text-sm text-gray-600">Loading submissions...</Card>
        ) : null}

        {error ? (
          <Card className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
        ) : null}

        {!loading && !error && sortedItems.length === 0 ? (
          <Card className="p-4 text-sm text-gray-600">No assignment submissions yet.</Card>
        ) : null}

        {sortedItems.map((item, index) => {
          const score = scoreFromAssignment(item);
          const failed = item.status === "failed";
          const busy = actionBusyId === String(item.id);

          return (
            <Card key={item.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Submission #{index + 1}</p>
                  <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <Badge className={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
                <div className="rounded border bg-gray-50 px-2 py-2">
                  Score: {score ?? "-"}
                </div>
                <div className="rounded border bg-gray-50 px-2 py-2">
                  Last update: {new Date(item.updatedAt).toLocaleString()}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === "completed" ? (
                  <Button size="sm" onClick={() => navigate(`/assignment/${item.id}/results`)}>
                    View Results
                  </Button>
                ) : null}

                {failed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !item.canRetry}
                    onClick={() => handleRetry(item.id)}
                  >
                    {busy ? "Retrying..." : "Retry"}
                  </Button>
                ) : null}
              </div>

              {failed && !item.canRetry ? (
                <p className="mt-2 text-xs text-gray-600">Retry is currently unavailable for this submission.</p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </PageLayout>
  );
}
