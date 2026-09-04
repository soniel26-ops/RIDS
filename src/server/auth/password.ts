/**
 * Hash de senha com scrypt (node:crypto). Formato gravado:
 *   scrypt$N$r$p$<salt base64>$<hash base64>
 * Os parâmetros ficam no próprio hash para permitir subir o custo depois sem
 * invalidar contas existentes. Comparação em tempo constante.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** 64 MiB: o default (32 MiB) é igual ao consumo de N=2^15, r=8 e falharia. */
const MAX_MEM = 64 * 1024 * 1024;

/**
 * Hash real de uma senha aleatória descartada. Usado para verificar a senha
 * quando o e-mail não existe, para que o tempo de resposta seja equivalente (CA-8).
 */
export const DUMMY_PASSWORD_HASH =
  "scrypt$32768$8$1$7FV+RYUqMLyJtphNtiR+Og==$UjAMVzYxKg/Hx49lhE9juFqZF4jdfTg+hoc+klOVprUtMZsa2BA9rZqmFuRRq9ySHIOynGI3gXyYOb/Xd5qjMQ==";

function scryptAsync(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEM },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** false para hash malformado, sem lançar. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  const derived = await scryptAsync(password, salt, { N, r, p });
  return timingSafeEqual(derived, expected);
}
