/**
 * Resend via API REST com fetch nativo (sem SDK, briefing R-6).
 *   send → POST https://api.resend.com/emails  { from, to, subject, text }
 *   ping → GET  https://api.resend.com/domains
 * Nenhum corpo de resposta ou destinatário vai para o log; só o status HTTP.
 */
import { z } from "zod";
import type { MailMessage, MailTransport } from "./transport";

const RESEND_BASE_URL = "https://api.resend.com";
const REQUEST_TIMEOUT_MS = 10_000;

const sendResponseSchema = z.object({ id: z.string().min(1) });

export function createResendTransport(opts: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): MailTransport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    async send(message: MailMessage) {
      const response = await fetchImpl(`${RESEND_BASE_URL}/emails`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: opts.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Resend respondeu ${response.status} ao enviar`);
      }
      const parsed = sendResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new Error("Resend devolveu uma resposta inesperada ao enviar");
      }
    },
    async ping() {
      const response = await fetchImpl(`${RESEND_BASE_URL}/domains`, {
        method: "GET",
        headers: { Authorization: headers.Authorization },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Resend respondeu ${response.status} na verificação`);
      }
    },
  };
}
