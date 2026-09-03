"use client";

import { useEffect, useState } from "react";
import type { ApiError, StoreSummary } from "@/shared/types";

export type StoresState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: StoreSummary[] };

/** Carrega as lojas de GET /api/stores. Contrato em src/shared/types.ts. */
export function useStores(): StoresState {
  const [state, setState] = useState<StoresState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stores", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiError | null;
          throw new Error(body?.error.message ?? "Não foi possível carregar as lojas.");
        }
        return (await response.json()) as StoreSummary[];
      })
      .then((stores) => setState({ status: "ready", stores }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Erro inesperado.",
        });
      });
    return () => controller.abort();
  }, []);

  return state;
}
