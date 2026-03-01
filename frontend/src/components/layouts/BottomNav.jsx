import { NavLink } from "react-router-dom";

const items = [
  { to: "/profile", label: "Profile", icon: "👤" },
  { to: "/cv", label: "CV Tips", icon: "✨" },
  { to: "/interview", label: "Interview", icon: "🎤" },
  { to: "/assignment", label: "Assignment", icon: "📄" },
  { to: "/login", label: "Logout", icon: "🚪" },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t">
      <div className="mx-auto max-w-3xl flex justify-between px-4 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center text-xs ${
                isActive ? "text-blue-600 font-medium" : "text-gray-500"
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}