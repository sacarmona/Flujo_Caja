"use client";

import { useActionState } from "react";
import { signInAction } from "./actions";

const initialState: { error: string } | void = undefined;

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string } | void, formData: FormData) => signInAction(formData),
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700" htmlFor="email">
        Correo electronico
      </label>
      <input
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-adentu-blue focus:ring-2 focus:ring-adentu-blue/20"
        id="email"
        name="email"
        placeholder="nombre@adentu.cl"
        required
        type="email"
        autoComplete="email"
      />

      <label className="block text-sm font-medium text-slate-700" htmlFor="password">
        Contrasena
      </label>
      <input
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-adentu-blue focus:ring-2 focus:ring-adentu-blue/20"
        id="password"
        name="password"
        required
        type="password"
        autoComplete="current-password"
      />

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        className="inline-flex w-full items-center justify-center rounded-md bg-adentu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-adentu-teal disabled:opacity-50"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
