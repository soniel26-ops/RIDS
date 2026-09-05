import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("ignora maiúsculas e espaços nas pontas", () => {
    expect(normalizeEmail("  Ruben@Exemplo.com ")).toBe("ruben@exemplo.com");
  });

  it("não altera um e-mail já normalizado", () => {
    expect(normalizeEmail("ruben@exemplo.com")).toBe("ruben@exemplo.com");
  });
});
