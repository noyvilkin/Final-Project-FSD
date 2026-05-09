export function Progress({ value = 0, className = "" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={["h-2 w-full rounded-full bg-gray-200", className].join(" ")}>
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${v}%` }} />
    </div>
  );
}