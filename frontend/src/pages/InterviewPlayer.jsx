import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { getInterviewInsights, getInterviewMediaUrl } from "../services/api";
import InterviewPlayerComponent from "../components/interview/InterviewPlayer";
import InteractiveTranscript from "../components/interview/InteractiveTranscript";

/* ---------- helpers ---------- */

function ScoreRing({ score, size = 90, label }) {
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
    <div className="flex flex-col items-center gap-1 relative">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold">
        {score}
      </span>
      {label && (
        <span className="text-[10px] text-gray-500 mt-0.5">{label}</span>
      )}
    </div>
  );
}

const STAR_LABELS = [
  {
    key: "situation", label: "S", full: "Situation",
    bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500",
  },
  {
    key: "task", label: "T", full: "Task",
    bg: "bg-purple-50", border: "border-purple-200", dot: "bg-purple-500",
  },
  {
    key: "action", label: "A", full: "Action",
    bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500",
  },
  {
    key: "result", label: "R", full: "Result",
    bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500",
  },
];

function StarVisualization({ starAnalysis }) {
  if (!starAnalysis) return null;

  const scores = STAR_LABELS.map(({ key }) => starAnalysis[key]?.score ?? 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return (
    <Card className="p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        STAR Alignment
      </h3>
      <div className="flex items-center justify-center gap-1 mb-4">
        <ScoreRing score={avgScore} size={70} label="STAR Score" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STAR_LABELS.map(({ key, label, full, bg, border, dot }) => {
          const comp = starAnalysis[key];
          if (!comp) return null;
          const present = comp.score >= 40;
          return (
            <div
              key={key}
              className={[
                "rounded-xl border p-3 transition-all",
                present
                  ? `${bg} ${border}`
                  : "bg-gray-50 border-gray-200 opacity-70",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white",
                    present ? dot : "bg-gray-400",
                  ].join(" ")}
                >
                  {label}
                </span>
                <span className="text-sm font-semibold text-gray-800">
                  {full}
                </span>
                <Badge className="ml-auto bg-white/70 text-gray-700 text-[10px]">
                  {comp.score}%
                </Badge>
              </div>
              {comp.feedback && (
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  {comp.feedback}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- page ---------- */

export default function InterviewPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId: authUserId } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Player state lifted up for transcript sync
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTarget, setSeekTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getInterviewInsights(id, authUserId);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load interview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authUserId]);

  const handleTranscriptSeek = useCallback((time) => {
    setSeekTarget(time);
    // Reset after a tick so the same time can be re-clicked
    setTimeout(() => setSeekTarget(null), 50);
  }, []);

  return (
    <PageLayout
      title="Interview Insights"
      subtitle={data ? `${data.mediaType === "video" ? "Video" : "Audio"} Analysis` : ""}
      showBack
      right={
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/interview/history")}
        >
          History
        </Button>
      }
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

      {!loading && data && (
        <div className="space-y-4">
          {/* Two-column layout: Player + Transcript | Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Left column: Player + Transcript (3/5 width) */}
            <div className="lg:col-span-3 space-y-4">
              {/* Media player */}
              <InterviewPlayerComponent
                mediaUrl={getInterviewMediaUrl(id)}
                mediaType={data.mediaType}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                seekTo={seekTarget}
              />

              {/* Interactive transcript */}
              <InteractiveTranscript
                transcript={data.transcript}
                currentTime={currentTime}
                duration={duration}
                fillerWordExamples={data.fillerWordsBreakdown || []}
                onSeek={handleTranscriptSeek}
              />
            </div>

            {/* Right column: Metrics + STAR (2/5 width) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Overall score */}
              {data.confidenceScore != null && (
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Overall Performance
                  </h3>
                  <div className="flex justify-center mb-4">
                    <ScoreRing
                      score={data.confidenceScore}
                      size={100}
                      label="Confidence Score"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Filler words */}
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-[10px] uppercase text-amber-600 font-semibold mb-1">
                        Filler Words
                      </p>
                      <p className="text-lg font-bold text-amber-800">
                        {data.fillerWordCount ?? 0}
                      </p>
                    </div>

                    {/* Pacing */}
                    <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                      <p className="text-[10px] uppercase text-blue-600 font-semibold mb-1">
                        Pace
                      </p>
                      <p className="text-lg font-bold text-blue-800">
                        {data.wordsPerMinute != null ? Math.round(data.wordsPerMinute) : "—"}
                      </p>
                      <p className="text-[10px] text-blue-600">words / min</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Filler word breakdown */}
              {data.fillerWordsBreakdown?.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Filler Word Breakdown
                  </h3>
                  <div className="space-y-2">
                    {data.fillerWordsBreakdown.map((fw, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="bg-amber-100 text-amber-800 rounded px-2 py-0.5 font-medium text-xs">
                          {fw.word}
                        </span>
                        <span className="text-gray-600 font-semibold">
                          {fw.count}x
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* STAR Alignment */}
              {data.starAnalysis && (
                <StarVisualization starAnalysis={data.starAnalysis} />
              )}

              {/* Strengths */}
              {data.strengths?.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Strengths
                  </h3>
                  <ul className="space-y-2">
                    {data.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs">
                          +
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Weaknesses */}
              {data.weaknesses?.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Areas for Improvement
                  </h3>
                  <ul className="space-y-2">
                    {data.weaknesses.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs">
                          !
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Recommendations */}
              {data.recommendations?.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {data.recommendations.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xs">
                          →
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
