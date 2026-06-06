import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { processInterview } from "../services/api";
import { apiConfig } from "../services/api";
import axios from "axios";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

const WHAT_HAPPENS = [
  {
    step: "1",
    color: "bg-blue-600",
    title: "Speech-to-text transcription",
    detail: "Your interview audio is transcribed with word-level timestamps.",
  },
  {
    step: "2",
    color: "bg-violet-600",
    title: "STAR framework analysis",
    detail: "We identify Situation, Task, Action, and Result in your answer.",
  },
  {
    step: "3",
    color: "bg-emerald-600",
    title: "Communication metrics",
    detail: "Filler words, speaking pace, and confidence are measured.",
  },
  {
    step: "4",
    color: "bg-orange-500",
    title: "Coaching feedback",
    detail: "Strengths, areas to improve, and actionable recommendations.",
  },
];

export default function InterviewUpload() {
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const previewUrlRef = useRef(null);

  // Revoke the previous object URL whenever a new file is chosen or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";

    // Revoke old preview URL before creating a new one
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }

    if (!selected) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setValidationError("Please upload an audio or video file (MP3, MP4, WAV, OGG, WEBM, FLAC, MOV).");
      setFile(null);
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setValidationError(`File must be ${formatBytes(MAX_FILE_SIZE)} or smaller.`);
      setFile(null);
      return;
    }

    setValidationError("");
    setSubmitError("");
    setFile(selected);

    // Create local preview URL so the user can verify the file before uploading
    const url = URL.createObjectURL(selected);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  async function handleSubmit() {
    if (!file || submitting) return;

    try {
      setSubmitting(true);
      setSubmitError("");
      setUploadProgress(0);

      // Upload with progress tracking via axios directly (the shared request()
      // helper does not expose onUploadProgress)
      const formData = new FormData();
      formData.append("interviews", file);

      const uploadResult = await axios.post(
        `${apiConfig.baseUrl}/api/uploads`,
        formData,
        {
          withCredentials: true,
          headers: userId ? { "x-user-id": userId } : undefined,
          onUploadProgress: (evt) => {
            if (evt.total) {
              setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          },
        }
      ).then((r) => r.data);

      const interviewId = uploadResult?.interviews?.[0];
      if (!interviewId) {
        throw new Error("Upload succeeded but interview ID was not returned. Please try again.");
      }

      // Revoke the preview URL now that the file has been uploaded
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // Trigger full pipeline immediately after upload
      await processInterview(interviewId, userId);

      navigate(`/interview/${interviewId}/processing`, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.message || "Upload failed. Please try again.";
      setSubmitError(msg);
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  return (
    <PageLayout
      title="Interview Practice"
      subtitle="Upload a recorded interview for AI-powered coaching feedback"
      showBack
    >
      <div className="space-y-4">
        {/* File picker */}
        <Card className="p-4">
          <div className="mb-3 flex items-start gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              1
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Upload Your Interview Recording</h3>
              <p className="text-xs text-gray-500">Audio or video file from a mock or real interview</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => document.getElementById("interview-file-input")?.click()}
            disabled={submitting}
            className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="text-sm font-medium text-blue-700">
              {file ? "Change file" : "Click to upload"}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              MP3, MP4, WAV, OGG, WEBM, FLAC, MOV — max 200 MB
            </div>
            {file ? (
              <div className="mx-auto mt-3 max-w-xs rounded-lg bg-white px-3 py-2 text-left">
                <div className="truncate text-sm text-gray-800">{file.name}</div>
                <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
              </div>
            ) : null}
          </button>

          <input
            id="interview-file-input"
            type="file"
            className="hidden"
            accept="audio/*,video/mp4,video/quicktime,video/webm,video/x-msvideo"
            onChange={handleFileChange}
            disabled={submitting}
          />

          {validationError ? (
            <p className="mt-2 text-xs text-red-600">{validationError}</p>
          ) : null}

          {/* Local media preview — lets the user verify the right file was selected */}
          {previewUrl && file ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-1 text-[11px] font-semibold text-gray-500">Preview</p>
              {file.type.startsWith("video/") ? (
                <video
                  src={previewUrl}
                  controls
                  className="w-full rounded-lg"
                  style={{ maxHeight: "220px" }}
                />
              ) : (
                <audio src={previewUrl} controls className="w-full" />
              )}
            </div>
          ) : null}
        </Card>

        {/* What happens */}
        <Card className="border-blue-100 bg-blue-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">What happens next</h3>
          <div className="space-y-2">
            {WHAT_HAPPENS.map(({ step, color, title, detail }) => (
              <div key={step} className="flex items-start gap-2">
                <span
                  className={[
                    "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                    color,
                  ].join(" ")}
                >
                  {step}
                </span>
                <div>
                  <span className="text-xs font-semibold text-gray-800">{title}</span>
                  <span className="ml-1 text-xs text-gray-600">— {detail}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-500">
            Processing usually takes 30–120 seconds depending on recording length.
          </p>
        </Card>

        {/* Submit */}
        <Card className="p-4">
          {/* Upload progress bar */}
          {submitting && uploadProgress > 0 && uploadProgress < 100 ? (
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Uploading…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          {submitError ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/profile")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!file || submitting || !!validationError}
            >
              {submitting
                ? uploadProgress < 100
                  ? `Uploading ${uploadProgress}%…`
                  : "Starting analysis…"
                : "Generate Insights"}
            </Button>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
