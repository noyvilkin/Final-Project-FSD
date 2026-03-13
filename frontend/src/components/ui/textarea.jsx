export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={[
        "min-h-[120px] w-full rounded-md border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200",
        className,
      ].join(" ")}
      {...props}
    />
  );
}