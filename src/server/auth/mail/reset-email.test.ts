import { describe, expect, it } from "vitest";
import { buildResetEmail, buildResetUrl, RESET_EMAIL_SUBJECT } from "./reset-email";

const TOKEN = "A".repeat(43);

describe("buildResetUrl", () => {
  it("usa http e APP_HOST fora de produção", () => {
    expect(buildResetUrl(TOKEN, { APP_HOST: "localhost:3000", NODE_ENV: "development" })).toBe(
      `http://localhost:3000/redefinir-senha?token=${TOKEN}`,
    );
  });

  it("usa https em produção e apara protocolo e barra final do APP_HOST", () => {
    expect(
      buildResetUrl(TOKEN, { APP_HOST: "https://rids.exemplo.com/", NODE_ENV: "production" }),
    ).toBe(`https://rids.exemplo.com/redefinir-senha?token=${TOKEN}`);
  });

  it("lança sem APP_HOST", () => {
    expect(() => buildResetUrl(TOKEN, { NODE_ENV: "development" })).toThrow(/APP_HOST/);
  });
});

describe("buildResetEmail", () => {
  const message = buildResetEmail({
    to: "ruben@exemplo.com",
    resetUrl: "http://localhost:3000/redefinir-senha?token=abc",
  });

  it("tem o assunto fixo e o link no texto", () => {
    expect(message.subject).toBe(RESET_EMAIL_SUBJECT);
    expect(message.subject).toBe("Redefinir a senha do RIDS");
    expect(message.to).toBe("ruben@exemplo.com");
    expect(message.text).toContain("http://localhost:3000/redefinir-senha?token=abc");
  });

  it("diz que vale 1 hora e uso único, sem hora absoluta", () => {
    expect(message.text).toMatch(/1 hora/);
    expect(message.text).toMatch(/uma vez/);
    expect(message.text).toMatch(/ignore/);
    expect(message.text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(message.text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
