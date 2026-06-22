import Link from "next/link";
import React from "react";

type PaginationProps = {
  page: number;
  pages: number;
  buildHref: (page: number) => string;
};

/**
 * Ventana de numeros de pagina a mostrar: primera, ultima, y un rango
 * alrededor de la pagina actual, con "..." en los huecos. Evita listar
 * cientos de numeros cuando hay muchas paginas (ej. Bitacora con miles de
 * registros).
 */
function pageWindow(page: number, pages: number): (number | "ellipsis")[] {
  const window = 2;
  const items: (number | "ellipsis")[] = [];
  let lastShown = 0;

  for (let candidate = 1; candidate <= pages; candidate += 1) {
    const withinWindow = Math.abs(candidate - page) <= window;
    if (candidate === 1 || candidate === pages || withinWindow) {
      if (lastShown && candidate - lastShown > 1) {
        items.push("ellipsis");
      }
      items.push(candidate);
      lastShown = candidate;
    }
  }

  return items;
}

export function Pagination({ page, pages, buildHref }: PaginationProps) {
  if (pages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Paginacion" className="flex flex-wrap items-center gap-1">
      {page > 1 ? (
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" href={buildHref(page - 1)}>
          Anterior
        </Link>
      ) : null}
      {pageWindow(page, pages).map((item, index) =>
        item === "ellipsis" ? (
          <span className="px-1 text-sm text-slate-400" key={`ellipsis-${index}`}>
            …
          </span>
        ) : (
          <Link
            className={`rounded-md border px-3 py-2 text-sm ${
              item === page ? "border-adentu-blue bg-adentu-blue text-white" : "border-slate-300 text-slate-700 hover:border-adentu-blue"
            }`}
            href={buildHref(item)}
            key={item}
          >
            {item}
          </Link>
        )
      )}
      {page < pages ? (
        <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm" href={buildHref(page + 1)}>
          Siguiente
        </Link>
      ) : null}
    </nav>
  );
}
