import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../context/AuthContext";
import { getInterviewArchive, getInterviewMediaUrl } from "../services/api";

function ScoreRing({ score, size = 72 }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70
      ? "text-emerald-500"
      : score >= 50
      ? "text-amber-500"
      : "text-red-500";

  return (
    <div className="relative flex-shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-gray-200" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-gray-800">
        {score}
      </span>
    </div>
  );
}

function MediaPlayer({ interviewId, mediaType }) {
  const src = getInterviewMediaUrl(interviewId);

  return (
    <div className="rounded-xl overflow-hidden bg-black">
      {mediaType === "video" ? (
        <video
          src={src}
          controls
          controlsList="nodownload"
          className="w-full max-h-56 object-contain"
        />
      ) : (
        <div className="p-3 bg-gray-50 rounded-xl">
          <audio src={src} controls className="w-full" />
        </div>
      )}
    </div>
  );
}

function StarBar({ label, score, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${color}`}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{score ?? 0}%</span>
    </div>
  );
}

function ArchiveCard({ interview, expanded, onToggle }) {
  const navigate = useNavigate();
  const {
    id,
    mediaType,
    jobTitle,
    company,
    confidenceScore,
    starAnalysis,
    strengths,
    weaknesses,
    recommendations,
    fillerWordCount,
    wordsPerMinute,
    createdAt,
  } = interview;

  const date = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = new Date(createdAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {confidenceScore != null && <ScoreRing score={confidenceScore} />}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {jobTitle && (
                <span className="text-sm font-semibold text-gray-900 truncate">{jobTitle}</span>
              )}
              {company && (
                <Badge className="bg-blue-100 text-blue-700">{company}</Badge>
              )}
              {!jobTitle && !company && (
                <span className="text-sm font-medium text-gray-500 italic">No job details</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>{date} · {time}</span>
              <Badge className="bg-gray-100 text-gray-600">
                {mediaType === "video" ? "🎥 Video" : "🎙 Audio"}
              </Badge>
              {fillerWordCount != null && (
                <span>{fillerWordCount} filler word{fillerWordCount !== 1 ? "s" : ""}</span>
              )}
              {wordsPerMinute != null && (
                <span>{Math.round(wordsPerMinute)} wpm</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/interview/${id}`)}
            >
              Full View
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggle}
            >
              {expanded ? "▲" : "▼"}
            </Button>
          </div>
        </div>

        {/* STAR mini bars always visible */}
        {starAnalysis && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            <StarBar label="S" score={starAnalysis.situation?.score} color="bg-blue-500" />
            <StarBar label="T" score={starAnalysis.task?.score}      color="bg-purple-500" />
            <StarBar label="A" score={starAnalysis.action?.score}    color="bg-emerald-500" />
            <StarBar label="R" score={starAnalysis.result?.score}    color="bg-amber-500" />
          </div>
        )}
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Video / audio player */}
          <MediaPlayer interviewId={id} mediaType={mediaType} />

          {/* Feedback */}
          {(strengths?.length > 0 || weaknesses?.length > 0 || recommendations?.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-3">
              {strengths?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide">Strengths</p>
                  <ul className="space-y-1">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <span className="mt-0.5 text-emerald-500">✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {weaknesses?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-red-700 uppercase tracking-wide">Areas to Improve</p>
                  <ul className="space-y-1">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <span className="mt-0.5 text-red-400">✗</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recommendations?.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-blue-700 uppercase tracking-wide">Recommendations</p>
                  <ul className="space-y-1">
                    {recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                        <span className="mt-0.5 text-blue-400">→</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function InterviewArchive() {
  const { userId } = useAuth();
  const navigate = useNavigate();

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getInterviewArchive(userId);
      setInterviews(res.interviews || []);
    } catch (err) {
      setError(err.message || "Failed to load archive");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleExpanded(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <PageLayout
      title="Interview Archive"
      subtitle="All your completed interview analyses"
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
          <p className="text-sm text-gray-500 mb-3">No completed interviews yet.</p>
          <Button size="sm" onClick={() => navigate("/interview")}>
            Upload your first interview
          </Button>
        </Card>
      )}

      {!loading && interviews.length > 0 && (
        <div className="space-y-3">
          {interviews.map((item) => (
            <ArchiveCard
              key={item.id}
              interview={item}
              expanded={expandedId === item.id}
              onToggle={() => toggleExpanded(item.id)}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
