import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { getInterviewStatus, processInterview } from "../services/api";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 80; // ~4 minutes

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Combined stage from processingStatus + insightsStatus
function resolveStage(processingStatus, insightsStatus) {
  if (insightsStatus === "completed") return "insights_ready";
  if (insightsStatus === "analyzing") return "analyzing";
  if (insightsStatus === "failed")    return "failed";

  switch (processingStatus) {
    case "queued":           return "queued";
    case "downloading":      return "downloading";
    case "extracting_audio": return "extracting_audio";
    case "transcribing":     return "transcribing";
    // Transcription done, Gemini is about to start (or already set to 'analyzing'
    // but the next poll hasn't fired yet). Show "Analyzing interview" rather than
    // "Preparing interview" to avoid confusing regression in the progress bar.
    case "completed":        return "analyzing";
    case "failed":           return "failed";
    default:                 return "queued";
  }
}

function stageLabel(stage) {
  switch (stage) {
    case "queued":          return "Preparing interview";
    case "downloading":     return "Downloading media";
    case "extracting_audio": return "Extracting audio";
    case "transcribing":    return "Transcribing speech";
    case "analyzing":       return "Analyzing interview";
    case "insights_ready":  return "Insights ready";
    case "failed":          return "Processing failed";
    default:                return "Preparing interview";
  }
}

function stageProgress(stage, attempt) {
  switch (stage) {
    case "queued":          return 10;
    case "downloading":     return 25;
    case "extracting_audio": return 38;
    case "transcribing":    return 55;
    case "analyzing":       return 78;
    case "insights_ready":  return 100;
    case "failed":          return 100;
    default:
      return Math.min(95, Math.max(10, Math.round((attempt / MAX_POLL_ATTEMPTS) * 100)));
  }
}

const TERMINAL_STAGES = new Set(["insights_ready", "failed"]);

export default function InterviewProcessing() {
  const { id: interviewId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState("queued");
  const [errorMessage, setErrorMessage] = useState("");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!interviewId) {
      // Defer so we're not calling setState synchronously inside the effect body
      Promise.resolve().then(() => {
        if (!cancelled) setErrorMessage("Interview ID is missing. Please upload a new recording.");
      });
      return () => { cancelled = true; };
    }

    async function pollStatus() {
      for (let i = 1; i <= MAX_POLL_ATTEMPTS; i++) {
        if (cancelled) return;

        try {
          const data = await getInterviewStatus(interviewId, userId);
          const resolved = resolveStage(
            data?.processingStatus ?? "queued",
            data?.insightsStatus  ?? "not_started"
          );

          if (cancelled) return;
          setAttempt(i);
          setStage(resolved);

          if (resolved === "insights_ready") {
            navigate(`/interview/${interviewId}/insights`, { replace: true });
            return;
          }

          if (resolved === "failed") {
            setErrorMessage(
              "Processing encountered an error. You can retry or upload a new recording."
            );
            return;
          }
        } catch (err) {
          if (cancelled) return;
          setErrorMessage(err?.message || "Could not reach the server. Check your connection.");
          return;
        }

        await wait(POLL_INTERVAL_MS);
      }

      if (!cancelled) {
        setErrorMessage(
          "Processing is taking longer than expected. Refresh this page to check again."
        );
      }
    }

    pollStatus();
    return () => { cancelled = true; };
  }, [interviewId, userId, navigate]);

  async function handleRetry() {
    if (!interviewId || retrying) return;
    setRetrying(true);
    setErrorMessage("");
    try {
      await processInterview(interviewId, userId);
      // Re-mount by navigating to self
      navigate(0);
    } catch (err) {
      setErrorMessage(err?.message || "Retry failed. Please try again.");
      setRetrying(false);
    }
  }

  const progressPercent = useMemo(
    () => stageProgress(stage, attempt),
    [stage, attempt]
  );

  const isFailed = stage === "failed";

  return (
    <PageLayout
      title="Interview Practice"
      subtitle="Analyzing your recording"
      showBack
    >
      <Card className="p-6">
        {!isFailed ? (
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        ) : (
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-600">
            ✕
          </div>
        )}

        <h2 className="text-center text-lg font-semibold text-gray-900">
          {isFailed ? "Something went wrong" : "Working on your insights"}
        </h2>

        <p className="mt-2 text-center text-sm text-gray-600">
          {stageLabel(stage)}{!TERMINAL_STAGES.has(stage) ? "…" : ""}
        </p>

        {!isFailed ? (
          <>
            <div className="mt-5 h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-gray-500">
              This usually takes 30–120 seconds
            </p>
          </>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/interview")}>
            Upload Another
          </Button>
          {isFailed ? (
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry Processing"}
            </Button>
          ) : (
            <Button
              onClick={() => interviewId && navigate(`/interview/${interviewId}/insights`)}
              disabled={!interviewId || stage !== "insights_ready"}
            >
              View Insights
            </Button>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
