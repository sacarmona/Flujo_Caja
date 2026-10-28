"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { QuickEditRow } from "@/app/app/movimientos/quick-edit-row";
import { movementSearchFields, type MovementFormValues } from "@/app/app/movimientos/shared";
import { matchesSearch } from "@/lib/movement-search";

export type WeekGroup = {
  key: string;
  label: string;
  balanceText: string;
  items: MovementFormValues[];
};

export function WeeklyMovementsTable({
  canWrite,
  initialQuery,
  lateMovementIds,
  weeks
}: {
  canWrite: boolean;
  initialQuery: string;
  lateMovementIds: Set<string>;
  weeks: WeekGroup[];
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSearching, startSearch] = useTransition();
  const searching = query.trim() !== "";

  // Filtro inmediato sobre la pagina cargada (responde en cada tecla, respetando los
  // filtros aplicados) mas busqueda en el servidor con un pequeno retardo, para
  // encontrar coincidencias tambien en las demas paginas.
  const visibleWeeks = useMemo(() => {
    if (!searching) return weeks;
    return weeks
      .map((week) => ({ ...week, items: week.items.filter((movement) => matchesSearch(query, movementSearchFields(movement))) }))
      .filter((week) => week.items.length > 0);
  }, [weeks, query, searching]);
  const matchCount = visibleWeeks.reduce((sum, week) => sum + week.items.length, 0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === (searchParams.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      params.delete("page");
      startSearch(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searchParams, pathname, router]);

  function toggleWeek(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="relative mr-auto w-full max-w-sm">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Buscar en los movimientos listados"
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 bg-white py-1 pl-8 pr-8 text-sm focus:border-adentu-blue focus:outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar descripcion, cuenta, monto, estado..."
            type="search"
            value={query}
          />
          {searching ? (
            <button
              aria-label="Limpiar busqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              onClick={() => setQuery("")}
              type="button"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {searching ? (
          <span aria-live="polite" className="text-xs text-slate-500">
            {isSearching ? "Buscando en todas las paginas..." : `${matchCount} ${matchCount === 1 ? "coincidencia" : "coincidencias"} en esta pagina`}
          </span>
        ) : null}
        <button
          className="text-xs font-semibold text-adentu-blue hover:underline"
          onClick={() => setCollapsed(new Set())}
          type="button"
        >
          Expandir todo
        </button>
        <span className="text-xs text-slate-400">·</span>
        <button
          className="text-xs font-semibold text-adentu-blue hover:underline"
          onClick={() => setCollapsed(new Set(weeks.map((week) => week.key)))}
          type="button"
        >
          Contraer todo
        </button>
      </div>
      <table className="w-full text-left">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Descripcion</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Cuenta contable</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Ver</th>
          </tr>
        </thead>
        <tbody>
          {searching && visibleWeeks.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={7}>
                Ningun movimiento listado coincide con &ldquo;{query.trim()}&rdquo;.
              </td>
            </tr>
          ) : null}
          {visibleWeeks.map((week) => {
            const isCollapsed = !searching && collapsed.has(week.key);
            return (
              <Fragment key={week.key}>
                <tr className="bg-adentu-blue/5">
                  <td className="px-3 py-1.5 text-xs font-semibold text-adentu-blue" colSpan={6}>
                    <button className="inline-flex items-center gap-1" onClick={() => toggleWeek(week.key)} type="button">
                      {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      {week.label}
                      <span className="font-normal text-slate-500">({week.items.length})</span>
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs font-semibold text-adentu-blue">{week.balanceText}</td>
                </tr>
                {isCollapsed
                  ? null
                  : week.items.map((movement) => (
                      <QuickEditRow canWrite={canWrite} isLate={lateMovementIds.has(movement.id)} key={movement.id} movement={movement} />
                    ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
