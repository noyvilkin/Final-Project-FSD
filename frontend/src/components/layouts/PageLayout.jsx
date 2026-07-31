import BottomNav from "./BottomNav";
import Header from "./Header";

export default function PageLayout({
  children,
  noNav = false,
  noHeader = false,
  title = "Professional DNA",
  subtitle = "",
  showBack = false,
  backTo = null,
  right = null,
}) {
  return (
    <div className="min-h-screen bg-transparent text-[#111827]">
      {!noNav && <BottomNav />}

      <div className={noNav ? "" : "pl-[280px]"}>
        {!noHeader && (
          <Header
            title={title}
            subtitle={subtitle}
            showBack={showBack}
            backTo={backTo}
            right={right}
          />
        )}

        <main className="pb-10">
          <div className="mx-auto w-full max-w-[1480px] px-8 py-6 2xl:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}