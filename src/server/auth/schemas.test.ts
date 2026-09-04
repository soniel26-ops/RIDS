import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  firstIssueMessage,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  roleSchema,
  testUserSchema,
} from "./schemas";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error?.issues[0]?.message;
}

describe("loginSchema (CA-9, CA-40)", () => {
  it("aceita e-mail e senha válidos e apara o e-mail", () => {
    const result = loginSchema.safeParse({ email: "  Ruben@Exemplo.com ", password: "x" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("Ruben@Exemplo.com");
  });

  it("rejeita e-mail vazio com a mensagem do campo", () => {
    const result = loginSchema.safeParse({ email: "", password: "x" });
    expect(firstMessage(result)).toBe("Informe o e-mail.");
  });

  it("rejeita e-mail inválido", () => {
    expect(firstMessage(loginSchema.safeParse({ email: "nao-e-email", password: "x" }))).toBe(
      "E-mail inválido.",
    );
  });

  it("rejeita senha vazia", () => {
    expect(firstMessage(loginSchema.safeParse({ email: "a@b.co", password: "" }))).toBe(
      "Informe a senha.",
    );
  });

  it("rejeita entradas gigantes sem lançar", () => {
    expect(
      loginSchema.safeParse({ email: "a".repeat(5000) + "@b.co", password: "x" }).success,
    ).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(5000) }).success).toBe(
      false,
    );
  });

  it("aceita next opcional", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x", next: "/conta" }).success).toBe(
      true,
    );
  });
});

describe("regras da nova senha (CA-20, CA-27)", () => {
  const base = { currentPassword: "atual" };

  it("recusa 9 caracteres com a indicação do mínimo", () => {
    const result = changePasswordSchema.safeParse({ ...base, newPassword: "123456789" });
    expect(firstMessage(result)).toBe("A senha deve ter pelo menos 10 caracteres.");
  });

  it("aceita exatamente 10 caracteres", () => {
    expect(changePasswordSchema.safeParse({ ...base, newPassword: "1234567890" }).success).toBe(
      true,
    );
  });

  it("espaços contam para o mínimo", () => {
    expect(changePasswordSchema.safeParse({ ...base, newPassword: "abcde     " }).success).toBe(
      true,
    );
  });
});

describe("forgotPasswordSchema", () => {
  it("só exige o e-mail", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(firstMessage(forgotPasswordSchema.safeParse({ email: "" }))).toBe("Informe o e-mail.");
  });
});

describe("resetPasswordSchema", () => {
  const token = "a".repeat(43);

  it("aceita token base64url de 43 caracteres", () => {
    expect(resetPasswordSchema.safeParse({ token, newPassword: "1234567890" }).success).toBe(true);
  });

  it("rejeita token com formato errado", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "curto", newPassword: "1234567890" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "a".repeat(42) + "=", newPassword: "1234567890" })
        .success,
    ).toBe(false);
  });
});

describe("roleSchema (CA-31)", () => {
  it("aceita só os três cargos", () => {
    for (const role of ["OWNER", "ADMIN", "MARKETING"]) {
      expect(roleSchema.safeParse(role).success).toBe(true);
    }
    expect(roleSchema.safeParse("X").success).toBe(false);
    expect(roleSchema.safeParse("owner").success).toBe(false);
  });
});

describe("testUserSchema", () => {
  it("usa OWNER como cargo default", () => {
    const result = testUserSchema.safeParse({ email: "a@b.co", password: "1234567890" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("OWNER");
  });

  it("recusa cargo fora da lista", () => {
    expect(
      testUserSchema.safeParse({ email: "a@b.co", password: "1234567890", role: "X" }).success,
    ).toBe(false);
  });
});

describe("firstIssueMessage", () => {
  it("devolve a mensagem do primeiro problema", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssueMessage(result.error)).toBe("Informe o e-mail.");
  });
});
