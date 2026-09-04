"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/hooks/apiClient";
import type { StoreSummary } from "@/shared/types";

export type StoresState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: StoreSummary[] };

/**
 * Carrega as lojas de GET /api/stores. Contrato em src/shared/types.ts.
 * Sessão inválida (401 UNAUTHENTICATED) → o apiFetch leva ao login e o estado fica
 * em "loading" (CA-11); os demais erros mostram a mensagem da API.
 */
export function useStores(): StoresState {
  const [state, setState] = useState<StoresState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<StoreSummary[]>("/api/stores", { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setState({ status: "ready", stores: result.data });
      } else {
        setState({ status: "error", message: result.error.message });
      }
    });
    return () => controller.abort();
  }, []);

  return state;
}
