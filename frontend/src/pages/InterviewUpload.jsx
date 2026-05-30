import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { useAuth } from "../context/AuthContext";
import { uploadInterview } from "../services/api";

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB (backend enforces 50 MB today)

function isMediaFile(file) {
  return file.type.startsWith("audio/") || file.type.startsWith("video/");
}

function mediaKind(file) {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "media";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FileTile({ file, onFileChange, disabled }) {
  const inputRef = useRef(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="w-full rounded-2xl border border-dashed border-[#cfe0f5] bg-[#f8fbff] px-6 py-8 text-center transition hover:border-[#4f7df3] hover:bg-[#eaf2fb] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
            {file
              ? mediaKind(file) === "audio"
                ? "🎙️"
                : "🎬"
              : "📁"}
          </span>

          {file ? (
            <div className="text-center">
              <p className="truncate text-sm font-semibold text-[#111827]">
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-[#64748b]">
                {formatBytes(file.size)} · {mediaKind(file) === "audio" ? "Audio" : "Video"}
              </p>
              <p className="mt-1 text-xs font-medium text-[#4f7df3]">
                Click to change file
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-[#111827]">
                Click to select a file
              </p>
              <p className="mt-1 text-xs text-[#64748b]">
                Audio or video · MP4, MOV, WebM, MP3, WAV and more
              </p>
            </div>
          )}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          onFileChange(selected);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function MediaPlayer({ file, previewUrl }) {
  const kind = mediaKind(file);

  if (kind === "audio") {
    return (
      <audio
        controls
        src={previewUrl}
        className="w-full"
        style={{ colorScheme: "light" }}
      />
    );
  }

  return (
    <video
      controls
      src={previewUrl}
      className="w-full rounded-xl"
      style={{ maxHeight: 360 }}
    />
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InterviewUpload() {
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Create / revoke object URL whenever the selected file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isUploading = status === "uploading";
  const isDone = status === "done";
  const canUpload = !!file && !isUploading && !isDone;

  function handleFileChange(selected) {
    if (!selected) {
      setFile(null);
      setErrorMessage("");
      return;
    }

    if (!isMediaFile(selected)) {
      setErrorMessage("Please select an audio or video file.");
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setErrorMessage(`File must be smaller than ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }

    setFile(selected);
    setErrorMessage("");
    setStatus("idle");
    setUploadResult(null);
  }

  async function handleUpload() {
    if (!file) return;

    setErrorMessage("");
    setProgress(0);
    setStatus("uploading");

    try {
      const result = await uploadInterview({
        mediaFile: file,
        userId: userId ?? undefined,
        jobId: jobId || undefined,
        onProgress: setProgress,
      });

      setUploadResult(result);
      setProgress(100);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.message || "Upload failed. Please try again.");
    }
  }

  function handleReset() {
    setFile(null);
    setJobId("");
    setProgress(0);
    setStatus("idle");
    setErrorMessage("");
    setUploadResult(null);
  }

  const interviewRecord = uploadResult?.interviews?.[0] ?? null;
  const uploadedFile = uploadResult?.files?.[0] ?? null;

  return (
    <PageLayout
      title="Interview Practice"
      subtitle="Upload your recording to get AI feedback"
      showBack
    >
      <div className="space-y-4">
        {/* ── Success state ─────────────────────────────────────────── */}
        {isDone && (
          <>
            {/* Result metadata */}
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
                  ✅
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">
                    Upload complete
                  </h2>
                  <p className="text-xs text-[#64748b]">
                    Your recording has been saved
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#eef4fb]">
                <InfoRow label="File name" value={file.name} />
                <InfoRow label="File size" value={formatBytes(file.size)} />
                <InfoRow
                  label="Type"
                  value={mediaKind(file) === "audio" ? "Audio recording" : "Video recording"}
                />
                {uploadedFile?.size && (
                  <InfoRow label="Stored size" value={formatBytes(uploadedFile.size)} />
                )}
                {interviewRecord?.id && (
                  <InfoRow label="Interview ID" value={interviewRecord.id} />
                )}
                <InfoRow
                  label="Status"
                  value={
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {interviewRecord?.status ?? "pending"}
                    </span>
                  }
                />
              </div>
            </Card>

            {/* Media player */}
            {previewUrl && (
              <Card className="p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                  Preview
                </p>
                <MediaPlayer file={file} previewUrl={previewUrl} />
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate("/profile")}
              >
                Back to Profile
              </Button>
              <Button className="flex-1" onClick={handleReset}>
                Upload Another
              </Button>
            </div>
          </>
        )}

        {/* ── Upload form ───────────────────────────────────────────── */}
        {!isDone && (
          <>
            {/* File picker */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#050816] text-xs font-semibold text-white">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Select your recording
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Audio or video file of your interview practice
                  </p>
                </div>
              </div>
              <FileTile
                file={file}
                onFileChange={handleFileChange}
                disabled={isUploading}
              />
            </Card>

            {/* Optional job context */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#64748b] text-xs font-semibold text-white">
                  2
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[#111827]">
                    Job context{" "}
                    <span className="font-normal text-[#94a3b8]">(optional)</span>
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Enter the role or position you were practicing for
                  </p>
                </div>
              </div>
              <Input
                placeholder="e.g. Frontend Engineer at Acme Corp"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={isUploading}
                maxLength={200}
              />
            </Card>

            {/* Progress (visible during upload) */}
            {isUploading && (
              <Card className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-[#111827]">
                    Uploading…
                  </span>
                  <span className="text-sm font-semibold text-[#4f7df3]">
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} />
                <p className="mt-2 text-xs text-[#64748b]">
                  {file && formatBytes((file.size * progress) / 100)} of{" "}
                  {file && formatBytes(file.size)}
                </p>
              </Card>
            )}

            {/* Error */}
            {errorMessage && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <Card className="border-[#dde7f3] bg-[#f8fbff] p-4">
              <div className="mb-3 flex items-center gap-2">
                <ReadinessChip label="Recording" ready={!!file} />
                <ReadinessChip label="Job context" ready={!!jobId.trim()} optional />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/profile")}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={!canUpload}
                >
                  {isUploading ? "Uploading…" : "Upload Recording"}
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm text-[#64748b]">{label}</span>
      <span className="max-w-[60%] truncate text-right text-sm font-medium text-[#111827]">
        {value}
      </span>
    </div>
  );
}

function ReadinessChip({ label, ready, optional = false }) {
  if (optional && !ready) return null;
  return (
    <span
      className={[
        "rounded-md border px-2 py-1.5 text-xs",
        ready
          ? "border-blue-200 bg-white text-blue-700"
          : "border-gray-200 bg-white text-gray-500",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
