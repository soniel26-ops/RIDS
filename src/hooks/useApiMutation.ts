"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type ApiErrorBody, type ApiResult } from "@/hooks/apiClient";

export type MutationState<TData> =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; data: TData }
  | { status: "error"; error: ApiErrorBody };

/**
 * POST em JSON para `path` com estado discriminado. Enquanto há um envio em curso, novos
 * `submit` devolvem a mesma promessa (sem duplo envio). `UNAUTHENTICATED` é tratado pelo
 * `apiFetch` (redireciona) e o estado fica em "submitting".
 */
export function useApiMutation<TBody, TData>(
  path: string,
): { state: MutationState<TData>; submit: (body: TBody) => Promise<ApiResult<TData>> } {
  const [state, setState] = useState<MutationState<TData>>({ status: "idle" });
  const inFlight = useRef<Promise<ApiResult<TData>> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = useCallback(
    (body: TBody): Promise<ApiResult<TData>> => {
      if (inFlight.current) return inFlight.current;
      setState({ status: "submitting" });
      const promise = apiFetch<TData>(path, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((result) => {
        inFlight.current = null;
        if (mounted.current) {
          setState(
            result.ok
              ? { status: "success", data: result.data }
              : { status: "error", error: result.error },
          );
        }
        return result;
      });
      inFlight.current = promise;
      return promise;
    },
    [path],
  );

  return { state, submit };
}
