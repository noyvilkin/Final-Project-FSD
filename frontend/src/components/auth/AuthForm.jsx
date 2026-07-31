import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../context/AuthContext";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function splitName(fullName) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
}

export default function AuthForm({ mode = "login" }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signUp, googleLogin } = useAuth();

  const redirectTo = location.state?.from?.pathname || "/profile";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [locationText, setLocationText] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const emailIsValid = useMemo(() => emailRegex.test(email.trim()), [email]);
  const passwordIsValid = useMemo(() => password.length >= 8, [password]);
  const passwordsMatch = useMemo(
    () => password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
    [confirmPassword, password]
  );

  const ageNumber = Number(age);
  const ageIsValid = Number.isInteger(ageNumber) && ageNumber >= 16 && ageNumber <= 100;
  const locationIsValid = locationText.trim().length >= 2;
  const fullNameIsValid = fullName.trim().length >= 2;

  const canSubmit =
    !isSubmitting &&
    emailIsValid &&
    passwordIsValid &&
    (!isSignup || (passwordsMatch && fullNameIsValid && ageIsValid && locationIsValid));

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      if (isSignup) {
        const { firstName, lastName } = splitName(fullName);
        await signUp({
          email: email.trim(),
          password,
          profile: {
            firstName,
            lastName,
          },
        });
      } else {
        await login({
          email: email.trim(),
          password,
        });
      }

      navigate(redirectTo, { replace: true });
    } catch (error) {
      setSubmitError(error?.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      setSubmitError("Google sign-in did not return a credential. Please try again.");
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    try {
      await googleLogin(credentialResponse.credential);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setSubmitError(error?.message || "Google sign-in failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleError() {
    setSubmitError("Google sign-in failed. Please try again.");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-blue-50 to-slate-200 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-300 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-3 text-slate-950">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-blue-600">
              <svg
                className="h-10 w-10"
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
            <span className="text-4xl font-bold tracking-tight sm:text-5xl">SkillUp</span>
          </Link>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {isSignup ? "Create Your Account" : "Welcome Back"}
          </h1>
          <p className="mt-2 text-base text-slate-600 sm:text-lg">
            {isSignup
              ? "Start tracking your career journey"
              : "Log in to continue your career journey"}
          </p>
        </div>

        {googleClientId ? (
          <div className="group relative mt-7 h-12 w-full">
            <div
              aria-hidden="true"
              className="pointer-events-none flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 transition group-hover:bg-blue-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
              <span>{isSignup ? "Sign up with Google" : "Continue with Google"}</span>
            </div>
            <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden opacity-0">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap={false}
                text={isSignup ? "signup_with" : "continue_with"}
                shape="rectangular"
                theme="outline"
                size="large"
                width="400"
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled
            title="Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in"
            className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-400 cursor-not-allowed"
          >
            <span className="text-base">G</span>
            {isSignup ? "Sign up with Google" : "Continue with Google"} (not configured)
          </button>
        )}

        <div className="my-7 flex items-center gap-3 text-sm text-slate-500">
          <span className="h-px flex-1 bg-slate-300" />
          <span>{isSignup ? "Or sign up with email" : "Or continue with email"}</span>
          <span className="h-px flex-1 bg-slate-300" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900">Email Address</label>
            <input
              className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            {email.length > 0 && (
              <p className={`mt-1 text-xs ${emailIsValid ? "text-emerald-700" : "text-red-700"}`}>
                {emailIsValid ? "Email looks valid." : "Enter a valid email address."}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-900">Password</label>
            <div className="relative">
              <input
                className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 pr-20 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {password.length > 0 && (
              <p className={`mt-1 text-xs ${passwordIsValid ? "text-emerald-700" : "text-red-700"}`}>
                {passwordIsValid
                  ? "Strong enough."
                  : "Password must be at least 8 characters."}
              </p>
            )}
          </div>

          {isSignup && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">Confirm Password</label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 pr-20 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="********"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p className={`mt-1 text-xs ${passwordsMatch ? "text-emerald-700" : "text-red-700"}`}>
                    {passwordsMatch ? "Passwords match." : "Passwords do not match."}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">Full Name</label>
                <input
                  className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">Age</label>
                <input
                  className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                  type="number"
                  min="16"
                  max="100"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  placeholder="25"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-900">Location</label>
                <input
                  className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500"
                  type="text"
                  value={locationText}
                  onChange={(event) => setLocationText(event.target.value)}
                  placeholder="New York, NY"
                  required
                />
              </div>
            </>
          )}

          {submitError ? <p className="text-sm font-medium text-red-700">{submitError}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 h-12 w-full rounded-xl bg-slate-950 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? "Please wait..." : isSignup ? "Sign Up" : "Log In"}
          </button>
        </form>

        <p className="mt-8 text-center text-base text-slate-600 sm:text-lg">
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <Link
            to={isSignup ? "/login" : "/signup"}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>

        <p className="mt-6 text-center">
          <Link to="/" className="text-slate-500 hover:text-slate-700">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}