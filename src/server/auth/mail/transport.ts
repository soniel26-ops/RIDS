/**
 * Transporte de e-mail. Dois modos, escolhidos por MAIL_TRANSPORT:
 *   captured — grava em Redis (dev e testes; lido por /api/dev/outbox). Default fora de produção.
 *   resend   — API REST do Resend com fetch nativo. Único aceito em produção.
 */
import { getRedisConnection } from "@/server/jobs/queue";
import { createCapturedTransport } from "./captured-transport";
import { createResendTransport } from "./resend-transport";

export type MailMessage = { to: string; subject: string; text: string };

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
  /** Verifica o serviço antes de decidir se há conta (tempo equalizado, CA-28/CA-30). */
  ping(): Promise<void>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definida.`);
  return value;
}

export function resolveMailTransportName(
  env: NodeJS.ProcessEnv = process.env,
): "captured" | "resend" {
  const production = env.NODE_ENV === "production";
  const configured = env.MAIL_TRANSPORT?.trim().toLowerCase();
  if (production) {
    if (configured && configured !== "resend") {
      throw new Error('MAIL_TRANSPORT em produção só aceita "resend".');
    }
    return "resend";
  }
  if (configured === "resend") return "resend";
  return "captured";
}

let instance: MailTransport | undefined;

export function getMailTransport(): MailTransport {
  if (instance) return instance;
  const name = resolveMailTransportName();
  if (name === "resend") {
    instance = createResendTransport({
      apiKey: requireEnv("RESEND_API_KEY"),
      from: requireEnv("MAIL_FROM"),
    });
  } else {
    // Conexão obtida só no primeiro uso: quem nunca envia e-mail não abre Redis por isto.
    // O timeout por comando (R-3) é aplicado dentro de createCapturedTransport.
    instance = createCapturedTransport({
      lpush: (key, value) => getRedisConnection().lpush(key, value),
      expire: (key, seconds) => getRedisConnection().expire(key, seconds),
    });
  }
  return instance;
}
