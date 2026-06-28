import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { uploadInterviewMedia } from "../services/api";

// ── Constants ──────────────────────────────────────────────────────────────────

// Client-side guard. Backend currently enforces 50 MB via multer.
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ["audio/", "video/"];

// ── Pure helpers ───────────────────────────────────────────────────────────────

function isMediaFile(file) {
  return ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
}

function mediaKind(file) {
  if (file?.type.startsWith("audio/")) return "audio";
  if (file?.type.startsWith("video/")) return "video";
  return "media";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusLabel(status, progress) {
  switch (status) {
    case "preparing":  return "Preparing upload…";
    case "uploading":  return `Uploading file — ${progress}%`;
    case "finalizing": return "Finalizing upload…";
    case "done":       return "Upload complete";
    default:           return "";
  }
}

function validateFile(file) {
  if (!isMediaFile(file)) {
    return "Unsupported file type. Please select an audio or video file (MP4, MOV, WebM, MP3, WAV, etc.).";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large. Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)}.`;
  }
  return null;
}

// Maps raw axios / server errors to sentences a user can act on.
function friendlyError(err) {
  const msg    = (err?.message ?? "").toLowerCase();
  const status = err?.status ?? 0;

  if (status === 0 || msg.includes("network") || msg.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (status === 401 || status === 403) {
    return "Your session has expired. Please log in and try again.";
  }
  if (status === 413 || msg.includes("too large") || msg.includes("file size") || msg.includes("limit")) {
    return "File is too large for the server (maximum 50 MB). Please use a shorter or compressed recording.";
  }
  if (msg.includes("file type") || msg.includes("mime") || msg.includes("not allowed") || msg.includes("invalid")) {
    return "The server rejected this file type. Please upload an audio or video file.";
  }
  if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("timed out")) {
    return "Upload timed out. Check your connection and try again.";
  }
  if (status >= 500) {
    return "Server error. Please wait a moment and try again.";
  }
  if (err?.message && err.message !== "Request failed") {
    return err.message;
  }
  return "Upload failed. Please try again.";
}

// ── FileTile ───────────────────────────────────────────────────────────────────

function FileTile({ file, onFileChange, errorId }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped) onFileChange(dropped);
  }

  function handleDragOver(e) { e.preventDefault(); }

  function handleDragEnter(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  }

  function handleKeyDown(e) {
    // Space and Enter both open the file dialog (button default handles Enter;
    // add Space explicitly for completeness).
    if (e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  const icon = file
    ? mediaKind(file) === "audio" ? "🎙️" : "🎬"
    : isDragging ? "📂" : "📁";

  const ariaLabel = file
    ? `${file.name} selected — ${formatBytes(file.size)}. Press Enter or Space to replace`
    : "Open file picker to select an audio or video recording";

  return (
    <div>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={errorId}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={[
          "w-full rounded-2xl border border-dashed px-6 py-8 text-center transition",
          isDragging
            ? "border-[#4f7df3] bg-[#eaf2fb]"
            : "border-[#cfe0f5] bg-[#f8fbff] hover:border-[#4f7df3] hover:bg-[#eaf2fb]",
          "focus:outline-none focus:ring-2 focus:ring-[#4f7df3] focus:ring-offset-2",
        ].join(" ")}
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm"
                aria-hidden="true">
            {icon}
          </span>

          {file ? (
            <div className="text-center">
              <p className="max-w-[260px] truncate text-sm font-semibold text-[#111827]">
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-[#64748b]">
                {formatBytes(file.size)}
                {" · "}
                {mediaKind(file) === "audio" ? "Audio" : "Video"}
              </p>
              <p className="mt-1 text-xs font-medium text-[#4f7df3]">
                Click or drag to replace
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-[#111827]">
                {isDragging ? "Drop your file here" : "Click or drag a file here"}
              </p>
              <p className="mt-1 text-xs text-[#64748b]">
                Audio or video · MP4, MOV, WebM, MP3, WAV and more
              </p>
            </div>
          )}
        </div>
      </button>

      {/* Hidden — the button above is the keyboard/AT target */}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          if (selected) onFileChange(selected);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── FileInfoRow ────────────────────────────────────────────────────────────────

function FileInfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <span className="shrink-0 text-sm text-[#64748b]">{label}</span>
      <span className="max-w-[65%] truncate text-right text-sm font-medium text-[#111827]">
        {value}
      </span>
    </div>
  );
}

// ── MediaPlayer ────────────────────────────────────────────────────────────────

function MediaPlayer({ file, previewUrl }) {
  const kind = mediaKind(file);
  const label = `${kind === "audio" ? "Audio" : "Video"} player for ${file.name}`;

  if (kind === "audio") {
    return (
      <div className="flex items-center justify-center py-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={previewUrl} className="w-full" aria-label={label} />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line jsx-a11y/media-has-caption */
    <video
      controls
      src={previewUrl}
      className="w-full rounded-lg"
      aria-label={label}
      style={{ maxHeight: 380, display: "block" }}
    />
  );
}

// ── InterviewUpload ────────────────────────────────────────────────────────────

// Status machine:
//   idle → selected → preparing → uploading → finalizing → done
//                                                        ↘ error  (retry → selected)

export default function InterviewUpload() {
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [file, setFile]                 = useState(null);
  const [jobId, setJobId]               = useState("");
  const [status, setStatus]             = useState("idle");
  const [progress, setProgress]         = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [previewUrl, setPreviewUrl]     = useState(null);
  const abortRef                        = useRef(null);

  // Object-URL: created on file selection, revoked on change or unmount.
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isActive = ["preparing", "uploading", "finalizing"].includes(status);
  const isDone   = status === "done";
  const isError  = status === "error";

  // ── File selection ───────────────────────────────────────────────────────────

  function handleFileChange(selected) {
    if (!selected) return;
    const err = validateFile(selected);
    if (err) {
      setErrorMessage(err);
      // Keep the previous file so the user can try a different one
      return;
    }
    setFile(selected);
    setErrorMessage("");   // clear previous validation or upload errors
    setUploadResult(null);
    setProgress(0);
    setStatus("selected");
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) {
      setErrorMessage("Please select a file before uploading.");
      return;
    }

    setErrorMessage("");
    setProgress(0);
    setStatus("preparing");

    // Create an AbortController so the user can cancel large uploads
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await new Promise((r) => setTimeout(r, 280)); // let browser paint "preparing"

      setStatus("uploading");

      const result = await uploadInterviewMedia({
        mediaFile: file,
        userId: userId ?? undefined,
        jobId: jobId || undefined,
        onProgress: (pct) => setProgress(pct),
      });

      setProgress(100);
      setStatus("finalizing");

      await new Promise((r) => setTimeout(r, 550)); // let browser paint "finalizing"

      setUploadResult(result);
      setStatus("done");
    } catch (err) {
      setProgress(0);
      if (controller.signal.aborted) {
        setStatus(file ? "selected" : "idle");
        setErrorMessage("");
      } else {
        setStatus("error");
        setErrorMessage(friendlyError(err));
      }
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }

  // ── Retry / reset ────────────────────────────────────────────────────────────

  function handleRetry() {
    setErrorMessage("");
    setProgress(0);
    setStatus(file ? "selected" : "idle");
  }

  function handleReset() {
    setFile(null);
    setJobId("");
    setProgress(0);
    setStatus("idle");
    setErrorMessage("");
    setUploadResult(null);
  }

  // Support both the dedicated endpoint shape and the legacy generic upload shape
  const interviewRecord = uploadResult?.interview ?? uploadResult?.interviews?.[0] ?? null;
  const uploadedFile    = uploadResult?.file ?? uploadResult?.files?.[0] ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageLayout
      title="Interview Practice"
      subtitle="Upload your recording for AI-powered feedback"
      showBack
    >
      <div className="mx-auto max-w-xl space-y-4">

        {/* ══ ACTIVE (preparing / uploading / finalizing) ══════════════════════ */}
        {isActive && (
          <Card className="p-6">
            <div
              className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
              aria-hidden="true"
            />

            {/* Live region: screen readers announce every status change */}
            <div aria-live="polite" aria-atomic="true">
              <h2 className="text-center text-base font-semibold text-[#111827]">
                {statusLabel(status, progress)}
              </h2>
              <p className="mt-1 text-center text-sm text-[#64748b]">
                {status === "uploading"
                  ? `${formatBytes((file.size * progress) / 100)} of ${formatBytes(file.size)}`
                  : status === "finalizing"
                  ? "Almost there…"
                  : "Getting ready to send your file"}
              </p>
            </div>

            {/* Progress bar with ARIA */}
            {(status === "uploading" || status === "finalizing") && (
              <div
                className="mt-5"
                role="progressbar"
                aria-valuenow={status === "finalizing" ? 100 : progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <Progress value={status === "finalizing" ? 100 : progress} />
                <p className="mt-1.5 text-right text-xs text-[#94a3b8]" aria-hidden="true">
                  {status === "finalizing" ? 100 : progress}%
                </p>
              </div>
            )}

            {/* Cancel button — only during active upload, not finalizing */}
            {status === "uploading" && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel Upload
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* ══ DONE / SUCCESS ═══════════════════════════════════════════════════ */}
        {isDone && (
          <div role="status" aria-label="Upload complete">
            {/* Media player */}
            {previewUrl && (
              <Card className="mb-4 overflow-hidden p-0">
                <div className="bg-[#050816] p-4">
                  <MediaPlayer file={file} previewUrl={previewUrl} />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#eef4fb] px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-base leading-none" aria-hidden="true">
                      {mediaKind(file) === "audio" ? "🎙️" : "🎬"}
                    </span>
                    <span className="truncate text-sm font-medium text-[#111827]">
                      {file.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-[#94a3b8]">Local preview</span>
                </div>
              </Card>
            )}

            {/* Metadata */}
            <Card className="mb-4 p-5">
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-lg"
                  aria-hidden="true"
                >
                  ✅
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">Upload complete</h2>
                  <p className="text-xs text-[#64748b]">Your recording has been saved</p>
                </div>
              </div>

              <div className="divide-y divide-[#eef4fb]">
                <FileInfoRow label="File name"     value={file.name} />
                <FileInfoRow label="File size"     value={formatBytes(file.size)} />
                <FileInfoRow label="File type"     value={mediaKind(file) === "audio" ? "Audio" : "Video"} />
                {uploadedFile?.mimeType && (
                  <FileInfoRow label="MIME type"   value={uploadedFile.mimeType} />
                )}
                {interviewRecord?.id && (
                  <FileInfoRow label="Interview ID" value={interviewRecord.id} />
                )}
                <FileInfoRow
                  label="Upload status"
                  value={
                    <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {interviewRecord?.status ?? "pending"}
                    </span>
                  }
                />
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/profile")}>
                Back to Profile
              </Button>
              <Button className="flex-1" onClick={handleReset}>
                Upload Another
              </Button>
            </div>
          </div>
        )}

        {/* ══ FORM (idle / selected / error) ═══════════════════════════════════ */}
        {!isActive && !isDone && (
          <>
            {/* Step 1 — file picker */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#050816] text-xs font-semibold text-white"
                  aria-hidden="true"
                >
                  1
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Select your recording
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Audio or video of your interview practice
                  </p>
                </div>
              </div>

              <FileTile
                file={file}
                onFileChange={handleFileChange}
                errorId="file-validation-error"
              />

              {/* Validation error — role="alert" announces immediately */}
              {errorMessage && (status === "idle" || status === "selected") && (
                <p
                  id="file-validation-error"
                  role="alert"
                  className="mt-2 text-xs text-red-600"
                >
                  {errorMessage}
                </p>
              )}
            </Card>

            {/* Step 2 — job context */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#64748b] text-xs font-semibold text-white"
                  aria-hidden="true"
                >
                  2
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Job context{" "}
                    <span className="font-normal text-[#94a3b8]">(optional)</span>
                  </h3>
                  <p className="text-xs text-[#64748b]">Role or position you were practising for</p>
                </div>
              </div>
              <Input
                placeholder="e.g. Frontend Engineer at Acme Corp"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                aria-label="Job role or position (optional)"
                maxLength={200}
              />
            </Card>

            {/* Summary + submit */}
            <Card className="border-[#dde7f3] bg-[#f8fbff] p-4">
              {/* Selected-file chips */}
              {file && (
                <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Selected file details">
                  <span className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-blue-700">
                    <span aria-hidden="true">{mediaKind(file) === "audio" ? "🎙️" : "🎬"} </span>
                    <span className="font-medium">{file.name}</span>
                  </span>
                  <span className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-blue-700">
                    {formatBytes(file.size)}
                  </span>
                  <span className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-blue-700">
                    {mediaKind(file) === "audio" ? "Audio" : "Video"}
                  </span>
                </div>
              )}

              {/* Upload error — role="alert" announces immediately */}
              {isError && errorMessage && (
                <div
                  role="alert"
                  className="mb-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">⚠️</span>
                  <p className="flex-1 min-w-0 text-sm font-medium text-red-700">
                    {errorMessage}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/profile")}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={!file}
                  aria-disabled={!file}
                >
                  Upload Recording
                </Button>
              </div>
            </Card>
          </>
        )}

      </div>
    </PageLayout>
  );
}
