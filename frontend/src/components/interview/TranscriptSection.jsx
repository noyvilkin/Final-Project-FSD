import { useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TranscriptSection({ transcript, transcriptSegments }) {
  const [expanded, setExpanded] = useState(false);

  if (!transcript) return null;

  const hasSegments = Array.isArray(transcriptSegments) && transcriptSegments.length > 0;
  const isLong = transcript.length > 600;

  const displayText =
    !expanded && isLong ? transcript.slice(0, 600).trimEnd() + "…" : transcript;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Transcript</h3>
        {isLong ? (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : "Show full transcript"}
          </Button>
        ) : null}
      </div>

      {hasSegments ? (
        // Timestamped segment view
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {transcriptSegments.map((seg, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="shrink-0 text-[11px] text-gray-400 pt-0.5">
                {formatTime(seg.start)}
              </span>
              <span className="text-gray-800">{seg.text}</span>
            </div>
          ))}
        </div>
      ) : (
        // Plain text view
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {displayText}
        </p>
      )}
    </Card>
  );
}
