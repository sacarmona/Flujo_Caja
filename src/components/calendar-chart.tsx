"use client";

import { useMemo, useState } from "react";
import { niceTicks, seriesExtremes, type CalendarChartPoint, type ChartSeriesKey } from "@/lib/calendar-chart";
import { formatCurrency } from "@/lib/format";

const WIDTH = 1000;
const HEIGHT = 360;
const MARGIN = { top: 24, right: 84, bottom: 40, left: 84 };

const SERIES: { key: ChartSeriesKey; label: string; color: string }[] = [
  { key: "income", label: "Ingresos totales", color: "#0f766e" },
  { key: "expense", label: "Gastos totales", color: "#b91c1c" },
  { key: "balance", label: "Saldo diario", color: "#0f5f8f" }
];

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function longDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

/**
 * Grafico diario del Calendario: Ingresos totales, Gastos totales y Saldo
 * diario como lineas, con sus minimos/maximos marcados. Ingresos y gastos son
 * flujos diarios (cientos de miles) y el saldo es un acumulado (millones), por
 * eso por defecto usan ejes separados (izquierda: flujos, derecha: saldo);
 * "Escala comun" los dibuja sobre un mismo eje para compararlos 1:1.
 */
export function CalendarChart({ points }: { points: CalendarChartPoint[] }) {
  const [visible, setVisible] = useState<Record<ChartSeriesKey, boolean>>({ income: true, expense: true, balance: true });
  const [commonScale, setCommonScale] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const model = useMemo(() => {
    const domainOf = (keys: ChartSeriesKey[], includeZero: boolean) => {
      const values = points.flatMap((point) => keys.map((key) => point[key]));
      let min = Math.min(...values, includeZero ? 0 : Infinity);
      let max = Math.max(...values, includeZero ? 0 : -Infinity);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        min = 0;
        max = 1;
      }
      if (min === max) max = min + 1;
      const ticks = niceTicks(min, max, 5);
      return { min: Math.min(min, ticks[0]), max: Math.max(max, ticks.at(-1) ?? max), ticks };
    };

    const flows = domainOf(["income", "expense"], true);
    const balance = domainOf(["balance"], false);
    const common = domainOf(["income", "expense", "balance"], true);
    return { flows, balance, common };
  }, [points]);

  const flowDomain = commonScale ? model.common : model.flows;
  const balanceDomain = commonScale ? model.common : model.balance;

  const x = (index: number) => MARGIN.left + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const yFor = (key: ChartSeriesKey, value: number) => {
    const domain = key === "balance" ? balanceDomain : flowDomain;
    return MARGIN.top + innerHeight - ((value - domain.min) / (domain.max - domain.min)) * innerHeight;
  };

  const extremes = useMemo(
    () => Object.fromEntries(SERIES.map(({ key }) => [key, seriesExtremes(points, key)])) as Record<ChartSeriesKey, ReturnType<typeof seriesExtremes>>,
    [points]
  );

  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No hay dias habiles en el rango para graficar.</p>;
  }

  const labelEvery = Math.max(1, Math.ceil(points.length / 14));
  const hoverPoint = hover !== null ? points[hover] : null;
  const balanceZeroY = balanceDomain.min < 0 && balanceDomain.max > 0 ? yFor("balance", 0) : null;

  function onMove(event: React.MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {SERIES.map(({ key, label, color }) => (
          <label className="inline-flex cursor-pointer items-center gap-2" key={key}>
            <input checked={visible[key]} onChange={() => setVisible((current) => ({ ...current, [key]: !current[key] }))} type="checkbox" />
            <span className="inline-block h-0.5 w-5" style={{ backgroundColor: color }} />
            {label}
          </label>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-slate-600">
          <input checked={commonScale} onChange={() => setCommonScale((current) => !current)} type="checkbox" />
          Escala comun (un solo eje)
        </label>
      </div>

      <div className="relative">
        <svg aria-label="Grafico diario de ingresos, gastos y saldo" className="w-full" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          {flowDomain.ticks.map((tick) => (
            <g key={`f${tick}`}>
              <line stroke="#e2e8f0" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yFor("income", tick)} y2={yFor("income", tick)} />
              <text fill="#475569" fontSize="11" textAnchor="end" x={MARGIN.left - 8} y={yFor("income", tick) + 4}>
                {compact(tick)}
              </text>
            </g>
          ))}
          {!commonScale
            ? balanceDomain.ticks.map((tick) => (
                <text fill="#0f5f8f" fontSize="11" key={`b${tick}`} x={WIDTH - MARGIN.right + 8} y={yFor("balance", tick) + 4}>
                  {compact(tick)}
                </text>
              ))
            : null}
          {balanceZeroY !== null && !commonScale ? (
            <line stroke="#0f5f8f" strokeDasharray="4 4" strokeOpacity="0.5" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={balanceZeroY} y2={balanceZeroY} />
          ) : null}

          {points.map((point, index) =>
            index % labelEvery === 0 ? (
              <text fill="#475569" fontSize="11" key={point.date} textAnchor="middle" x={x(index)} y={HEIGHT - MARGIN.bottom + 18}>
                {shortDate(point.date)}
              </text>
            ) : null
          )}

          {SERIES.filter(({ key }) => visible[key]).map(({ key, color }) => (
            <polyline
              fill="none"
              key={key}
              points={points.map((point, index) => `${x(index)},${yFor(key, point[key])}`).join(" ")}
              stroke={color}
              strokeLinejoin="round"
              strokeWidth="2"
            />
          ))}

          {SERIES.filter(({ key }) => visible[key]).flatMap(({ key, color }) => {
            const found = extremes[key];
            if (!found) return [];
            return (["max", "min"] as const).map((kind) => {
              const { index, value } = found[kind];
              return (
                <g key={`${key}-${kind}`}>
                  <circle cx={x(index)} cy={yFor(key, value)} fill="#fff" r="4.5" stroke={color} strokeWidth="2" />
                  <text
                    fill={color}
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                    x={Math.min(WIDTH - MARGIN.right - 20, Math.max(MARGIN.left + 20, x(index)))}
                    y={yFor(key, value) + (kind === "max" ? -10 : 18)}
                  >
                    {compact(value)}
                  </text>
                </g>
              );
            });
          })}

          {hover !== null ? <line stroke="#94a3b8" strokeDasharray="3 3" x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} /> : null}
          {hoverPoint
            ? SERIES.filter(({ key }) => visible[key]).map(({ key, color }) => (
                <circle cx={x(hover as number)} cy={yFor(key, hoverPoint[key])} fill={color} key={key} r="4" />
              ))
            : null}

          <rect
            fill="transparent"
            height={innerHeight}
            onMouseLeave={() => setHover(null)}
            onMouseMove={onMove}
            width={innerWidth}
            x={MARGIN.left}
            y={MARGIN.top}
          />
        </svg>

        {hoverPoint ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-md"
            style={{ left: `${Math.min(80, Math.max(2, (x(hover as number) / WIDTH) * 100 + 1))}%` }}
          >
            <p className="mb-1 font-semibold text-adentu-ink">{longDate(hoverPoint.date)}</p>
            {SERIES.filter(({ key }) => visible[key]).map(({ key, label, color }) => (
              <p className="flex justify-between gap-4" key={key} style={{ color }}>
                <span>{label}</span>
                <span className="font-semibold">{formatCurrency(hoverPoint[key])}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-adentu-mist text-left text-slate-600">
            <th className="px-3 py-2 font-semibold">Serie</th>
            <th className="px-3 py-2 font-semibold">Minimo</th>
            <th className="px-3 py-2 font-semibold">Maximo</th>
          </tr>
        </thead>
        <tbody>
          {SERIES.filter(({ key }) => visible[key]).map(({ key, label, color }) => {
            const found = extremes[key];
            if (!found) return null;
            return (
              <tr className="border-t border-slate-200" key={key}>
                <td className="px-3 py-2 font-medium" style={{ color }}>
                  {label}
                </td>
                <td className="px-3 py-2">
                  {formatCurrency(found.min.value)} <span className="text-slate-500">({longDate(points[found.min.index].date)})</span>
                </td>
                <td className="px-3 py-2">
                  {formatCurrency(found.max.value)} <span className="text-slate-500">({longDate(points[found.max.index].date)})</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
