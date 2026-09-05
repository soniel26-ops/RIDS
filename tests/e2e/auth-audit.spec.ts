/**
 * Auditoria sem tela (CA-39 a CA-43): os eventos são provocados de fora (API/tela) e o
 * registro é consultado por SQL, como faz o responsável técnico. Nunca lê `passwordHash`.
 */
import { expect, test } from "@playwright/test";
import {
  auditColumnNames,
  createTestUser,
  loginViaApi,
  loginViaApiOk,
  readAuditFor,
  readAuditRawFor,
  requestResetLink,
  sessionCookieValue,
  tokenFromResetPath,
  uniqueEmail,
  uniquePassword,
} from "./helpers/auth";

const ONE_MINUTE = 60_000;

test("CA-39: login bem-sucedido fica registrado com e-mail, momento e indicação de sucesso", async ({
  request,
}) => {
  const email = uniqueEmail("ca39");
  const password = uniquePassword("ca39");
  const user = await createTestUser(request, { email, password });

  const before = Date.now();
  await loginViaApiOk(request, `  ${email.toUpperCase()} `, password);
  const after = Date.now();

  const rows = await readAuditFor(email);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    event: "LOGIN_SUCCEEDED",
    email,
    userId: user.id,
    reason: null,
  });
  expect(rows[0].createdAtMs).toBeGreaterThanOrEqual(before - ONE_MINUTE);
  expect(rows[0].createdAtMs).toBeLessThanOrEqual(after + ONE_MINUTE);
});

test("CA-40: logins falhados (senha errada, e-mail desconhecido, limite) ficam registrados; CA-9 não", async ({
  request,
}) => {
  const email = uniqueEmail("ca40");
  const unknown = uniqueEmail("ca40-desconhecido");
  const password = uniquePassword("ca40");
  const user = await createTestUser(request, { email, password });

  // CA-9: campos vazios ou inválidos não chegam a ser uma tentativa.
  expect((await loginViaApi(request, "", "")).status()).toBe(400);
  expect((await loginViaApi(request, "nao-e-email", "abcdefghij")).status()).toBe(400);
  expect((await loginViaApi(request, email, "")).status()).toBe(400);
  expect(await readAuditFor(email)).toEqual([]);

  // Senha errada 5x, depois a 6.ª recusada pelo limite (com a senha certa).
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    expect((await loginViaApi(request, ` ${email.toUpperCase()}`, "errada-xyz-1")).status()).toBe(
      401,
    );
  }
  expect((await loginViaApi(request, email, password)).status()).toBe(429);

  const rows = await readAuditFor(email);
  expect(rows).toHaveLength(6);
  for (const row of rows.slice(0, 5)) {
    expect(row).toMatchObject({
      event: "LOGIN_FAILED",
      email,
      userId: user.id,
      reason: "INVALID_CREDENTIALS",
    });
  }
  expect(rows[5]).toMatchObject({ event: "LOGIN_FAILED", email, reason: "RATE_LIMITED" });
  for (let i = 1; i < rows.length; i += 1) {
    expect(rows[i].createdAtMs).toBeGreaterThanOrEqual(rows[i - 1].createdAtMs);
  }
  expect(new Set(rows.map((row) => row.id)).size).toBe(6);

  // E-mail desconhecido: registrado com o e-mail informado (normalizado) e sem userId.
  expect((await loginViaApi(request, unknown.toUpperCase(), "qualquer-senha")).status()).toBe(401);
  const unknownRows = await readAuditFor(unknown);
  expect(unknownRows).toHaveLength(1);
  expect(unknownRows[0]).toMatchObject({
    event: "LOGIN_FAILED",
    email: unknown,
    userId: null,
    reason: "INVALID_CREDENTIALS",
  });
});

test("CA-40 (caso extremo 'auditoria em série'): dez falhas seguidas geram dez entradas distintas", async ({
  request,
}) => {
  const email = uniqueEmail("ca40-serie");
  await createTestUser(request, { email, password: uniquePassword("serie") });
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await loginViaApi(request, email, `errada-${attempt}-serie`);
    expect([401, 429], `tentativa ${attempt}`).toContain(response.status());
  }
  const rows = await readAuditFor(email);
  expect(rows).toHaveLength(10);
  expect(rows.every((row) => row.event === "LOGIN_FAILED")).toBe(true);
  expect(rows.filter((row) => row.reason === "INVALID_CREDENTIALS")).toHaveLength(5);
  expect(rows.filter((row) => row.reason === "RATE_LIMITED")).toHaveLength(5);
  expect(new Set(rows.map((row) => row.id)).size).toBe(10);
});

test("CA-41: troca de senha autenticada fica registrada como troca", async ({ request }) => {
  const email = uniqueEmail("ca41");
  const password = uniquePassword("ca41");
  const user = await createTestUser(request, { email, password });
  await loginViaApiOk(request, email, password);

  const before = Date.now();
  const response = await request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: uniquePassword("ca41n") },
  });
  expect(response.status()).toBe(200);

  const rows = (await readAuditFor(email)).filter((row) => row.event === "PASSWORD_CHANGED");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ email, userId: user.id, reason: null });
  expect(rows[0].createdAtMs).toBeGreaterThanOrEqual(before - ONE_MINUTE);
  expect(rows[0].createdAtMs).toBeLessThanOrEqual(Date.now() + ONE_MINUTE);
  expect((await readAuditFor(email)).map((row) => row.event)).toEqual([
    "LOGIN_SUCCEEDED",
    "PASSWORD_CHANGED",
  ]);
});

test("CA-42: redefinição pelo link fica registrada como redefinição por 'esqueci a senha'", async ({
  request,
}) => {
  const email = uniqueEmail("ca42");
  const user = await createTestUser(request, { email, password: uniquePassword("ca42") });
  const token = tokenFromResetPath(await requestResetLink(request, email));

  const before = Date.now();
  const response = await request.post("/api/auth/reset-password", {
    data: { token, newPassword: uniquePassword("ca42n") },
  });
  expect(response.status()).toBe(200);

  const rows = await readAuditFor(email);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ event: "PASSWORD_RESET", email, userId: user.id, reason: null });
  expect(rows[0].createdAtMs).toBeGreaterThanOrEqual(before - ONE_MINUTE);
  expect(rows[0].createdAtMs).toBeLessThanOrEqual(Date.now() + ONE_MINUTE);
});

test("CA-43: o registro nunca guarda senha, link, código de redefinição nem sessão", async ({
  request,
}) => {
  const email = uniqueEmail("ca43");
  const initial = uniquePassword("ca43-inicial");
  const wrong = uniquePassword("ca43-errada");
  const changed = uniquePassword("ca43-trocada");
  const reset = uniquePassword("ca43-redefinida");
  await createTestUser(request, { email, password: initial });

  expect((await loginViaApi(request, email, wrong)).status()).toBe(401);
  const login = await loginViaApiOk(request, email, initial);
  const sessionToken = sessionCookieValue(
    login
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value),
  );
  expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const change = await request.post("/api/auth/change-password", {
    data: { currentPassword: initial, newPassword: changed },
  });
  expect(change.status()).toBe(200);

  const resetPath = await requestResetLink(request, email);
  const resetToken = tokenFromResetPath(resetPath);
  const resetResponse = await request.post("/api/auth/reset-password", {
    data: { token: resetToken, newPassword: reset },
  });
  expect(resetResponse.status()).toBe(200);

  const rows = await readAuditRawFor(email);
  expect(rows.map((row) => row.event)).toEqual([
    "LOGIN_FAILED",
    "LOGIN_SUCCEEDED",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET",
  ]);
  const serialized = JSON.stringify(rows);
  for (const secret of [initial, wrong, changed, reset, resetToken, sessionToken!, resetPath]) {
    expect(serialized).not.toContain(secret);
  }
  expect(serialized).not.toMatch(/redefinir-senha|rids_session|token=/);

  const columns = await auditColumnNames();
  expect(columns.sort()).toEqual(["createdAt", "email", "event", "id", "reason", "userId"]);
  expect(columns.join(",")).not.toMatch(/password|senha|token|cookie|session|ip|agent/i);
});
