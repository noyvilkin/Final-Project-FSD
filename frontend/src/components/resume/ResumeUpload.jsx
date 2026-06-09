import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnalysisStatus from "./AnalysisStatus";
import { useAuth } from "../../context/AuthContext";
import { apiConfig } from "../../services/api";

export default function ResumeUpload() {
  const { userId } = useAuth();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const isBusy =
    status === "uploading" ||
    status === "extracting" ||
    status === "processing" ||
    status === "finalizing";

  function handleDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];

    if (droppedFile) {
      setFile(droppedFile);
      setErrorMessage("");
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files[0];

    if (selectedFile) {
      setFile(selectedFile);
      setErrorMessage("");
    }
  }

  function handleChooseFile() {
    inputRef.current?.click();
  }

  function handleCancel() {
    setFile(null);
    setStatus("idle");
    setErrorMessage("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!file) return;

    if (!userId) {
      setErrorMessage("You need to be signed in to upload a resume.");
      return;
    }

    setErrorMessage("");
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", userId);

      await new Promise((resolve) => setTimeout(resolve, 700));
      setStatus("extracting");

      await new Promise((resolve) => setTimeout(resolve, 700));
      setStatus("processing");

      const response = await fetch(
        `${apiConfig.baseUrl}/api/profile-analysis/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Upload failed");
      }

      setStatus("finalizing");

      await new Promise((resolve) => setTimeout(resolve, 800));
      setStatus("done");

      setTimeout(() => {
        navigate("/profile");
      }, 900);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Something went wrong");
      setStatus("idle");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleChooseFile}
        className="flex min-h-[250px] w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[#cfe0f5] bg-[#f8fbff] px-6 py-8 text-center transition hover:border-[#4f7df3] hover:bg-[#eaf2fb]"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
          📄
        </div>

        <p className="mt-4 text-lg font-semibold text-[#111827]">
          {file ? file.name : "Choose or drop your PDF"}
        </p>

        <p className="mt-1 text-sm text-[#64748b]">
          {file
            ? "File selected and ready to analyze"
            : "Only PDF files are supported"}
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="mt-4">
        <AnalysisStatus status={status} />
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3 border-t border-[#eef4fb] pt-4">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex h-11 min-w-[130px] items-center justify-center rounded-2xl border border-[#dde7f3] bg-white px-5 text-sm font-semibold text-[#64748b] transition hover:bg-[#eaf2fb] hover:text-[#111827]"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isBusy}
          className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-2xl bg-[#050816] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827] disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:text-white/80"
        >
          {isBusy ? "Analyzing..." : "Upload & Analyze"}
        </button>
      </div>
    </div>
  );
}