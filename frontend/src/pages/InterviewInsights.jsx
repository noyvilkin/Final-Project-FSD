import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import StarAnalysisSection from "../components/interview/StarAnalysisSection";
import MetricsSection from "../components/interview/MetricsSection";
import TranscriptSection from "../components/interview/TranscriptSection";
import {
  getInterviewInsights,
  getInterviewTranscript,
  processInterview,
} from "../services/api";

function overallScoreTone(score) {
  if (score >= 80) return { label: "Strong Answer", cls: "bg-emerald-600 text-white", ring: "ring-emerald-200" };
  if (score >= 60) return { label: "Solid Foundation", cls: "bg-blue-600 text-white", ring: "ring-blue-200" };
  if (score >= 40) return { label: "Needs Improvement", cls: "bg-amber-500 text-white", ring: "ring-amber-200" };
  return { label: "Keep Practising", cls: "bg-rose-600 text-white", ring: "ring-rose-200" };
}

export default function InterviewInsights() {
  const { id: interviewId } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [segments, setSegments] = useState([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!interviewId) {
        setError("Interview ID is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [insightsRes, transcriptRes] = await Promise.allSettled([
          getInterviewInsights(interviewId, userId),
          getInterviewTranscript(interviewId, userId),
        ]);

        if (cancelled) return;

        if (insightsRes.status === "fulfilled") {
          setInsights(insightsRes.value || null);
        } else {
          const msg = insightsRes.reason?.message || "Could not load insights.";
          // 400 = not ready yet, treat as missing rather than hard error
          if (insightsRes.reason?.status !== 400) {
            setError(msg);
          }
        }

        if (transcriptRes.status === "fulfilled") {
          setTranscript(transcriptRes.value?.transcript || null);
          setSegments(transcriptRes.value?.transcriptSegments || []);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load interview results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [interviewId, userId]);

  async function handleRetry() {
    if (!interviewId || retrying) return;
    setRetrying(true);
    setError("");
    try {
      await processInterview(interviewId, userId);
      navigate(`/interview/${interviewId}/processing`, { replace: true });
    } catch (err) {
      setError(err?.message || "Retry failed. Please try again.");
      setRetrying(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageLayout title="Interview Practice" subtitle="Loading your insights" showBack>
        <Card className="p-6">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="text-center text-sm text-gray-600">Fetching your results…</p>
        </Card>
      </PageLayout>
    );
  }

  // ── Hard error ───────────────────────────────────────────────────────────

  if (error && !insights) {
    return (
      <PageLayout title="Interview Practice" subtitle="Results unavailable" showBack>
        <Card className="p-6">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => navigate("/interview")}>Upload New</Button>
            <Button onClick={handleRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry Processing"}
            </Button>
          </div>
        </Card>
      </PageLayout>
    );
  }

  // ── No insights yet ──────────────────────────────────────────────────────

  if (!insights) {
    return (
      <PageLayout title="Interview Practice" subtitle="Results not ready" showBack>
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-700">
            Your insights are not ready yet. Processing may still be in progress.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/interview/${interviewId}/processing`)}>
              Check Status
            </Button>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        </Card>
      </PageLayout>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────

  const overallScore = insights.confidenceScore ?? 0;
  const tone = overallScoreTone(overallScore);

  return (
    <PageLayout
      title="Interview Practice"
      subtitle="Your coaching feedback"
      showBack
    >
      <div className="space-y-4">
        {/* Overall score card */}
        <Card className={["p-5 ring-1", tone.ring].join(" ")}>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Confidence Score
            </p>
            <p className="mt-1 text-5xl font-bold text-blue-700">{overallScore}</p>
            <div className="mt-2">
              <Badge className={tone.cls}>{tone.label}</Badge>
            </div>
          </div>
          <Progress value={overallScore} className="mt-4" />
        </Card>

        {/* Non-fatal partial error */}
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Some data could not be loaded: {error}
          </div>
        ) : null}

        {/* STAR analysis */}
        <StarAnalysisSection
          starAnalysis={insights.starAnalysis}
          candidateActionAssessment={insights.candidateActionAssessment}
        />

        {/* Metrics, strengths, weaknesses, recommendations */}
        <MetricsSection insights={insights} />

        {/* Transcript */}
        <TranscriptSection
          transcript={transcript}
          transcriptSegments={segments}
        />

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/interview")}>
            Upload Another
          </Button>
          <Button onClick={() => navigate("/profile")}>Back to Profile</Button>
        </div>
      </div>
    </PageLayout>
  );
}
