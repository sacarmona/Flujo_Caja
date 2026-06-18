import React from "react";

type EmptyPageProps = {
  title: string;
  description: string;
};

export function EmptyPage({ title, description }: EmptyPageProps) {
  return (
    <section className="max-w-4xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-normal text-adentu-ink">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Modulo pendiente de implementacion.
      </div>
    </section>
  );
}
