import { useNavigate } from "react-router-dom";

export default function Header({
  title = "Professional",
  subtitle = "",
  showBack = false,
  right = null,
}) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {showBack && (
              <button
                onClick={() => navigate(-1)}
                className="mt-0.5 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                aria-label="Back"
                title="Back"
              >
                ←
              </button>
            )}

            <div>
              <div className="text-sm font-semibold text-gray-900">{title}</div>
              {subtitle ? (
                <div className="text-xs text-gray-500">{subtitle}</div>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">{right}</div>
        </div>
      </div>
    </header>
  );
}