"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { QuickEditRow } from "@/app/app/movimientos/quick-edit-row";
import type { MovementWithRelations } from "@/app/app/movimientos/shared";

export type WeekGroup = {
  key: string;
  label: string;
  balanceText: string;
  items: MovementWithRelations[];
};

export function WeeklyMovementsTable({ canWrite, weeks }: { canWrite: boolean; weeks: WeekGroup[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
      <div className="flex justify-end gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
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
          {weeks.map((week) => {
            const isCollapsed = collapsed.has(week.key);
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
                  : week.items.map((movement) => <QuickEditRow canWrite={canWrite} key={movement.id} movement={movement} />)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
