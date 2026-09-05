"use client";

import { useStores } from "@/hooks/useStores";
import type { StoreSummary } from "@/shared/types";

export function StoreCard({ store }: { store: StoreSummary }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <p className="font-medium">{store.name}</p>
        <p className="text-sm text-zinc-500">{store.domain}</p>
      </div>
      <span
        className={
          store.isConnected
            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800"
            : "rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800"
        }
      >
        {store.isConnected ? "Conectada" : "Aguardando conexão"}
      </span>
    </li>
  );
}

export function StoreList() {
  const state = useStores();

  if (state.status === "loading") {
    return <p role="status">Carregando lojas…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-red-700">
        {state.message}
      </p>
    );
  }
  if (state.stores.length === 0) {
    return <p>Nenhuma loja registrada ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {state.stores.map((store) => (
        <StoreCard key={store.id} store={store} />
      ))}
    </ul>
  );
}
