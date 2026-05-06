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
    <div className="min-h-screen bg-transparent text-[#24180f]">
      {!noNav && <BottomNav />}

      <div className={noNav ? "" : "pl-[280px]"}>
        {!noHeader && (
          <Header
            title={title}
            subtitle={subtitle}
            showBack={showBack}
            right={right}
          />
        )}

        <main className="pb-10">
          <div className="w-full px-10 py-8 2xl:px-14">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}