"use client";

import { AlertTriangle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Banner de error para acciones que no pueden usar el limite de error.tsx
 * de forma confiable (ej. <form action> con input type=file: el mensaje
 * real de un Error lanzado ahi puede llegar sanitizado/generico al cliente
 * en produccion). Las acciones redirigen a la misma pagina con
 * ?error=<mensaje> (ver redirectWithError); este componente lo detecta,
 * muestra el aviso y limpia el parametro de la URL de inmediato para que no
 * quede al recargar o volver atras.
 */
export function ErrorBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const error = searchParams.get("error");
  const [message, setMessage] = useState(error);

  useEffect(() => {
    if (!error) return;
    setMessage(error);

    const params = new URLSearchParams(searchParams);
    params.delete("error");
    const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (!message) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800" role="alert">
      <AlertTriangle className="size-4 shrink-0" />
      {message}
    </div>
  );
}
