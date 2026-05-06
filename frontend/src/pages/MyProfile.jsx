import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";

const API_BASE_URL = "http://localhost:4000";
const USER_ID = "123456789012345678901234";

export default function MyProfile() {
  const [profileAnalysis, setProfileAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProfileAnalysis() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/profile-analysis/${USER_ID}`
        );
        const data = await response.json();

        if (response.ok && data.success) {
          setProfileAnalysis(data.data || null);
        }
      } catch (error) {
        console.error("Failed to fetch profile analysis", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfileAnalysis();
  }, []);

  const profileSummary = profileAnalysis?.profileSummary || null;
  const hasAnalysis = !!profileAnalysis;

  const lastRoleLabel =
    profileSummary?.lastRoleTitle || "Role not identified";

  const lastRoleCompany =
    profileSummary?.lastRoleCompany || "";

  return (
    <PageLayout title="My Profile" subtitle="Your career preparation hub">
      <div className="min-h-screen bg-[#f6f7fb] px-4 pb-28 pt-6 md:px-8">
        <div className="mx-auto max-w-[1280px] space-y-6">
          <section className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#7c3aed] via-[#4f46e5] to-[#2563eb] p-6 text-white shadow-sm md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-bold">
                  {profileAnalysis?.candidateName?.[0] || "V"}
                </div>

                <div>
                  <p className="text-sm text-white/70">Professional DNA</p>
                  <h2 className="mt-1 text-2xl font-bold md:text-3xl">
                    {profileAnalysis?.candidateName || "Vered Ben David"}
                  </h2>
                  <p className="mt-1 text-sm text-white/80">
                    {profileAnalysis?.candidateEmail || "No email available yet"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Status
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {hasAnalysis ? "Resume analyzed" : "Resume not uploaded yet"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#111827]">
                  Resume Analysis
                </h3>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Upload your resume to keep your profile insights updated.
                </p>
              </div>

              <Link
                to="/resume-upload"
                className="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {hasAnalysis ? "Upload New Resume" : "Upload Resume"}
              </Link>
            </div>
          </section>

          {isLoading ? (
            <section className="rounded-[28px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
              <p className="text-sm text-[#6b7280]">
                Loading profile insights...
              </p>
            </section>
          ) : !hasAnalysis ? (
            <section className="rounded-[28px] border border-dashed border-[#d0d5dd] bg-white p-10 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f2f4f7] text-2xl">
                📄
              </div>

              <h3 className="mt-4 text-xl font-bold text-[#111827]">
                No resume analysis yet
              </h3>

              <p className="mx-auto mt-2 max-w-[560px] text-sm text-[#6b7280]">
                Upload your resume to unlock AI-powered profile insights,
                highlighted skills, experience summary, and recommended courses.
              </p>

              <Link
                to="/resume-upload"
                className="mt-6 inline-flex items-center justify-center rounded-2xl border border-black px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
              >
                Go to Resume Upload
              </Link>
            </section>
          ) : (
            <>
              <section className="space-y-4">
                <WideInsightCard
                  title="Years of Experience"
                  icon="⏳"
                  iconBg="bg-[#2563eb]"
                >
                  <div className="flex items-end gap-2">
                    <h3 className="text-5xl font-bold leading-none text-[#1d4ed8]">
                      {profileSummary?.totalYearsOfExperience ?? "—"}
                    </h3>
                    <span className="pb-2 text-base font-medium text-[#667085]">
                      Years
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-[#667085]">
                    Based on your resume timeline
                  </p>
                </WideInsightCard>

                <WideInsightCard
                  title="Last Role"
                  icon="💼"
                  iconBg="bg-[#039855]"
                >
                  <div className="rounded-2xl bg-[#ecfdf3] px-5 py-3">
                    <h3 className="text-lg font-semibold leading-7 text-[#065f46]">
                      {lastRoleLabel}
                    </h3>

                    {lastRoleCompany && (
                      <p className="mt-1 text-sm font-medium text-[#047857]">
                        {lastRoleCompany}
                      </p>
                    )}
                  </div>

                  <p className="mt-3 text-sm text-[#667085]">
                    Most recent role detected from your resume
                  </p>
                </WideInsightCard>

                <WideInsightCard
                  title="Academic Status"
                  icon="🎓"
                  iconBg="bg-[#7c3aed]"
                >
                  <h3 className="text-3xl font-bold text-[#6d28d9]">
  {profileSummary?.hasDegree
    ? "Degree Found"
    : "Studies in Progress"}
</h3>

<p className="mt-3 text-sm font-medium text-[#475467]">
  {profileSummary?.fieldOfStudy
    ? `Field of Study: ${profileSummary.fieldOfStudy}`
    : "No academic field identified"}
</p>
                </WideInsightCard>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <ProfileCard title="Academic Background">
                  <InfoRow
                    label="Field of study"
                    value={profileSummary?.fieldOfStudy || "Not available"}
                  />
                  <InfoRow
                    label="Institution"
                    value={profileSummary?.institution || "Not available"}
                  />
                  <InfoRow
                    label="Grade average"
                    value={
                      profileSummary?.gradeAverage != null
                        ? profileSummary.gradeAverage
                        : "Not available"
                    }
                  />
                </ProfileCard>

                <ProfileCard title="Profile Summary">
                  <InfoRow
                    label="Candidate name"
                    value={profileAnalysis?.candidateName || "Not available"}
                  />
                  <InfoRow
                    label="Email"
                    value={profileAnalysis?.candidateEmail || "Not available"}
                  />
                  <InfoRow
                    label="Analysis status"
                    value={profileAnalysis?.analysisStatus || "Unknown"}
                  />
                </ProfileCard>

                <ProfileCard title="Top Skills">
                  {profileSummary?.topSkills?.length ? (
                    <div className="flex flex-wrap gap-3">
                      {profileSummary.topSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-[#c7d7fe] bg-[#eef4ff] px-4 py-2 text-sm font-medium text-[#1d4ed8]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#6b7280]">
                      No highlighted skills available yet.
                    </p>
                  )}
                </ProfileCard>

                <ProfileCard title="Recommended Courses">
                  {profileSummary?.recommendedCourses?.length ? (
                    <div className="space-y-3">
                      {profileSummary.recommendedCourses.map((course, index) => (
                        <div
                          key={course}
                          className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] px-4 py-3"
                        >
                          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-white">
                            {index + 1}
                          </div>
                          <p className="text-sm font-medium text-[#111827]">
                            {course}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#6b7280]">
                      No course recommendations available yet.
                    </p>
                  )}
                </ProfileCard>
              </section>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

function WideInsightCard({ title, icon, iconBg, children }) {
  return (
    <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="w-full">
          <p className="text-lg font-bold text-[#111827]">{title}</p>
          <div className="mt-4">{children}</div>
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-sm ${iconBg}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ title, children }) {
  return (
    <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f2f4f7] py-3 last:border-b-0">
      <span className="text-sm text-[#6b7280]">{label}</span>
      <span className="text-right text-sm font-medium text-[#111827]">
        {value}
      </span>
    </div>
  );
}