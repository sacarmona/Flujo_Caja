import { PageHeader } from "@/components/page-header";
import React from "react";

type EmptyPageProps = {
  title: string;
  description: string;
};

export function EmptyPage({ title, description }: EmptyPageProps) {
  return (
    <section className="max-w-4xl">
      <PageHeader help={description} title={title} />
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Modulo pendiente de implementacion.
      </div>
    </section>
  );
}
