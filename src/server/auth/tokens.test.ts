import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashToken, isTokenFormat } from "./tokens";

describe("tokens", () => {
  it("gera 43 caracteres base64url, diferentes a cada chamada", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashToken é determinístico, SHA-256 em hex, e não contém o token", () => {
    const token = generateOpaqueToken();
    const hash = hashToken(token);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token + "x")).not.toBe(hash);
  });

  it("isTokenFormat aceita só o formato exato", () => {
    expect(isTokenFormat(generateOpaqueToken())).toBe(true);
    expect(isTokenFormat("a".repeat(42))).toBe(false);
    expect(isTokenFormat("a".repeat(44))).toBe(false);
    expect(isTokenFormat("a".repeat(42) + "=")).toBe(false);
    expect(isTokenFormat(undefined)).toBe(false);
    expect(isTokenFormat(42)).toBe(false);
  });
});
