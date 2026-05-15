import { Link } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import ResumeUpload from "../components/resume/ResumeUpload";

export default function ResumeUploadPage() {
  return (
    <PageLayout
      title="Upload Resume"
      subtitle="Update your profile with AI-powered resume analysis"
    >
      <div className="space-y-4">
        <Link
          to="/profile"
          className="inline-flex items-center gap-2 rounded-xl border border-[#dde7f3] bg-white/85 px-3.5 py-2 text-sm font-medium text-[#64748b] shadow-sm transition hover:bg-[#eaf2fb] hover:text-[#111827]"
        >
          <span className="text-base leading-none">←</span>
          <span>Back to Profile</span>
        </Link>

        <section className="rounded-[24px] border border-[#dde7f3] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.055)]">
          <div className="grid grid-cols-[0.8fr_1.2fr] gap-8">
            <div className="rounded-[22px] bg-gradient-to-br from-[#f8fbff] to-[#eaf2fb] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4f7df3]">
                Resume Analysis
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#111827]">
                Upload your resume
              </h1>

              <p className="mt-3 text-sm leading-6 text-[#64748b]">
                Upload a PDF resume and let the system extract your experience,
                skills, academic background, and learning recommendations.
              </p>

              <div className="mt-6 space-y-3">
                <FeatureLine text="PDF resume upload" />
                <FeatureLine text="AI profile analysis" />
                <FeatureLine text="Updated dashboard insights" />
              </div>
            </div>

            <ResumeUpload />
          </div>
        </section>
      </div>
    </PageLayout>
  );
}

function FeatureLine({ text }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-[#111827]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#050816] text-xs text-white">
        ✓
      </span>
      {text}
    </div>
  );
}