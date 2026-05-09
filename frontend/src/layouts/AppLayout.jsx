import { Link } from "react-router-dom";

export default function AppLayout({ children }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 220, padding: 16, borderRight: "1px solid #ddd" }}>
        <h3>Menu</h3>
        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/profile">My Profile</Link>
          <Link to="/login">Login</Link>
        </nav>
      </aside>

      <div style={{ flex: 1 }}>
        <header style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
          <strong>Professional DNA</strong>
        </header>

        <main style={{ padding: 16 }}>{children}</main>
      </div>
    </div>
  );
}