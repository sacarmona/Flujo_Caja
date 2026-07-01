"use client";

export default function ProveedoresError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-semibold">No se pudo completar la accion.</p>
      <p className="mt-1">{error.message || "Ocurrio un error inesperado."}</p>
      <button
        className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
        onClick={reset}
        type="button"
      >
        Volver a intentar
      </button>
    </div>
  );
}
