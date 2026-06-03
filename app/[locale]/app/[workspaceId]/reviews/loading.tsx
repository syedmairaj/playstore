export default function ReviewsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-md bg-zinc-800" />
        <div className="h-4 max-w-xl animate-pulse rounded-md bg-zinc-800/80" />
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-[#0c1018]/80"
          />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-48 animate-pulse rounded-md bg-zinc-800" />
        <div className="hidden h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-[#0c1018]/80 lg:block" />
        <div className="grid gap-4 lg:hidden">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-white/[0.06] bg-[#0c1018]/80"
            />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-56 animate-pulse rounded-md bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-[#0c1018]/80"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
