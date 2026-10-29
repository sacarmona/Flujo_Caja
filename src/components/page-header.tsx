import { CircleHelp } from "lucide-react";
import React from "react";

/**
 * Titulo de pagina con el texto explicativo en un tooltip (hover o foco con
 * teclado) junto a un simbolo de interrogacion, para no ocupar espacio
 * vertical en cada pestana.
 */
export function PageHeader({ title, help }: { title: string; help: string }) {
  return (
    <div className="border-b border-slate-200 pb-3">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-normal text-adentu-ink">{title}</h1>
        <span className="group relative inline-flex">
          <button
            aria-describedby="page-help"
            aria-label={`Ayuda: ${title}`}
            className="rounded-full text-slate-400 transition hover:text-adentu-blue focus-visible:text-adentu-blue focus-visible:outline-2 focus-visible:outline-adentu-blue"
            type="button"
          >
            <CircleHelp className="size-5" />
          </button>
          <span
            className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-80 max-w-[85vw] rounded-md bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
            id="page-help"
            role="tooltip"
          >
            {help}
          </span>
        </span>
      </div>
    </div>
  );
}
