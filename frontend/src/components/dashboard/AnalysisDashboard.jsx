import { Card } from "../ui/card";

export default function AnalysisDashboard({ skills, experienceYears }) {
  return (
    <Card className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold">Analysis Results</h2>

      <div className="mt-6">
        <h3 className="text-lg font-semibold">Extracted Skills</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold">Years of Experience</h3>
        <p className="mt-2 text-gray-700">{experienceYears} years</p>
      </div>
    </Card>
  );
}