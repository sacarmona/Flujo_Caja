import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Redirige de vuelta a la pagina desde donde se envio el formulario,
 * agregando ?saved=1 para que la pagina muestre el banner de confirmacion
 * (ver SavedBanner). Usa el header Referer -lo pone el navegador, no el
 * body del request- y solo confia en el si coincide con el host de la app,
 * para evitar un open redirect; si no esta disponible o no coincide, cae al
 * path fijo indicado.
 */
export async function redirectSaved(fallbackPath: string): Promise<never> {
  const requestHeaders = await headers();
  const referer = requestHeaders.get("referer");
  const host = requestHeaders.get("host");
  let target = fallbackPath;

  if (referer && host) {
    try {
      const url = new URL(referer);
      if (url.host === host) {
        target = `${url.pathname}${url.search}`;
      }
    } catch {
      // Referer malformado: se usa fallbackPath.
    }
  }

  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}saved=1`);
}
