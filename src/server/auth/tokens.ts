/**
 * Tokens opacos (sessão e redefinição): 32 bytes aleatórios em base64url (43 chars).
 * No banco só existe o SHA-256 em hex; o token em claro vai para o cookie ou o e-mail.
 */
import { createHash, randomBytes } from "node:crypto";
import { TOKEN_PATTERN } from "./schemas";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isTokenFormat(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
