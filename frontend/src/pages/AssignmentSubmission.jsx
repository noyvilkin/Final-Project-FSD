import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useAuth } from "../context/AuthContext";

const MAX_DESCRIPTION_SIZE = 10 * 1024 * 1024;
const MAX_SOLUTION_SIZE = 50 * 1024 * 1024;

const DESCRIPTION_ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const SOLUTION_ALLOWED_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value.toFixed(power === 0 ? 0 : 1)} ${units[power]}`;
}

function matchesType(file, allowedTypes) {
  return allowedTypes.includes(file.type);
}

function UploadTile({
  inputId,
  number,
  colorClass,
  title,
  subtitle,
  file,
  onFileChange,
  accept,
  disabled,
  hint,
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start gap-2">
        <span
          className={[
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold text-white",
            colorClass,
          ].join(" ")}
        >
          {number}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          const input = document.getElementById(inputId);
          if (input) input.click();
        }}
        disabled={disabled}
        className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="text-sm font-medium text-blue-700">
          {file ? "Change file" : "Click to upload"}
        </div>
        <div className="mt-1 text-xs text-gray-500">{hint}</div>
        {file ? (
          <div className="mt-3 rounded-lg bg-white px-3 py-2 text-left">
            <div className="truncate text-sm text-gray-800">{file.name}</div>
            <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
          </div>
        ) : null}
      </button>

      <input
        id={inputId}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(event) => {
          const selected = event.target.files?.[0] || null;
          onFileChange(selected);
          event.target.value = "";
        }}
      />
    </Card>
  );
}

export default function AssignmentSubmission() {
  const navigate = useNavigate();
  const { userId } = useAuth();

  const [descriptionFile, setDescriptionFile] = useState(null);
  const [solutionFile, setSolutionFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isSubmitting = status === "uploading" || status === "processing";

  const canSubmit = Boolean(descriptionFile) && Boolean(solutionFile) && !isSubmitting;

  const validateDescription = (file) => {
    if (!file) {
      setDescriptionFile(null);
      return;
    }

    if (!matchesType(file, DESCRIPTION_ALLOWED_TYPES)) {
      setErrorMessage("Assignment description must be PDF, DOC, DOCX, or TXT.");
      return;
    }

    if (file.size > MAX_DESCRIPTION_SIZE) {
      setErrorMessage("Assignment description must be 10MB or smaller.");
      return;
    }

    setErrorMessage("");
    setDescriptionFile(file);
  };

  const validateSolution = (file) => {
    if (!file) {
      setSolutionFile(null);
      return;
    }

    if (!matchesType(file, SOLUTION_ALLOWED_TYPES)) {
      setErrorMessage("Solution must be a ZIP or PDF file.");
      return;
    }

    if (file.size > MAX_SOLUTION_SIZE) {
      setErrorMessage("Solution file must be 50MB or smaller.");
      return;
    }

    setErrorMessage("");
    setSolutionFile(file);
  };

  const handleSubmit = async () => {
    if (!descriptionFile || !solutionFile) {
      setErrorMessage("Please upload both assignment description and solution files.");
      return;
    }

    try {
      setErrorMessage("");
      setStatus("uploading");
      setStatusMessage("Uploading files...");

      navigate("/assignment/processing", {
        state: {
          submission: {
            descriptionFile,
            solutionFile,
            userId: userId || undefined,
          },
        },
      });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error?.message || "Failed to submit assignment. Please try again.");
    }
  };

  return (
    <PageLayout
      title="Technical Assignment"
      subtitle="Upload your completed homework for review"
      showBack
      backTo="/profile"
    >
      {userId && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/assignment/history")}
          >
            View History
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <UploadTile
          inputId="assignment-description-file"
          number="1"
          colorClass="bg-blue-600"
          title="Upload Assignment Description"
          subtitle="Upload the file describing the task you received"
          file={descriptionFile}
          onFileChange={validateDescription}
          accept=".pdf,.doc,.docx,.txt"
          disabled={isSubmitting}
          hint="PDF, DOC, DOCX, TXT (Max 10MB)"
        />

        <UploadTile
          inputId="assignment-solution-file"
          number="2"
          colorClass="bg-violet-600"
          title="Upload Your Solution"
          subtitle="Upload your completed work"
          file={solutionFile}
          onFileChange={validateSolution}
          accept=".zip,.pdf"
          disabled={isSubmitting}
          hint="ZIP or PDF (Max 50MB)"
        />

        <Card className="border-blue-100 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Ready to Submit?</h3>
          <p className="mb-3 text-xs text-gray-600">
            The AI will analyze your submission and provide detailed feedback.
          </p>

          {statusMessage ? <p className="mb-3 text-xs text-blue-700">{statusMessage}</p> : null}
          {errorMessage ? <p className="mb-3 text-xs text-red-600">{errorMessage}</p> : null}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/profile")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
