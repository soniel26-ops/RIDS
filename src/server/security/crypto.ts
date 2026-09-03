/**
 * Cifra simétrica para segredos em repouso (tokens da Shopify, chaves de fornecedores).
 * AES-256-GCM com nonce aleatório por valor. Formato: base64(nonce | tag | ciphertext).
 *
 * A chave vem de ENCRYPTION_KEY (32 bytes em base64). Gere com:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(rawKey = process.env.ENCRYPTION_KEY): Buffer {
  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY não definida.");
  }
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64.");
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const key = loadKey(rawKey);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string, rawKey?: string): string {
  const key = loadKey(rawKey);
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("Valor cifrado inválido.");
  }
  const nonce = buffer.subarray(0, NONCE_BYTES);
  const tag = buffer.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
