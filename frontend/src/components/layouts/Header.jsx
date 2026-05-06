import { useNavigate } from "react-router-dom";

export default function Header({
  title = "Professional DNA",
  subtitle = "",
  showBack = false,
  right = null,
}) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-[#eadfD2]/80 bg-[#fffaf5]/85 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-8 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#eadfD2] bg-white text-lg text-[#6b625a] shadow-sm transition hover:border-[#d6a77a] hover:bg-[#faf7f2]"
              aria-label="Back"
              title="Back"
            >
              ←
            </button>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-[#24180f]">
              {title}
            </h1>

            {subtitle ? (
              <p className="mt-0.5 truncate text-sm text-[#7a6f64]">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}