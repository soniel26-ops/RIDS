/**
 * Limite de tempo para comandos externos (Redis). Toda chamada ao Redis fora do BullMQ
 * passa por aqui (briefing, R-3): a conexão usa `maxRetriesPerRequest: null`, por isso
 * um Redis pendurado deixaria o pedido sem resposta.
 */

/** Tempo máximo por comando Redis, em milissegundos. */
export const REDIS_COMMAND_TIMEOUT_MS = 2_000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`operação excedeu ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/** Rejeita com TimeoutError se a promessa não resolver em `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
