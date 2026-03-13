import BottomNav from "./BottomNav";
import Header from "./Header";

export default function PageLayout({
  children,
  noNav = false,
  noHeader = false,
  title = "Professional DNA",
  subtitle = "",
  showBack = false,
  right = null,
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {!noHeader && (
        <Header
          title={title}
          subtitle={subtitle}
          showBack={showBack}
          right={right}
        />
      )}

      <main className={["py-4", noNav ? "pb-6" : "pb-20"].join(" ")}>
        <div className="mx-auto max-w-3xl px-4">{children}</div>
      </main>

      {!noNav && <BottomNav />}
    </div>
  );
}