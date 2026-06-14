import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";

function scoreColor(score) {
  if (score >= 80) return "bg-emerald-600 text-white";
  if (score >= 60) return "bg-amber-500 text-white";
  return "bg-rose-500 text-white";
}

function StarCard({ label, colorClass, section, actionExtras }) {
  if (!section) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white",
              colorClass,
            ].join(" ")}
          >
            {label[0]}
          </span>
          <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
        </div>
        <Badge className={scoreColor(section.score)}>{section.score}/100</Badge>
      </div>

      <Progress value={section.score} className="mt-2" />

      {section.text ? (
        <p className="mt-2 text-sm text-gray-700 italic">"{section.text}"</p>
      ) : null}

      {section.feedback ? (
        <p className="mt-2 text-xs text-gray-600">{section.feedback}</p>
      ) : null}

      {section.start != null && section.end != null ? (
        <p className="mt-1 text-[11px] text-gray-400">
          {section.start.toFixed(1)}s – {section.end.toFixed(1)}s
        </p>
      ) : null}

      {actionExtras}
    </Card>
  );
}

export default function StarAnalysisSection({ starAnalysis, candidateActionAssessment }) {
  if (!starAnalysis) return null;

  const { situation, task, action, result } = starAnalysis;

  const actionExtras = action ? (
    <div className="mt-3 space-y-2">
      {/* Team-only language warning */}
      {action.teamOnlyLanguageDetected ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Coaching tip: Your answer describes what the team did, but the interviewer needs to
          hear what you personally contributed. Try replacing "we" with "I" and describing your
          specific decisions and actions.
        </div>
      ) : action.candidateOwnedAction ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✓ Your answer clearly describes your personal contributions.
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-gray-900">STAR Analysis</h3>
      <p className="text-xs text-gray-500">
        How well your answer follows the Situation → Task → Action → Result structure.
      </p>

      <StarCard
        label="Situation"
        colorClass="bg-blue-500"
        section={situation}
      />
      <StarCard
        label="Task"
        colorClass="bg-violet-500"
        section={task}
      />
      <StarCard
        label="Action"
        colorClass="bg-orange-500"
        section={action}
        actionExtras={actionExtras}
      />
      <StarCard
        label="Result"
        colorClass="bg-emerald-500"
        section={result}
      />

      {/* Candidate action summary */}
      {candidateActionAssessment ? (
        <Card className="border-blue-100 bg-blue-50 p-4">
          <h4 className="text-sm font-semibold text-gray-900">Personal Ownership Score</h4>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-bold text-blue-700">
              {candidateActionAssessment.candidateOwnedActionScore}
            </span>
            <span className="text-sm text-gray-500">/ 100</span>
          </div>
          <Progress value={candidateActionAssessment.candidateOwnedActionScore} className="mt-2" />
          {candidateActionAssessment.feedback ? (
            <p className="mt-2 text-xs text-gray-600">{candidateActionAssessment.feedback}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {candidateActionAssessment.usesPersonalAgency ? (
              <Badge className="bg-emerald-100 text-emerald-700">Uses "I" language</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700">Heavy "we" usage</Badge>
            )}
            {candidateActionAssessment.teamLanguageDetected ? (
              <Badge className="bg-orange-100 text-orange-700">Team language detected</Badge>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
