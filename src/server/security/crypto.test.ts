import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

const KEY = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("cifra e decifra um token", () => {
    const token = "shpat_exemplo_nao_real_123";
    const encrypted = encryptSecret(token, KEY);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted, KEY)).toBe(token);
  });

  it("gera saídas diferentes para o mesmo valor (nonce aleatório)", () => {
    expect(encryptSecret("abc", KEY)).not.toBe(encryptSecret("abc", KEY));
  });

  it("recusa decifrar com outra chave", () => {
    const otherKey = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("abc", KEY);
    expect(() => decryptSecret(encrypted, otherKey)).toThrow();
  });

  it("recusa chave com tamanho errado", () => {
    expect(() => encryptSecret("abc", Buffer.from("curta").toString("base64"))).toThrow(/32 bytes/);
  });
});
