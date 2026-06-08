import { cn } from "@/lib/utils";

/** Wordmark is "PlayStore" only (domain stays playstore.xyz in URLs & email). */
export function PlayStoreLogo({
  className,
  iconClassName,
  showText = true,
  size = "md",
  /** Play green mark per UI guide; default uses theme primary. */
  brand = "default",
}: {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  brand?: "default" | "play";
}) {
  const box =
    size === "sm"
      ? "h-7 w-7 rounded-lg"
      : size === "lg"
        ? "h-10 w-10 rounded-xl"
        : "h-8 w-8 rounded-xl";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center text-white shadow-md",
          brand === "play"
            ? "bg-gradient-to-br from-[#22C55E] to-[#16a34a] ring-1 ring-[#22C55E]/35"
            : "bg-gradient-to-br from-primary via-primary to-primary/85 ring-1 ring-primary/25 text-primary-foreground",
          box,
          iconClassName,
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[52%] w-[52%] fill-current" aria-hidden>
          <path d="M9 5.5v13L20 12 9 5.5Z" />
        </svg>
      </span>
      {showText ? (
        <span
          className={cn(
            "font-semibold tracking-tight",
            brand === "play" ? "text-white" : "text-foreground",
            size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base",
          )}
        >
          PlayStore
        </span>
      ) : null}
    </span>
  );
}
