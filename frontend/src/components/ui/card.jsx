export function Card({ className = "", ...props }) {
  return (
    <div
      className={["rounded-2xl border bg-white shadow-sm", className].join(" ")}
      {...props}
    />
  );
}