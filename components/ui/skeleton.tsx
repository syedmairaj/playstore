import { cn } from "@/lib/utils";

/**
 * Skeleton — pulse-animation placeholder for content that is still loading.
 *
 * Designed for the dark canvas theme of this app:
 *   bg-zinc-800/60  — dark muted fill that reads clearly on #0c1018 cards
 *   animate-pulse   — Tailwind's built-in 2 s opacity cycle
 *
 * Usage:
 *   <Skeleton className="h-8 w-24" />
 *   <Skeleton className="h-4 w-full rounded-full" />
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-zinc-800/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
