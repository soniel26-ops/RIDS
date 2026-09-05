import type { ReactNode } from "react";

/** Moldura das páginas públicas de autenticação (login, esqueci, redefinir). Server-friendly. */
export function AuthPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <p className="text-sm font-medium text-zinc-500">RIDS</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
