import { useRef, useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import AnalysisStatus from "./AnalysisStatus";
import AnalysisDashboard from "../dashboard/AnalysisDashboard";
import { uploadResume, pollAnalysisStatus } from "../../services/resumeService";

export default function ResumeUpload() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [analysisResult, setAnalysisResult] = useState(null);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
  }

  function handleChooseFile() {
    inputRef.current?.click();
  }

  function handleCancel() {
    setFile(null);
    setStatus("idle");
    setAnalysisResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleUpload() {
    if (!file) return;

    setStatus("uploading");

    try {
      await uploadResume(file);
      setStatus("processing");

      const analysisResponse = await pollAnalysisStatus();

      if (analysisResponse.status === "done") {
        setAnalysisResult(analysisResponse.result);
        setStatus("done");
      }
    } catch (error) {
      console.error(error);
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
              Upload your latest resume in PDF or Word format
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
              accept=".pdf,.doc,.docx"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="mt-4">
              <AnalysisStatus status={status} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>

        <Button
          onClick={handleUpload}
          disabled={!file || status === "uploading" || status === "processing"}
        >
          Upload & Analyze
        </Button>
      </div>

      {status === "done" && analysisResult && (
        <AnalysisDashboard
          skills={analysisResult.skills}
          experienceYears={analysisResult.experienceYears}
        />
      )}
    </div>
  );
}