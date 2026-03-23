import { Link } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import ResumeUpload from "../components/resume/ResumeUpload";

export default function ResumeUploadPage() {
  return (
    <PageLayout>
      <div className="min-h-screen bg-[#f6f7fb] px-4 pb-28 pt-8 md:px-8">
        <div className="mx-auto max-w-[1280px]">
          <Link
            to="/profile"
            className="inline-flex items-center gap-3 text-[18px] font-medium text-black"
          >
            <span className="text-[24px]">←</span>
            <span>Back to Profile</span>
          </Link>

          <div className="mt-10 text-center">
            <h1 className="text-[40px] font-bold tracking-[-0.02em] text-black md:text-[54px]">
              Upload Your Resume
            </h1>

            <p className="mx-auto mt-4 max-w-[760px] text-[20px] text-[#5b6777]">
              Upload your CV for AI-powered analysis and recommendations
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-[1300px]">
            <ResumeUpload />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}