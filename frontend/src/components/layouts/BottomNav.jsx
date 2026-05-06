import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const items = [
  {
    to: "/profile",
    label: "Profile",
    icon: "👤",
    description: "Your dashboard",
  },
  {
    to: "/cv",
    label: "CV Tips",
    icon: "✨",
    description: "Resume optimization",
  },
  {
    to: "/interview",
    label: "Interview",
    icon: "🎤",
    description: "Practice prep",
  },
  {
    to: "/assignment",
    label: "Assignment",
    icon: "📄",
    description: "Submit work",
  },
];

export default function BottomNav() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[280px] flex-col border-r border-[#eadfd2] bg-[#fffaf5]/95 px-4 py-5 shadow-[12px_0_40px_rgba(62,39,24,0.08)] backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8b5e34] to-[#d6a77a] text-base font-black text-white shadow-sm">
          DNA
        </div>

        <div>
          <h2 className="text-base font-bold tracking-tight text-[#24180f]">
            Professional DNA
          </h2>
          <p className="text-xs font-medium text-[#7a6f64]">
            Career preparation hub
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-1">
        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#b09a84]">
          Navigation
        </p>

        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-[#8b5e34] to-[#d6a77a] text-white shadow-sm"
                  : "text-[#6b625a] hover:bg-[#f4ece2] hover:text-[#24180f]",
              ].join(" ")
            }
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">
              {item.icon}
            </span>

            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="block truncate text-xs opacity-80">
                {item.description}
              </span>
            </span>
          </NavLink>
        ))}
      </div>

      <div className="mt-auto rounded-[24px] border border-[#eadfd2] bg-[#f8f1e8] p-3">
        <div className="mb-3 rounded-2xl border border-[#efe4d7] bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b09a84]">
            Status
          </p>
          <p className="mt-1 text-sm font-bold text-[#24180f]">
            Workspace active
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-[#6b625a] transition hover:bg-[#f6dfdf] hover:text-[#8f3d3d]"
        >
          <span className="text-2xl">🚪</span>
          Logout
        </button>
      </div>
    </aside>
  );
}