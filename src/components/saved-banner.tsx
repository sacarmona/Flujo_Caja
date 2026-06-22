"use client";

import { CheckCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Banner de confirmacion para acciones de guardado. Las server actions
 * redirigen a la misma pagina con ?saved=1 (ver redirectSaved); este
 * componente lo detecta, muestra el aviso unos segundos y limpia el
 * parametro de la URL de inmediato para que no quede al recargar o volver
 * atras.
 */
export function SavedBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const saved = searchParams.get("saved") === "1";
  const [visible, setVisible] = useState(saved);

  useEffect(() => {
    if (!saved) return;
    setVisible(true);

    const params = new URLSearchParams(searchParams);
    params.delete("saved");
    const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(next, { scroll: false });

    const hideTimer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(hideTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800" role="status">
      <CheckCircle2 className="size-4" />
      Cambios guardados correctamente.
    </div>
  );
}
