import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnalysisStatus from "./AnalysisStatus";

const API_BASE_URL = "http://localhost:4000";

export default function ResumeUpload() {
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

    setErrorMessage("");
    setStatus("uploading");

    try {
      const userId = "123456789012345678901234";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", userId);

      await new Promise((resolve) => setTimeout(resolve, 700));
      setStatus("extracting");

      await new Promise((resolve) => setTimeout(resolve, 700));
      setStatus("processing");

      const response = await fetch(
        `${API_BASE_URL}/api/profile-analysis/upload`,
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
        className="flex min-h-[250px] w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[#d6c5b2] bg-[#fffaf5] px-6 py-8 text-center transition hover:border-[#8b5e34] hover:bg-[#f8f1e8]"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
          📄
        </div>

        <p className="mt-4 text-lg font-semibold text-[#24180f]">
          {file ? file.name : "Choose or drop your PDF"}
        </p>

        <p className="mt-1 text-sm text-[#7a6f64]">
          {file ? "File selected and ready to analyze" : "Only PDF files are supported"}
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

      <div className="mt-5 flex justify-end gap-3 border-t border-[#f3eadf] pt-4">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex h-11 min-w-[130px] items-center justify-center rounded-2xl border border-[#eadfd2] bg-white px-5 text-sm font-semibold text-[#6b625a] transition hover:bg-[#f8f1e8] hover:text-[#24180f]"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || isBusy}
          className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-2xl bg-[#8b5e34] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#744923] disabled:cursor-not-allowed disabled:bg-[#c9b8a6] disabled:text-white/80"
        >
          {isBusy ? "Analyzing..." : "Upload & Analyze"}
        </button>
      </div>
    </div>
  );
}