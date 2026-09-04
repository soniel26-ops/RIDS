"use client";

import Link from "next/link";
import { type FormEvent } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { USER_ROLE_LABELS, type CurrentUser } from "@/shared/types";

/**
 * Cabeçalho do painel (CA-23): quem está autenticado, o cargo, "Alterar senha" e "Sair".
 * Recebe o usuário já resolvido pela página; por isso não tem estado vazio nem de erro.
 * "Sair" funciona sem JavaScript pelo formulário nativo; com JavaScript chama a API e
 * faz uma navegação completa para /login (mesmo se a API falhar, o cookie será rejeitado).
 */
export function PanelHeader({ user }: { user: CurrentUser }) {
  const { state, submit } = useApiMutation<Record<string, never>, undefined>("/api/auth/logout");
  const busy = state.status !== "idle" && state.status !== "error";

  async function onLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    await submit({});
    window.location.replace("/login");
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">RIDS</h1>
        <p className="text-zinc-500">Gestão das lojas Shopify</p>
      </div>
      <div className="flex flex-col items-end gap-1 text-sm">
        <p>
          <span className="font-medium">{user.email}</span>{" "}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {USER_ROLE_LABELS[user.role]}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <Link href="/conta/senha" className="text-zinc-600 underline dark:text-zinc-400">
            Alterar senha
          </Link>
          <form method="post" action="/api/auth/logout" onSubmit={onLogout}>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-60 dark:border-zinc-700"
            >
              {busy ? "A sair…" : "Sair"}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
