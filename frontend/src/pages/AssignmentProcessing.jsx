import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { getAssignment, uploadAssignment } from "../services/api";

const POLL_INTERVAL_MS = 3500;
const MAX_POLL_ATTEMPTS = 50;
const MIN_VISIBLE_MS = 1800;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusLabel(status) {
  switch (status) {
    case "uploading":
      return "Uploading files";
    case "pending":
      return "Submission received";
    case "scanning":
      return "Scanning files";
    case "processing":
      return "Running AI analysis";
    case "completed":
      return "Results ready";
    case "failed":
      return "Analysis failed";
    default:
      return "Preparing analysis";
  }
}

export default function AssignmentProcessing() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const initialSubmission = location.state?.submission;
  const [assignmentId, setAssignmentId] = useState(id || null);
  const [attempt, setAttempt] = useState(0);
  const [currentStatus, setCurrentStatus] = useState(id ? "pending" : "uploading");
  const [errorMessage, setErrorMessage] = useState("");
  // Guards against duplicate uploads from React StrictMode's double effect
  // invocation (dev) or fast remounts, which would otherwise create two
  // submissions for a single homework upload.
  const uploadStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function pollStatus() {
      let activeAssignmentId = assignmentId;

      if (!activeAssignmentId) {
        if (!initialSubmission?.descriptionFile || !initialSubmission?.solutionFile) {
          setErrorMessage("Missing submission data. Please submit again.");
          return;
        }

        // Only ever issue one upload. A concurrent effect run (StrictMode) bails
        // here; once the id is committed to state the effect re-runs and polls.
        if (uploadStartedRef.current) {
          return;
        }
        uploadStartedRef.current = true;

        try {
          setCurrentStatus("uploading");

          // Prefix names so backend categorization can reliably detect requirement vs solution.
          const normalizedDescription = new File(
            [initialSubmission.descriptionFile],
            `requirement-${initialSubmission.descriptionFile.name}`,
            { type: initialSubmission.descriptionFile.type }
          );
          const normalizedSolution = new File(
            [initialSubmission.solutionFile],
            `solution-${initialSubmission.solutionFile.name}`,
            { type: initialSubmission.solutionFile.type }
          );

          const uploadResult = await uploadAssignment({
            assignmentFiles: [normalizedDescription, normalizedSolution],
            userId: initialSubmission.userId,
            notes: initialSubmission.notes,
          });

          activeAssignmentId = uploadResult?.assignment?.id;
          if (!activeAssignmentId) {
            throw new Error(uploadResult?.assignmentError || "Upload succeeded but assignment ID was missing.");
          }

          setAssignmentId(activeAssignmentId);
          if (!cancelled) {
            navigate(`/assignment/${activeAssignmentId}/processing`, { replace: true });
          }
        } catch (error) {
          uploadStartedRef.current = false;
          if (cancelled) return;
          setErrorMessage(error?.message || "Upload failed. Please submit again.");
          return;
        }
      }

      for (let i = 1; i <= MAX_POLL_ATTEMPTS; i += 1) {
        if (cancelled) return;

        try {
          const response = await getAssignment(activeAssignmentId);
          const status = response?.assignment?.status || "pending";

          if (cancelled) return;

          setAttempt(i);
          setCurrentStatus(status);

          if (status === "completed") {
            const elapsed = Date.now() - startedAt;
            if (elapsed < MIN_VISIBLE_MS) {
              await wait(MIN_VISIBLE_MS - elapsed);
            }

            if (cancelled) return;
            navigate(`/assignment/${activeAssignmentId}/results`, { replace: true });
            return;
          }

          if (status === "failed") {
            setErrorMessage("Analysis failed. Please submit again with updated files.");
            return;
          }
        } catch (error) {
          if (cancelled) return;
          setErrorMessage(error?.message || "Failed to check analysis status.");
          return;
        }

        await wait(POLL_INTERVAL_MS);
      }

      if (!cancelled) {
        setErrorMessage("Analysis is taking longer than expected. You can check results again shortly.");
      }
    }

    pollStatus();

    return () => {
      cancelled = true;
    };
  }, [
    assignmentId,
    id,
    initialSubmission?.descriptionFile,
    initialSubmission?.notes,
    initialSubmission?.solutionFile,
    initialSubmission?.userId,
    navigate,
  ]);

  const progressPercent = useMemo(() => {
    if (currentStatus === "completed") return 100;
    if (currentStatus === "failed") return 100;
    if (currentStatus === "processing") return 75;
    if (currentStatus === "scanning") return 45;
    if (currentStatus === "pending") return 20;
    if (currentStatus === "uploading") return 10;
    return Math.min(95, Math.max(15, Math.round((attempt / MAX_POLL_ATTEMPTS) * 100)));
  }, [attempt, currentStatus]);

  return (
    <PageLayout title="Technical Assignment" subtitle="Analyzing your submission" showBack backTo="/assignment">
      <Card className="p-6">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

        <h2 className="text-center text-lg font-semibold text-gray-900">Working on your feedback</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {statusLabel(currentStatus)}. This usually takes 20-90 seconds.
        </p>

        <div className="mt-5 h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-2 text-center text-xs text-gray-500">
          Attempt {attempt}/{MAX_POLL_ATTEMPTS}
        </p>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/assignment")}>Submit Another</Button>
          <Button onClick={() => assignmentId && navigate(`/assignment/${assignmentId}/results`)} disabled={!assignmentId}>
            Try Results Page
          </Button>
        </div>
      </Card>
    </PageLayout>
  );
}
