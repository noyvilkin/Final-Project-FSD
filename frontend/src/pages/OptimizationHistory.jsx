import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import {
  getOptimizationHistory,
  deleteOptimizationRun,
} from "../services/api";

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

export default function OptimizationHistory() {
  const { userId: authUserId } = useAuth();
  const [searchParams] = useSearchParams();
  const urlUserId = searchParams.get("userId") || "";
  const [manualUserId, setManualUserId] = useState(urlUserId);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const effectiveUserId = authUserId || manualUserId.trim();

  const loadHistory = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOptimizationHistory(effectiveUserId);
      setRuns(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (effectiveUserId) loadHistory();
  }, [effectiveUserId, loadHistory]);

  const handleDelete = async (runId) => {
    if (!confirm("Delete this optimization run and its stored CV?")) return;
    try {
      await deleteOptimizationRun(runId, effectiveUserId);
      setRuns((prev) => prev.filter((r) => r._id !== runId));
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const jdPreview = (text) => {
    if (!text) return "—";
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  };

  return (
    <PageLayout
      title="Optimization History"
      subtitle="Past CV optimization runs"
      showBack
    >
      {!authUserId && (
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
            <Button size="sm" onClick={loadHistory} disabled={!manualUserId.trim()}>
              Load
            </Button>
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

      {!loading && runs.length === 0 && effectiveUserId && (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            No optimization runs yet.
          </p>
          <Button size="sm" onClick={() => navigate("/cv")}>
            Start your first optimization
          </Button>
        </Card>
      )}

      {!loading && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => {
            const score = run.dashboardData?.hybridScore?.finalScore;
            return (
              <Card key={run._id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ScorePill score={score} />
                      <span className="text-[10px] text-gray-400">
                        v{run.versionTag}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {jdPreview(run.jobDescriptionText)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/cv/history/${run._id}?userId=${encodeURIComponent(effectiveUserId)}`)}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:bg-red-50"
                      onClick={() => handleDelete(run._id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
