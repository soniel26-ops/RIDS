import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("gera hash no formato scrypt$N$r$p$salt$hash e não contém a senha", async () => {
    const hash = await hashPassword("minha-senha-forte");
    const parts = hash.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(parts.slice(1, 4)).toEqual(["32768", "8", "1"]);
    expect(hash).not.toContain("minha-senha-forte");
  });

  it("verifica a senha correta e recusa a errada", async () => {
    const hash = await hashPassword("minha-senha-forte");
    expect(await verifyPassword("minha-senha-forte", hash)).toBe(true);
    expect(await verifyPassword("minha-senha-fortE", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatório)", async () => {
    expect(await hashPassword("abc")).not.toBe(await hashPassword("abc"));
  });

  it("recusa hash malformado sem lançar", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$1$c2FsdA==$aGFzaA==")).toBe(false);
    expect(await verifyPassword("x", "scrypt$32768$8$1$c2FsdA==$curto")).toBe(false);
  });

  it("o hash de sacrifício é válido e não aceita senhas (CA-8)", async () => {
    expect(DUMMY_PASSWORD_HASH.split("$")).toHaveLength(6);
    expect(await verifyPassword("qualquer-coisa", DUMMY_PASSWORD_HASH)).toBe(false);
  });

  it("compara a senha exatamente como digitada (espaços contam)", async () => {
    const hash = await hashPassword("senha com espaco ");
    expect(await verifyPassword("senha com espaco", hash)).toBe(false);
    expect(await verifyPassword("senha com espaco ", hash)).toBe(true);
  });
});
