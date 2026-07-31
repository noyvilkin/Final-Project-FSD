import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const steps = [
  {
    title: "1. Upload Your CV",
    description: "Submit your CV and let our AI analyze your skills and experience.",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
    iconPath: "M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5M5 16.5V18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.5",
  },
  {
    title: "2. Optimize Your CV",
    description: "Match your CV to specific job requirements and get improvement tips.",
    iconColor: "text-violet-600",
    iconBg: "bg-violet-100",
    iconPath: "M8 6h6l4 4v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm6 0v4h4",
  },
  {
    title: "3. Practice and Prepare",
    description: "Complete assignments and practice interviews with AI feedback.",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-100",
    iconPath: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z",
  },
  {
    title: "4. Land the Job",
    description: "Enter interviews confident and prepared for success.",
    iconColor: "text-orange-600",
    iconBg: "bg-orange-100",
    iconPath: "M7.5 12.5 10.5 15.5 16.5 9.5M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
  },
];

const preparationItems = [
  {
    title: "CV Analysis and Skills Assessment",
    description:
      "Discover your strongest skills and get personalized recommendations to close job-specific gaps.",
    color: "text-blue-600",
    iconPath: "M6 18h12M8 14V9m4 5V6m4 8v-3",
  },
  {
    title: "CV Improvement Tool",
    description:
      "Tailor your CV to specific jobs with AI-powered analysis and practical optimization suggestions.",
    color: "text-violet-600",
    iconPath: "M8 6h6l4 4v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm6 0v4h4",
  },
  {
    title: "Assignment Practice",
    description:
      "Submit assignments and receive detailed, structured feedback to improve your work quality.",
    color: "text-emerald-600",
    iconPath: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z",
  },
  {
    title: "Interview Simulation",
    description:
      "Practice interviews with AI analysis of your answers, structure, and communication style.",
    color: "text-orange-600",
    iconPath: "M12 5v14M5 12h14M7.8 7.8l8.4 8.4M16.2 7.8 7.8 16.2",
  },
];

export default function Home() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-100 via-blue-50 to-slate-200 text-slate-950">
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-72 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

      <header className="border-b border-slate-300 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600">
              <svg
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 7V6a3 3 0 0 1 6 0v1" />
                <path d="M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" />
                <path d="M4 13h16" />
              </svg>
            </span>
            <span className="text-2xl font-extrabold tracking-tight">SkillUp</span>
          </Link>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="px-4 py-2 text-sm font-semibold text-slate-800">
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-sm font-semibold text-slate-800">
                  Log In
                </Link>
                <Link
                  to="/signup"
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative mx-auto max-w-4xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pb-16 sm:pt-20">
          <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
            Ace Your Next Job Interview
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed text-slate-600">
            AI-powered platform to prepare you for success. Optimize your CV, practice interviews,
            and master assignments.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              to={isAuthenticated ? "/profile" : "/signup"}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-slate-950 px-8 text-lg font-bold text-white transition hover:bg-slate-800"
            >
              {isAuthenticated ? "Go to Dashboard" : "Get Started Free"}
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <h2 className="mb-8 text-center text-4xl font-bold tracking-tight">How It Works</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <article
                key={step.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${step.iconBg}`}>
                  <svg
                    className={`h-6 w-6 ${step.iconColor}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={step.iconPath} />
                  </svg>
                </div>
                <h3 className="mt-4 text-2xl font-bold leading-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
          <h2 className="mb-10 text-center text-4xl font-bold tracking-tight">
            Complete Interview Preparation
          </h2>

          <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
            {preparationItems.map((item) => (
              <article key={item.title} className="rounded-2xl bg-white/70 p-6 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start gap-4">
                  <svg
                    className={`mt-1 h-6 w-6 shrink-0 ${item.color}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={item.iconPath} />
                  </svg>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-lg leading-relaxed text-slate-600">{item.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}