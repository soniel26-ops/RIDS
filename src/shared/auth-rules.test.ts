import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_CODES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  RESET_TOKEN_PATTERN,
} from "./auth-rules";
import { AUTH_ERROR_MESSAGES } from "./types";

describe("auth-rules", () => {
  it("RESET_TOKEN_PATTERN aceita exatamente 43 caracteres base64url", () => {
    expect(RESET_TOKEN_PATTERN.test("a".repeat(43))).toBe(true);
    expect(RESET_TOKEN_PATTERN.test("Ab0-_".repeat(8) + "xyz")).toBe(true);
    expect(RESET_TOKEN_PATTERN.test("a".repeat(42))).toBe(false);
    expect(RESET_TOKEN_PATTERN.test("a".repeat(44))).toBe(false);
    expect(RESET_TOKEN_PATTERN.test("a".repeat(42) + "+")).toBe(false);
    expect(RESET_TOKEN_PATTERN.test("a".repeat(42) + "=")).toBe(false);
  });

  it("limites da senha e mensagem coerentes entre si", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(1024);
    expect(PASSWORD_TOO_SHORT_MESSAGE).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("AUTH_ERROR_CODES cobre VALIDATION_ERROR e todos os códigos com mensagem, sem repetir", () => {
    expect(AUTH_ERROR_CODES).toContain("VALIDATION_ERROR");
    for (const code of Object.keys(AUTH_ERROR_MESSAGES)) {
      expect(AUTH_ERROR_CODES).toContain(code);
    }
    expect(AUTH_ERROR_CODES).toHaveLength(Object.keys(AUTH_ERROR_MESSAGES).length + 1);
    expect(new Set(AUTH_ERROR_CODES).size).toBe(AUTH_ERROR_CODES.length);
  });
});
