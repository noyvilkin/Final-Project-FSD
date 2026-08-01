import { useRef, useEffect, useMemo } from "react";

const FILLER_WORDS = new Set([
  "um", "uh", "er", "ah", "like", "you know", "so", "basically",
  "actually", "literally", "right", "okay", "well", "I mean",
]);

function tokenize(text) {
  if (!text) return [];
  return text.split(/(\s+)/).filter(Boolean);
}

function isFillerWord(token) {
  return FILLER_WORDS.has(token.toLowerCase().replace(/[.,!?;:]/g, ""));
}

/**
 * Builds segments from a plain transcript string.
 * Each segment is approximately one sentence, assigned a rough timestamp
 * proportional to its character position in the full text.
 */
function buildSegments(transcript, totalDuration) {
  if (!transcript || !totalDuration) return [];

  const sentences = transcript.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [
    transcript,
  ];

  const totalChars = transcript.length;
  let charOffset = 0;
  const segments = [];

  sentences.forEach((sentence, idx) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;

    const startTime = (charOffset / totalChars) * totalDuration;
    charOffset += sentence.length;
    const endTime = (charOffset / totalChars) * totalDuration;

    segments.push({
      id: idx,
      text: trimmed,
      startTime,
      endTime,
    });
  });

  return segments;
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function InteractiveTranscript({
  transcript,
  currentTime = 0,
  duration = 0,
  fillerWordExamples = [],
  onSeek,
}) {
  const containerRef = useRef(null);
  const activeRef = useRef(null);

  // Build the known filler words set from analysis
  const knownFillers = useMemo(() => {
    const set = new Set(FILLER_WORDS);
    fillerWordExamples.forEach((fw) => set.add(fw.word.toLowerCase()));
    return set;
  }, [fillerWordExamples]);

  const segments = useMemo(
    () => buildSegments(transcript, duration),
    [transcript, duration]
  );

  // Find active segment
  const activeSegmentId = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].startTime) return segments[i].id;
    }
    return segments[0]?.id ?? null;
  }, [currentTime, segments]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSegmentId]);

  if (!transcript) {
    return (
      <div className="rounded-2xl border bg-white shadow-sm p-6 text-center text-sm text-gray-400">
        No transcript available.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border bg-white shadow-sm p-4 max-h-[500px] overflow-y-auto"
    >
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Transcript
      </h3>
      <div className="space-y-1">
        {segments.map((seg) => {
          const isActive = seg.id === activeSegmentId;
          const tokens = tokenize(seg.text);

          return (
            <div
              key={seg.id}
              ref={isActive ? activeRef : null}
              onClick={() => onSeek?.(seg.startTime)}
              className={[
                "group flex gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-200",
                isActive
                  ? "bg-blue-50 border-l-2 border-blue-500"
                  : "hover:bg-gray-50 border-l-2 border-transparent",
              ].join(" ")}
            >
              <span className="shrink-0 text-[10px] font-mono text-gray-400 pt-0.5 w-8 text-right">
                {formatTime(seg.startTime)}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">
                {tokens.map((token, tIdx) => {
                  const isFiller = knownFillers.has(
                    token.toLowerCase().replace(/[.,!?;:]/g, "")
                  );
                  if (isFiller) {
                    return (
                      <span
                        key={tIdx}
                        className="bg-amber-200/70 text-amber-800 rounded px-0.5 font-medium"
                        title="Filler word"
                      >
                        {token}
                      </span>
                    );
                  }
                  return <span key={tIdx}>{token}</span>;
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
