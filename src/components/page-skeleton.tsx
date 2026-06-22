export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section className="max-w-5xl animate-pulse" role="status" aria-label="Cargando">
      <div className="border-b border-slate-200 pb-5">
        <div className="h-7 w-64 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-96 rounded bg-slate-100" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="h-24 rounded-lg border border-slate-200 bg-white p-5" key={index}>
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-28 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0" key={index}>
            <div className="h-3 w-1/4 rounded bg-slate-100" />
            <div className="h-3 w-1/6 rounded bg-slate-100" />
            <div className="ml-auto h-3 w-1/5 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
