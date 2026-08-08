import { useRef, useState, useEffect, useCallback } from "react";

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function InterviewPlayer({
  mediaUrl,
  mediaType = "audio",
  onTimeUpdate,
  onDurationChange,
  seekTo,
}) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  // External seek control
  useEffect(() => {
    if (seekTo != null && ref.current && isFinite(seekTo)) {
      ref.current.currentTime = seekTo;
    }
  }, [seekTo]);

  const handleTimeUpdate = useCallback(() => {
    const t = ref.current?.currentTime ?? 0;
    setCurrentTime(t);
    onTimeUpdate?.(t);
  }, [onTimeUpdate]);

  const handleLoadedMetadata = useCallback(() => {
    const d = ref.current?.duration ?? 0;
    setDuration(d);
    onDurationChange?.(d);
  }, [onDurationChange]);

  const togglePlay = () => {
    if (!ref.current) return;
    if (playing) {
      ref.current.pause();
    } else {
      ref.current.play();
    }
    setPlaying(!playing);
  };

  const handleEnded = () => setPlaying(false);

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    if (ref.current) ref.current.currentTime = val;
    setCurrentTime(val);
  };

  const cycleRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = rates.indexOf(playbackRate);
    const next = rates[(idx + 1) % rates.length];
    setPlaybackRate(next);
    if (ref.current) ref.current.playbackRate = next;
  };

  const skip = (delta) => {
    if (!ref.current) return;
    ref.current.currentTime = Math.max(
      0,
      Math.min(duration, ref.current.currentTime + delta)
    );
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (ref.current) ref.current.volume = v;
  };

  const MediaElement = mediaType === "video" ? "video" : "audio";

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      {/* Hidden native element */}
      <MediaElement
        ref={ref}
        src={mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className={mediaType === "video" ? "w-full rounded-lg mb-3" : "hidden"}
        preload="metadata"
      />

      {/* Waveform-style progress */}
      <div className="mb-3">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 rounded-full appearance-none bg-gray-200 cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Skip back 10s */}
          <button
            onClick={() => skip(-10)}
            className="h-9 w-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition text-sm font-medium"
            title="Back 10s"
          >
            -10
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="h-11 w-11 flex items-center justify-center rounded-full bg-black text-white hover:opacity-90 transition shadow-sm"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5v11l10-5.5L4 2.5z" />
              </svg>
            )}
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => skip(10)}
            className="h-9 w-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition text-sm font-medium"
            title="Forward 10s"
          >
            +10
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Playback rate */}
          <button
            onClick={cycleRate}
            className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition"
          >
            {playbackRate}x
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-gray-400"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {volume > 0 && (
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              )}
              {volume > 0.5 && (
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              )}
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="w-16 h-1.5 rounded-full appearance-none bg-gray-200 cursor-pointer accent-gray-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
