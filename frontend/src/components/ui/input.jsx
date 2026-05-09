export function Input({ className = "", ...props }) {
  return (
    <input
      className={[
        "h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-200",
        className,
      ].join(" ")}
      {...props}
    />
  );
}