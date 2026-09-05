"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false no servidor e durante a hidratação, true depois. Os formulários usam-no para ligar
 * `noValidate` só quando o JavaScript está ativo: sem JS o navegador valida
 * `required`/`type="email"`; com JS a validação é a nossa (mensagens de CA-9), sem o
 * navegador travar o envio antes.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
