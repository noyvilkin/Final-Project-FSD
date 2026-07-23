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
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[280px] flex-col border-r border-[#dde7f3] bg-white/95 px-4 py-5 shadow-[12px_0_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="flex items-center gap-3 px-2">
        <div className="relative h-11 w-11 shrink-0 text-[#2563eb]">
          <div className="absolute left-[13px] top-[3px] h-[13px] w-[18px] rounded-t-lg border-[3px] border-[#2563eb]" />
          <div className="absolute bottom-[3px] left-[5px] h-[30px] w-[34px] rounded-lg border-[3px] border-[#2563eb] bg-white" />
        </div>

        <h2 className="text-2xl font-black tracking-tight text-[#050816]">
          SkillUp
        </h2>
      </div>

      <div className="mt-9 space-y-1">
        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#94a3b8]">
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
                  ? "bg-gradient-to-r from-[#050816] to-[#111827] text-white shadow-sm"
                  : "text-[#64748b] hover:bg-[#eaf2fb] hover:text-[#111827]",
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

      <div className="mt-auto">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dde7f3] bg-white px-4 py-3 text-sm font-bold text-[#64748b] shadow-sm transition hover:bg-[#fee2e2] hover:text-[#b91c1c]"
        >
          <span className="text-2xl">🚪</span>
          Logout
        </button>
      </div>
    </aside>
  );
}