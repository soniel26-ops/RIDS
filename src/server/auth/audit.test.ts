import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuditLog, type AuditRepository } from "./audit";

const NOW = new Date("2026-09-04T12:00:00Z");

function fakeRepo(create = vi.fn(async () => ({}))) {
  const repo: AuditRepository & { authAuditLog: { create: typeof create } } = {
    authAuditLog: { create },
  };
  return repo;
}

afterEach(() => vi.restoreAllMocks());

describe("audit (CA-39 a CA-43)", () => {
  it("grava evento, e-mail, userId e o instante do relógio", async () => {
    const repo = fakeRepo();
    await createAuditLog(repo, () => NOW).record({
      event: "LOGIN_SUCCEEDED",
      email: "ruben@exemplo.com",
      userId: "u1",
    });
    expect(repo.authAuditLog.create).toHaveBeenCalledWith({
      data: {
        event: "LOGIN_SUCCEEDED",
        email: "ruben@exemplo.com",
        userId: "u1",
        reason: null,
        createdAt: NOW,
      },
    });
  });

  it("grava reason só em LOGIN_FAILED e userId null para e-mail desconhecido", async () => {
    const repo = fakeRepo();
    const audit = createAuditLog(repo, () => NOW);
    await audit.record({ event: "LOGIN_FAILED", email: "x@y.co", reason: "INVALID_CREDENTIALS" });
    await audit.record({
      event: "PASSWORD_CHANGED",
      email: "x@y.co",
      userId: "u1",
      reason: "RATE_LIMITED",
    });
    expect(repo.authAuditLog.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ reason: "INVALID_CREDENTIALS", userId: null }),
    });
    expect(repo.authAuditLog.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ reason: null }),
    });
  });

  it("os argumentos gravados nunca contêm senha, token ou cookie", async () => {
    const repo = fakeRepo();
    await createAuditLog(repo, () => NOW).record({
      event: "LOGIN_FAILED",
      email: "x@y.co",
      reason: "INVALID_CREDENTIALS",
    });
    const serialized = JSON.stringify(repo.authAuditLog.create.mock.calls);
    expect(serialized).not.toMatch(/password|senha|token|cookie|rids_session/i);
  });

  it("não propaga falha ao gravar e loga só a mensagem do erro", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = fakeRepo(
      vi.fn(async () => {
        throw new Error("conexão recusada");
      }),
    );
    await expect(
      createAuditLog(repo, () => NOW).record({
        event: "LOGIN_SUCCEEDED",
        email: "x@y.co",
        userId: "u1",
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("auditoria falhou", "conexão recusada");
    expect(JSON.stringify(error.mock.calls)).not.toContain("x@y.co");
  });
});
