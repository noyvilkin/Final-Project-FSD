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
          className="inline-flex items-center gap-2 rounded-xl border border-[#eadfd2] bg-white/80 px-3.5 py-2 text-sm font-medium text-[#6b625a] shadow-sm transition hover:bg-[#f8f1e8] hover:text-[#24180f]"
        >
          <span className="text-base leading-none">←</span>
          <span>Back to Profile</span>
        </Link>

        <section className="rounded-[24px] border border-[#eadfd2] bg-[#fffdfb] p-6 shadow-[0_10px_28px_rgba(62,39,24,0.055)]">
          <div className="grid grid-cols-[0.8fr_1.2fr] gap-8">
            <div className="rounded-[22px] bg-gradient-to-br from-[#fffaf5] to-[#f5eadc] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a98a6a]">
                Resume Analysis
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#24180f]">
                Upload your resume
              </h1>

              <p className="mt-3 text-sm leading-6 text-[#7a6f64]">
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
    <div className="flex items-center gap-3 text-sm font-medium text-[#5f3b20]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8b5e34] text-xs text-white">
        ✓
      </span>
      {text}
    </div>
  );
}