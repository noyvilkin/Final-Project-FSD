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

  const lastRoleLabel = profileSummary?.lastRoleTitle || "Role not identified";
  const lastRoleCompany = profileSummary?.lastRoleCompany || "";

  return (
    <PageLayout title="My Profile" subtitle="Your professional DNA dashboard">
      <div className="space-y-5">
        <section className="rounded-[24px] border border-[#eadfd2] bg-gradient-to-r from-[#fffaf5] to-[#f8efe5] px-6 py-5 shadow-[0_8px_24px_rgba(62,39,24,0.05)]">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#a87545] text-xl font-bold text-white shadow-sm">
                {profileAnalysis?.candidateName?.[0] || "V"}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a98a6a]">
                  Professional DNA
                </p>

                <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[#24180f]">
                  {profileAnalysis?.candidateName || "Vered Ben David"}
                </h2>

                <p className="mt-1 truncate text-sm text-[#7a6f64]">
                  {profileAnalysis?.candidateEmail || "No email available yet"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="flex h-14 min-w-[190px] flex-col justify-center rounded-2xl border border-[#e4d3bf] bg-white/80 px-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a98a6a]">
                  Status
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#24180f]">
                  {hasAnalysis ? "Resume analyzed" : "Not uploaded yet"}
                </p>
              </div>

              <Link
                to="/resume-upload"
                className="inline-flex h-14 min-w-[220px] items-center justify-center rounded-2xl bg-[#8b5e34] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#744923]"
              >
                {hasAnalysis ? "Upload New Resume" : "Upload Resume"}
              </Link>
            </div>
          </div>
        </section>

        {isLoading ? (
          <Card>
            <p className="text-sm text-[#7a6f64]">Loading profile insights...</p>
          </Card>
        ) : !hasAnalysis ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid grid-cols-3 gap-4">
              <MetricCard title="Experience" icon="⏳">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-semibold leading-none text-[#8b5e34]">
                    {profileSummary?.totalYearsOfExperience ?? "—"}
                  </span>
                  <span className="pb-1 text-sm text-[#7a6f64]">Years</span>
                </div>

                <p className="mt-2 text-sm text-[#7a6f64]">
                  Based on your resume timeline
                </p>
              </MetricCard>

              <MetricCard title="Last Role" icon="💼">
                <div className="rounded-2xl border border-[#eadfd2] bg-[#f8f1e8] px-4 py-3">
                  <p className="text-base font-semibold leading-6 text-[#5f3b20]">
                    {lastRoleLabel}
                  </p>

                  {lastRoleCompany && (
                    <p className="mt-1 text-sm text-[#8b5e34]">
                      {lastRoleCompany}
                    </p>
                  )}
                </div>
              </MetricCard>

              <MetricCard title="Academic" icon="🎓">
                <p className="text-xl font-semibold text-[#8b5e34]">
                  {profileSummary?.hasDegree
                    ? "Degree Found"
                    : "Studies in Progress"}
                </p>

                <p className="mt-2 text-sm text-[#7a6f64]">
                  {profileSummary?.fieldOfStudy ||
                    "No academic field identified"}
                </p>
              </MetricCard>
            </section>

            <section className="grid grid-cols-[1.35fr_0.9fr] gap-5">
              <div className="space-y-5">
                <Card
                  title="Top Skills"
                  subtitle="Skills identified from your resume"
                >
                  {profileSummary?.topSkills?.length ? (
                    <div className="flex flex-wrap gap-2.5">
                      {profileSummary.topSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-[#e2cdb7] bg-[#f8efe4] px-3.5 py-2 text-sm font-medium text-[#7a4d27]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <EmptyText>No highlighted skills available yet.</EmptyText>
                  )}
                </Card>

                <Card
                  title="Recommended Courses"
                  subtitle="Suggested learning topics based on your profile"
                >
                  {profileSummary?.recommendedCourses?.length ? (
                    <div className="grid grid-cols-2 gap-3">
                      {profileSummary.recommendedCourses.map((course, index) => (
                        <div
                          key={course}
                          className="flex items-start gap-3 rounded-2xl border border-[#eadfd2] bg-gradient-to-r from-[#fffaf5] to-[#fcf4ea] px-4 py-3"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#a87545] text-xs font-semibold text-white">
                            {index + 1}
                          </div>

                          <p className="text-sm font-medium leading-5 text-[#24180f]">
                            {course}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyText>
                      No course recommendations available yet.
                    </EmptyText>
                  )}
                </Card>
              </div>

              <div className="space-y-5">
                <Card title="Profile Summary" subtitle="Analysis details">
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
                </Card>

                <Card title="Academic Background" subtitle="Education details">
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
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function MetricCard({ title, icon, children }) {
  return (
    <div className="rounded-[22px] border border-[#eadfd2] bg-[#fffdfb] p-5 shadow-[0_8px_22px_rgba(62,39,24,0.045)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#24180f]">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3e5d5] text-lg">
          {icon}
        </div>
      </div>

      <div className="mb-4 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#8b5e34] to-[#d6a77a]" />

      {children}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-[22px] border border-[#eadfd2] bg-[#fffdfb] p-5 shadow-[0_8px_22px_rgba(62,39,24,0.045)]">
      {title && (
        <div className="mb-4">
          <div className="mb-2 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#8b5e34] to-[#d6a77a]" />
          <h3 className="text-base font-semibold text-[#24180f]">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-sm text-[#7a6f64]">{subtitle}</p>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#f3eadf] py-2.5 last:border-b-0">
      <span className="text-sm text-[#7a6f64]">{label}</span>
      <span className="max-w-[220px] truncate text-right text-sm font-medium text-[#24180f]">
        {value}
      </span>
    </div>
  );
}

function EmptyText({ children }) {
  return <p className="text-sm text-[#7a6f64]">{children}</p>;
}

function EmptyState() {
  return (
    <section className="rounded-[22px] border border-dashed border-[#d6c5b2] bg-white/90 p-9 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8f1e8] text-2xl">
        📄
      </div>

      <h3 className="mt-4 text-xl font-semibold text-[#24180f]">
        No resume analysis yet
      </h3>

      <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-[#7a6f64]">
        Upload your resume to unlock AI-powered profile insights, highlighted
        skills, experience summary, and recommended courses.
      </p>

      <Link
        to="/resume-upload"
        className="mt-6 inline-flex items-center justify-center rounded-2xl border border-[#8b5e34] px-5 py-3 text-sm font-semibold text-[#8b5e34] transition hover:bg-[#8b5e34] hover:text-white"
      >
        Go to Resume Upload
      </Link>
    </section>
  );
}