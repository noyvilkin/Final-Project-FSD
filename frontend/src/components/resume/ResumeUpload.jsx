import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import AnalysisStatus from "./AnalysisStatus";

const API_BASE_URL = "http://localhost:4000";

export default function ResumeUpload() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

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
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;

    setErrorMessage("");
    setStatus("uploading");

    try {
      const userId = "123456789012345678901234"; // להחליף אחר כך ב-userId אמיתי מהמערכת

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
    <div className="space-y-6">
      <Card className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="text-3xl">📄</div>

          <div className="flex-1">
            <h2 className="text-xl font-bold">Curriculum Vitae (CV)</h2>

            <p className="mt-2 text-gray-500">
              Upload your latest resume in PDF format for AI-powered profile
              analysis
            </p>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={handleChooseFile}
              className="mt-6 cursor-pointer rounded-xl bg-gray-100 px-4 py-3 text-gray-600 hover:bg-gray-200"
            >
              {file ? file.name : "No file selected — click to choose"}
            </div>

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
              <p className="mt-4 text-sm text-red-500">{errorMessage}</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>

        <Button
          onClick={handleUpload}
          disabled={
            !file ||
            status === "uploading" ||
            status === "extracting" ||
            status === "processing" ||
            status === "finalizing"
          }
        >
          Upload & Analyze
        </Button>
      </div>
    </div>
  );
}