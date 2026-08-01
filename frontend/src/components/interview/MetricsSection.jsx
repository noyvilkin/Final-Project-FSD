import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";

function confidenceLabel(score) {
  if (score >= 80) return { text: "High Confidence", cls: "bg-emerald-100 text-emerald-700" };
  if (score >= 55) return { text: "Moderate Confidence", cls: "bg-amber-100 text-amber-700" };
  return { text: "Low Confidence", cls: "bg-rose-100 text-rose-700" };
}

function pacingLabel(wpm) {
  if (wpm === 0 || wpm == null) return null;
  if (wpm < 110) return { text: "Slower than average", cls: "bg-blue-100 text-blue-700" };
  if (wpm <= 170) return { text: "Good pace", cls: "bg-emerald-100 text-emerald-700" };
  return { text: "Faster than average", cls: "bg-amber-100 text-amber-700" };
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export default function MetricsSection({ insights }) {
  if (!insights) return null;

  const {
    confidenceScore,
    wordsPerMinute,
    estimatedSpeakingDurationSeconds,
    fillerWordCount,
    fillerWordsBreakdown,
    strengths,
    weaknesses,
    recommendations,
  } = insights;

  const pacing   = pacingLabel(wordsPerMinute);
  const confLabel = confidenceLabel(confidenceScore ?? 0);
  const fillers  = safeArray(fillerWordsBreakdown);
  const strengthsList = safeArray(strengths);
  const weaknessesList = safeArray(weaknesses);
  const recList = safeArray(recommendations);

  return (
    <div className="space-y-3">
      {/* Confidence + Pacing row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Confidence */}
        {confidenceScore != null ? (
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Confidence Score
            </p>
            <p className="mt-1 text-4xl font-bold text-blue-700">{confidenceScore}</p>
            <Progress value={confidenceScore} className="mt-2" />
            <div className="mt-2">
              <Badge className={confLabel.cls}>{confLabel.text}</Badge>
            </div>
          </Card>
        ) : null}

        {/* Pacing */}
        {wordsPerMinute != null && wordsPerMinute > 0 ? (
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Speaking Pace
            </p>
            <p className="mt-1 text-4xl font-bold text-gray-800">
              {wordsPerMinute}
              <span className="ml-1 text-sm font-normal text-gray-500">wpm</span>
            </p>
            {estimatedSpeakingDurationSeconds ? (
              <p className="mt-1 text-xs text-gray-500">
                Duration: {Math.round(estimatedSpeakingDurationSeconds)}s
              </p>
            ) : null}
            {pacing ? (
              <div className="mt-2">
                <Badge className={pacing.cls}>{pacing.text}</Badge>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* Filler words */}
      {fillerWordCount != null ? (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Filler Words</h3>
            <Badge className={fillerWordCount > 10 ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-700"}>
              {fillerWordCount} total
            </Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Filler words can reduce how confident and prepared you sound.
          </p>
          {fillers.length > 0 ? (
            <div className="mt-3 space-y-1">
              {fillers.map(({ word, count }) => (
                <div key={word} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-700 font-medium">"{word}"</span>
                  <div className="flex-1 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-blue-400"
                      style={{
                        width: `${Math.min(100, (count / (fillerWordCount || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs text-gray-500">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-600">No filler words detected — great job!</p>
          )}
        </Card>
      ) : null}

      {/* Strengths */}
      {strengthsList.length > 0 ? (
        <Card className="border-emerald-300 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">What You Did Well</h3>
          <p className="mb-2 text-xs text-gray-600">{strengthsList.length} strengths identified</p>
          <div className="space-y-2">
            {strengthsList.map((item, i) => (
              <div key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-800">
                <span className="mr-2 font-semibold text-emerald-600">✓</span>{item}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Weaknesses */}
      {weaknessesList.length > 0 ? (
        <Card className="border-orange-300 bg-orange-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Areas to Strengthen</h3>
          <p className="mb-2 text-xs text-gray-600">{weaknessesList.length} opportunities identified</p>
          <div className="space-y-2">
            {weaknessesList.map((item, i) => (
              <div key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-800">
                <span className="mr-2 font-semibold text-orange-500">!</span>{item}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Recommendations */}
      {recList.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Coaching Recommendations</h3>
          <p className="mb-2 text-xs text-gray-600">Actionable steps to improve</p>
          <div className="space-y-2">
            {recList.map((item, i) => (
              <div key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-800">
                <span className="mr-2 font-semibold text-amber-600">→</span>{item}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
