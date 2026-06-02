import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/layouts/PageLayout";
import { useAuth } from "../context/AuthContext";
import { apiConfig } from "../services/api";

export default function MyProfile() {
  const { userId, user } = useAuth();
  const [profileAnalysis, setProfileAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfileAnalysis(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchProfileAnalysis() {
      try {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/profile-analysis/${encodeURIComponent(userId)}`
        );
        const data = await response.json();

        if (cancelled) return;

        if (response.ok && data.success) {
          setProfileAnalysis(data.data || null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch profile analysis", error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    setIsLoading(true);
    fetchProfileAnalysis();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const profileSummary = profileAnalysis?.profileSummary || null;
  const hasAnalysis = !!profileAnalysis;

  const lastRoleLabel = profileSummary?.lastRoleTitle || "Role not identified";
  const lastRoleCompany = profileSummary?.lastRoleCompany || "";

  const accountFullName = [user?.firstName, user?.lastName]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
  const displayName =
    profileAnalysis?.candidateName ||
    accountFullName ||
    user?.email ||
    "Your Profile";
  const displayEmail =
    profileAnalysis?.candidateEmail || user?.email || "No email available yet";
  const displayInitial = (displayName?.trim()?.[0] || "?").toUpperCase();

  return (
    <PageLayout title="My Profile" subtitle="Your professional DNA dashboard">
      <div className="space-y-5">
        <section className="rounded-[24px] border border-[#dde7f3] bg-gradient-to-r from-white to-[#f1f6fc] px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#050816] text-xl font-bold text-white shadow-sm">
                {displayInitial}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4f7df3]">
                  Professional DNA
                </p>

                <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[#111827]">
                  {displayName}
                </h2>

                <p className="mt-1 truncate text-sm text-[#64748b]">
                  {displayEmail}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="flex h-14 min-w-[190px] flex-col justify-center rounded-2xl border border-[#dde7f3] bg-white/85 px-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                  Status
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#111827]">
                  {hasAnalysis ? "Resume analyzed" : "Not uploaded yet"}
                </p>
              </div>

              <Link
                to="/resume-upload"
                className="inline-flex h-14 min-w-[220px] items-center justify-center rounded-2xl bg-[#050816] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827]"
              >
                {hasAnalysis ? "Upload New Resume" : "Upload Resume"}
              </Link>
            </div>
          </div>
        </section>

        {isLoading ? (
          <Card>
            <p className="text-sm text-[#64748b]">Loading profile insights...</p>
          </Card>
        ) : !hasAnalysis ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid grid-cols-3 gap-4">
              <MetricCard title="Experience" icon="⏳">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-semibold leading-none text-[#050816]">
                    {profileSummary?.totalYearsOfExperience ?? "—"}
                  </span>
                  <span className="pb-1 text-sm text-[#64748b]">Years</span>
                </div>

                <p className="mt-2 text-sm text-[#64748b]">
                  Based on your resume timeline
                </p>
              </MetricCard>

              <MetricCard title="Last Role" icon="💼">
                <div className="rounded-2xl border border-[#dde7f3] bg-[#eaf2fb] px-4 py-3">
                  <p className="text-base font-semibold leading-6 text-[#111827]">
                    {lastRoleLabel}
                  </p>

                  {lastRoleCompany && (
                    <p className="mt-1 text-sm text-[#4f7df3]">
                      {lastRoleCompany}
                    </p>
                  )}
                </div>
              </MetricCard>

              <MetricCard title="Academic" icon="🎓">
                <p className="text-xl font-semibold text-[#050816]">
                  {profileSummary?.hasDegree
                    ? "Degree Found"
                    : "Studies in Progress"}
                </p>

                <p className="mt-2 text-sm text-[#64748b]">
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
                          className="rounded-full border border-[#cfe0f5] bg-[#eaf2fb] px-3.5 py-2 text-sm font-medium text-[#1e3a8a]"
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
                          className="flex items-start gap-3 rounded-2xl border border-[#dde7f3] bg-gradient-to-r from-white to-[#f1f6fc] px-4 py-3"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#050816] text-xs font-semibold text-white">
                            {index + 1}
                          </div>

                          <p className="text-sm font-medium leading-5 text-[#111827]">
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
    <div className="rounded-[22px] border border-[#dde7f3] bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.045)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eaf2fb] text-lg">
          {icon}
        </div>
      </div>

      <div className="mb-4 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#050816] to-[#4f7df3]" />

      {children}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-[22px] border border-[#dde7f3] bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.045)]">
      {title && (
        <div className="mb-4">
          <div className="mb-2 h-[3px] w-10 rounded-full bg-gradient-to-r from-[#050816] to-[#4f7df3]" />
          <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#eef4fb] py-2.5 last:border-b-0">
      <span className="text-sm text-[#64748b]">{label}</span>
      <span className="max-w-[220px] truncate text-right text-sm font-medium text-[#111827]">
        {value}
      </span>
    </div>
  );
}

function EmptyText({ children }) {
  return <p className="text-sm text-[#64748b]">{children}</p>;
}

function EmptyState() {
  return (
    <section className="rounded-[22px] border border-dashed border-[#cfe0f5] bg-white p-9 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eaf2fb] text-2xl">
        📄
      </div>

      <h3 className="mt-4 text-xl font-semibold text-[#111827]">
        No resume analysis yet
      </h3>

      <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-[#64748b]">
        Upload your resume to unlock AI-powered profile insights, highlighted
        skills, experience summary, and recommended courses.
      </p>

      <Link
        to="/resume-upload"
        className="mt-6 inline-flex items-center justify-center rounded-2xl border border-[#050816] px-5 py-3 text-sm font-semibold text-[#050816] transition hover:bg-[#050816] hover:text-white"
      >
        Go to Resume Upload
      </Link>
    </section>
  );
}