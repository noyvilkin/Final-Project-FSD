export default function AnalysisStatus({ status }) {
  if (status === "idle") return null;

  if (status === "uploading") {
    return <p className="text-sm text-gray-500">Uploading resume...</p>;
  }

  if (status === "processing") {
    return <p className="text-sm text-blue-600">Analyzing your resume...</p>;
  }

  if (status === "done") {
    return <p className="text-sm text-green-600">Analysis complete.</p>;
  }

  return null;
}