import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "ADENTU Cash Flow",
  description: "Flujo de caja para ADENTU Ingenieria SpA"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
