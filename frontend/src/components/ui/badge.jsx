export function Badge({ className = "", ...props }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700",
        className,
      ].join(" ")}
      {...props}
    />
  );
}