export function Button({
  className = "",
  variant = "default",
  size = "md",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    default: "bg-black text-white hover:opacity-90",
    outline: "border bg-white hover:bg-gray-50 text-gray-900",
    ghost: "hover:bg-gray-100 text-gray-900",
  };
  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
  };

  return (
    <button
      className={[base, variants[variant], sizes[size], className].join(" ")}
      {...props}
    />
  );
}