import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { getInterviewHistory } from "../services/api";

const STATUS_CONFIG = {
  not_analyzed: { label: "Not Analyzed", color: "bg-gray-100 text-gray-600" },
  transcribing: { label: "Transcribing", color: "bg-blue-100 text-blue-700" },
  analyzing: { label: "Analyzing", color: "bg-purple-100 text-purple-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-600" },
};

const ACTIVE_PROCESSING_STATUSES = [
  "queued",
  "downloading",
  "extracting_audio",
  "transcribing",
];

// Derives a single display status from the two independent status fields the
// API actually returns (processingStatus covers upload -> transcription,
// insightsStatus covers the separate LLM analysis stage that runs after).
// An interview saved without ever triggering analysis sits at
// processingStatus "uploaded" / insightsStatus "not_started" — that's
// "not_analyzed", distinct from a pipeline that's actively running.
function deriveStatus(item) {
  if (item.processingStatus === "failed" || item.insightsStatus === "failed") {
    return "failed";
  }
  if (item.insightsStatus === "completed") return "completed";
  if (item.insightsStatus === "analyzing") return "analyzing";
  // Transcription just finished and insight analysis is about to start (or
  // is already running but the next poll hasn't landed yet). Matches
  // InterviewProcessing's resolveStage — without this, this window briefly
  // shows "Not Analyzed" and routes to the player's "Analyze Now" button,
  // risking a duplicate /process trigger.
  if (item.processingStatus === "completed") return "analyzing";
  if (ACTIVE_PROCESSING_STATUSES.includes(item.processingStatus)) return "transcribing";
  return "not_analyzed";
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

export default function InterviewHistory() {
  const { userId: authUserId } = useAuth();
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!authUserId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getInterviewHistory(authUserId);
      setInterviews(res.interviews || res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load interview history");
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <PageLayout
      title="Interview History"
      subtitle="Your past interview analyses"
      showBack
    >
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

      {!loading && interviews.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-3">
            No interviews yet.
          </p>
          <Button size="sm" onClick={() => navigate("/interview")}>
            Upload your first interview
          </Button>
        </Card>
      )}

      {!loading && interviews.length > 0 && (
        <div className="space-y-3">
          {interviews.map((item) => {
            const status = deriveStatus(item);
            const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_analyzed;
            // Always land on the player — it fetches the interview's status
            // itself and redirects to the progress tracker when a pipeline is
            // actively running, so this list doesn't need to duplicate that
            // decision (and failed interviews reach the player's own
            // retry banner instead of a second, separate failure screen).
            const destination = `/interview/${item.id}`;

            return (
              <Card
                key={item.id}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(destination)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge className={statusCfg.color}>
                        {statusCfg.label}
                      </Badge>
                      <ScorePill score={item.confidenceScore} />
                      <Badge className="bg-gray-100 text-gray-600">
                        {item.mediaType === "video" ? "Video" : "Audio"}
                      </Badge>
                      {(item.jobTitle || item.company) && (
                        <span className="text-xs text-gray-500 truncate">
                          {[item.jobTitle, item.company].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(destination);
                    }}
                  >
                    View
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
