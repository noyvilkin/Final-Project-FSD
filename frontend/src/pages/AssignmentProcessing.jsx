import { useEffect, useRef, useState } from "react";
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

// Ordered milestones that mirror the backend status machine
// (uploading/pending → scanning → processing → completed).
const STAGES = [
  { key: "upload", label: "Uploading & receiving files" },
  { key: "scan", label: "Scanning your code" },
  { key: "analyze", label: "Running AI analysis" },
  { key: "done", label: "Results ready" },
];

// Target width for each status. The bar only ever moves forward (see below).
const PROGRESS_BY_STATUS = {
  uploading: 12,
  pending: 28,
  scanning: 55,
  processing: 82,
  completed: 100,
};

function stageIndexForStatus(status) {
  switch (status) {
    case "completed":
      return 3;
    case "processing":
      return 2;
    case "scanning":
      return 1;
    default:
      return 0; // uploading, pending, or unknown
  }
}

function StepIcon({ state, index }) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (state === "done") {
    return <span className={`${base} bg-green-100 text-green-700`}>✓</span>;
  }
  if (state === "active") {
    return (
      <span className={`${base} bg-blue-100`}>
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
      </span>
    );
  }
  if (state === "error") {
    return <span className={`${base} bg-red-100 text-red-700`}>!</span>;
  }
  return <span className={`${base} bg-gray-100 text-gray-400`}>{index + 1}</span>;
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
            const serverReason = response?.assignment?.processingErrors?.[0];
            setErrorMessage(
              serverReason || "Analysis failed. Please submit again with updated files."
            );
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

  // Monotonic progress: the bar only ever advances, so it never jumps backward
  // even if a poll briefly reports an earlier status.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (currentStatus === "failed") return; // freeze the bar where it was
    const target = PROGRESS_BY_STATUS[currentStatus] ?? 0;
    setProgress((prev) => (target > prev ? target : prev));
  }, [currentStatus]);

  // Any error (upload failure, poll failure, timeout, or a backend "failed"
  // status) puts the UI into a terminal error state so the spinner stops and
  // the step that was in progress is marked as errored.
  const failed = currentStatus === "failed" || Boolean(errorMessage);
  const isComplete = currentStatus === "completed";
  const activeIndex = stageIndexForStatus(currentStatus);

  return (
    <PageLayout title="Technical Assignment" subtitle="Analyzing your submission" showBack backTo="/assignment">
      <Card className="p-6">
        <h2 className="text-center text-lg font-semibold text-gray-900">
          {failed ? "We hit a problem" : isComplete ? "All done!" : "Working on your feedback"}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {failed
            ? "Something went wrong — see details below."
            : `${statusLabel(currentStatus)}${isComplete ? "" : ". This usually takes 20-90 seconds."}`}
        </p>

        <div className="mt-5 h-2 w-full rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-red-500" : "bg-blue-600"}`}
            style={{ width: `${failed ? Math.max(progress, 8) : progress}%` }}
          />
        </div>

        <ol className="mt-6 space-y-3">
          {STAGES.map((stage, idx) => {
            let state;
            if (failed) {
              state = idx < activeIndex ? "done" : idx === activeIndex ? "error" : "todo";
            } else if (isComplete || idx < activeIndex) {
              state = "done";
            } else if (idx === activeIndex) {
              state = "active";
            } else {
              state = "todo";
            }

            return (
              <li key={stage.key} className="flex items-center gap-3">
                <StepIcon state={state} index={idx} />
                <span
                  className={[
                    "text-sm",
                    state === "active"
                      ? "font-semibold text-gray-900"
                      : state === "error"
                        ? "font-semibold text-red-700"
                        : state === "done"
                          ? "text-gray-700"
                          : "text-gray-400",
                  ].join(" ")}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>

        {!failed && !isComplete ? (
          <p className="mt-4 text-center text-xs text-gray-400">
            Checking status… ({attempt}/{MAX_POLL_ATTEMPTS})
          </p>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/assignment")}>Submit Another</Button>
          <Button onClick={() => assignmentId && navigate(`/assignment/${assignmentId}/results`)} disabled={!assignmentId}>
            Try Results Page
          </Button>
        </div>
      </Card>
    </PageLayout>
  );
}
