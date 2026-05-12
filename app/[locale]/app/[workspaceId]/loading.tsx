export default function WorkspaceLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-10">
      <div className="flex flex-col gap-4 border-b border-neutral-200/80 pb-6 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-neutral-200" />
          <div className="h-8 w-56 max-w-full rounded-lg bg-neutral-200" />
          <div className="h-4 w-72 max-w-full rounded bg-neutral-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded-xl bg-neutral-200" />
          <div className="h-10 w-28 rounded-xl bg-neutral-200" />
          <div className="h-10 w-24 rounded-xl bg-neutral-200" />
        </div>
      </div>
      <div className="h-48 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 sm:h-44" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-neutral-200" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-neutral-200" />
        <div className="h-64 rounded-2xl bg-neutral-200" />
      </div>
      <div className="h-40 rounded-2xl bg-neutral-200" />
    </div>
  );
}
