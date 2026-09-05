/**
 * Transporte "capturado" para desenvolvimento e aceitação: em vez de enviar, grava a
 * mensagem em Redis (LPUSH dev:outbox:<email normalizado>, EXPIRE 3600). Sem tabela.
 * Lido por GET /api/dev/outbox?to=<e-mail>.
 * Cada comando Redis tem timeout (R-3): estourado, `send` rejeita (o serviço responde
 * MAIL_UNAVAILABLE) e `readCapturedMessages` rejeita (a rota responde AUTH_UNAVAILABLE).
 */
import { normalizeEmail } from "../normalize";
import { REDIS_COMMAND_TIMEOUT_MS, withTimeout } from "../with-timeout";
import type { MailMessage, MailTransport } from "./transport";

export const OUTBOX_TTL_SECONDS = 3_600;

export interface CapturedMailStore {
  lpush(key: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface CapturedMailReader {
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export type CapturedMessage = { to: string; subject: string; text: string; createdAt: string };

export function outboxKey(to: string): string {
  return `dev:outbox:${normalizeEmail(to)}`;
}

export function createCapturedTransport(
  store: CapturedMailStore,
  now: () => Date = () => new Date(),
  timeoutMs: number = REDIS_COMMAND_TIMEOUT_MS,
): MailTransport {
  return {
    async send(message: MailMessage) {
      const captured: CapturedMessage = {
        to: message.to,
        subject: message.subject,
        text: message.text,
        createdAt: now().toISOString(),
      };
      const key = outboxKey(message.to);
      await withTimeout(store.lpush(key, JSON.stringify(captured)), timeoutMs);
      await withTimeout(store.expire(key, OUTBOX_TTL_SECONDS), timeoutMs);
    },
    async ping() {
      // Sem serviço externo: nada a verificar.
    },
  };
}

/** Mensagens capturadas para o destinatário, mais recente primeiro. */
export async function readCapturedMessages(
  reader: CapturedMailReader,
  to: string,
  timeoutMs: number = REDIS_COMMAND_TIMEOUT_MS,
): Promise<CapturedMessage[]> {
  const raw = await withTimeout(reader.lrange(outboxKey(to), 0, -1), timeoutMs);
  const messages: CapturedMessage[] = [];
  for (const item of raw) {
    try {
      const parsed = JSON.parse(item) as Partial<CapturedMessage>;
      if (
        typeof parsed.to === "string" &&
        typeof parsed.subject === "string" &&
        typeof parsed.text === "string" &&
        typeof parsed.createdAt === "string"
      ) {
        messages.push({
          to: parsed.to,
          subject: parsed.subject,
          text: parsed.text,
          createdAt: parsed.createdAt,
        });
      }
    } catch {
      // entrada corrompida: ignorada
    }
  }
  return messages;
}
