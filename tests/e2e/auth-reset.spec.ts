/**
 * "Esqueci a senha" e redefinição pelo link (CA-24, CA-25, CA-28, CA-29, CA-34 a CA-36, CA-38).
 * O e-mail é lido na caixa capturada (/api/dev/outbox); o link é aberto pelo caminho relativo.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  MESSAGES,
  alertBox,
  SEEDED_STORE_DOMAINS,
  createTestUser,
  extractResetPath,
  loginViaApi,
  loginViaApiOk,
  readOutbox,
  requestResetLink,
  tokenFromResetPath,
  uniqueEmail,
  uniquePassword,
  waitForHydration,
} from "./helpers/auth";

async function submitNewPassword(page: Page, resetPath: string, newPassword: string) {
  await page.goto(resetPath);
  await expect(page.getByRole("heading", { name: "Definir nova senha" })).toBeVisible();
  await waitForHydration(page, "/api/auth/reset-password");
  await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
}

test("CA-24: pedir o link mostra a frase neutra e o e-mail chega com um link de redefinição", async ({
  page,
}) => {
  const email = uniqueEmail("ca24");
  await createTestUser(page.request, { email, password: uniquePassword("ca24") });

  await page.goto("/esqueci-senha");
  await expect(page.getByRole("heading", { name: "Esqueci a senha" })).toBeVisible();
  await waitForHydration(page, "/api/auth/forgot-password");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toHaveText(MESSAGES.forgotNeutral);
  await expect(page.getByLabel("E-mail")).toHaveValue("");

  const messages = await readOutbox(page.request, email);
  expect(messages).toHaveLength(1);
  expect(messages[0].to).toBe(email);
  expect(messages[0].subject).toBe(MESSAGES.resetEmailSubject);
  expect(messages[0].text).toMatch(/1 hora/);
  expect(messages[0].text).toMatch(/uma vez/);
  const resetPath = extractResetPath(messages[0].text);
  expect(tokenFromResetPath(resetPath)).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("CA-25: o link define a nova senha, deixa de funcionar e só a nova senha entra", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("ca25");
  const oldPassword = uniquePassword("ca25-antiga");
  const newPassword = uniquePassword("ca25-nova");
  await createTestUser(request, { email, password: oldPassword });
  const resetPath = await requestResetLink(request, email);

  await submitNewPassword(page, resetPath, newPassword);
  await expect(page).toHaveURL(/\/login\?motivo=senha_redefinida$/);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.passwordResetNotice);

  // O mesmo link, outra vez: recusado.
  await submitNewPassword(page, resetPath, uniquePassword("ca25-outra"));
  await expect(alertBox(page)).toContainText(MESSAGES.invalidResetToken);
  await expect(page.getByRole("link", { name: "Pedir um novo link" })).toBeVisible();

  expect((await loginViaApi(request, email, oldPassword)).status()).toBe(401);
  expect((await loginViaApi(request, email, newPassword)).status()).toBe(200);
});

test("CA-28: e-mail desconhecido recebe a mesma frase neutra, em tempo equivalente, sem e-mail", async ({
  page,
  request,
}) => {
  const known = uniqueEmail("ca28-existe");
  const unknown = uniqueEmail("ca28-nao-existe");
  await createTestUser(request, { email: known, password: uniquePassword("ca28") });

  await page.goto("/esqueci-senha");
  await waitForHydration(page, "/api/auth/forgot-password");
  await page.getByLabel("E-mail").fill(unknown);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toHaveText(MESSAGES.forgotNeutral);
  await expect(alertBox(page)).toHaveCount(0);
  expect(await readOutbox(request, unknown)).toEqual([]);

  // Tempo de resposta equivalente (o servidor equaliza em pelo menos 800 ms).
  const timed = async (email: string) => {
    const started = Date.now();
    const response = await request.post("/api/auth/forgot-password", { data: { email } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    return Date.now() - started;
  };
  const knownMs = await timed(known);
  const unknownMs = await timed(unknown);
  expect(knownMs).toBeGreaterThanOrEqual(750);
  expect(unknownMs).toBeGreaterThanOrEqual(750);
  expect(Math.abs(knownMs - unknownMs)).toBeLessThan(1500);
  expect(await readOutbox(request, unknown)).toEqual([]);
  expect(await readOutbox(request, known)).toHaveLength(1);
});

test("CA-29: link adulterado é recusado com a mensagem; a senha e as sessões não mudam", async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail("ca29");
  const password = uniquePassword("ca29");
  await createTestUser(request, { email, password });
  const device = await browser.newContext();
  await loginViaApiOk(device.request, email, password);

  const resetPath = await requestResetLink(request, email);
  const token = tokenFromResetPath(resetPath);
  const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
  const tampered = resetPath.replace(token, flipped);

  await submitNewPassword(page, tampered, uniquePassword("ca29-nova"));
  await expect(alertBox(page)).toContainText(MESSAGES.invalidResetToken);
  expect(await page.content()).not.toMatch(/prisma|stack|scrypt|sha256/i);
  await expect(page).toHaveURL(/\/redefinir-senha/);

  // Endereço com token truncado ou sem token: só a mensagem, sem formulário.
  await page.goto(`/redefinir-senha?token=${token.slice(0, 20)}`);
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidResetToken);
  await expect(page.getByLabel("Nova senha", { exact: true })).toHaveCount(0);
  await page.goto("/redefinir-senha");
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidResetToken);

  // Pela API, token com formato estranho e enorme também é controlado.
  const weird = await request.post("/api/auth/reset-password", {
    data: { token: "🔑".repeat(2000), newPassword: uniquePassword("w") },
  });
  expect(weird.status()).toBe(400);
  expect((await weird.json()).error.code).toBe("INVALID_RESET_TOKEN");

  expect((await loginViaApi(request, email, password)).status()).toBe(200);
  expect((await device.request.get("/api/stores")).status()).toBe(200);
  await device.close();
});

test("CA-34: o link só pode ser usado uma vez (o segundo uso é recusado)", async ({ request }) => {
  const email = uniqueEmail("ca34");
  await createTestUser(request, { email, password: uniquePassword("ca34") });
  const token = tokenFromResetPath(await requestResetLink(request, email));
  const first = uniquePassword("ca34-1");
  const second = uniquePassword("ca34-2");

  const firstUse = await request.post("/api/auth/reset-password", {
    data: { token, newPassword: first },
  });
  expect(firstUse.status()).toBe(200);
  expect(await firstUse.json()).toEqual({ ok: true });

  const secondUse = await request.post("/api/auth/reset-password", {
    data: { token, newPassword: second },
  });
  expect(secondUse.status()).toBe(400);
  expect(await secondUse.json()).toEqual({
    error: { code: "INVALID_RESET_TOKEN", message: MESSAGES.invalidResetToken },
  });

  expect((await loginViaApi(request, email, second)).status()).toBe(401);
  expect((await loginViaApi(request, email, first)).status()).toBe(200);
});

test("CA-35: só o último link pedido vale", async ({ page, request }) => {
  const email = uniqueEmail("ca35");
  await createTestUser(request, { email, password: uniquePassword("ca35") });
  const firstPath = await requestResetLink(request, email);
  const secondPath = await requestResetLink(request, email);
  expect(firstPath).not.toBe(secondPath);
  expect(await readOutbox(request, email)).toHaveLength(2);

  await submitNewPassword(page, firstPath, uniquePassword("ca35-a"));
  await expect(alertBox(page)).toContainText(MESSAGES.invalidResetToken);

  const finalPassword = uniquePassword("ca35-b");
  await submitNewPassword(page, secondPath, finalPassword);
  await expect(page).toHaveURL(/\/login\?motivo=senha_redefinida$/);
  expect((await loginViaApi(request, email, finalPassword)).status()).toBe(200);
});

test("CA-36: o 6.º pedido de link em 15 minutos é recusado, para e-mail existente e inexistente", async ({
  page,
  request,
}) => {
  const known = uniqueEmail("ca36-existe");
  const unknown = uniqueEmail("ca36-nao-existe");
  await createTestUser(request, { email: known, password: uniquePassword("ca36") });

  const fiveThenSixth = async (email: string) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request.post("/api/auth/forgot-password", { data: { email } });
      expect(response.status(), `${email} pedido ${attempt}`).toBe(200);
    }
    const sixth = await request.post("/api/auth/forgot-password", { data: { email } });
    expect(sixth.status(), `${email} 6.º pedido`).toBe(429);
    expect(await sixth.json()).toEqual({
      error: { code: "TOO_MANY_ATTEMPTS", message: MESSAGES.tooManyAttempts },
    });
  };
  // Em série (não em paralelo): o critério é "5 pedidos em 15 minutos", não simultaneidade, e o
  // daemon `prisma dev` (PGlite) usado neste ambiente não suporta conexões concorrentes (erro 08P01).
  await fiveThenSixth(known);
  await fiveThenSixth(unknown);

  expect(await readOutbox(request, known)).toHaveLength(5);
  expect(await readOutbox(request, unknown)).toEqual([]);

  // Na tela, a pessoa vê "aguarde e tente de novo".
  await page.goto("/esqueci-senha");
  await waitForHydration(page, "/api/auth/forgot-password");
  await page.getByLabel("E-mail").fill(known);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(alertBox(page)).toHaveText(MESSAGES.tooManyAttempts);
  expect(await readOutbox(request, known)).toHaveLength(5);
});

test("CA-38: redefinir pelo link termina as sessões em todos os dispositivos", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail("ca38");
  const password = uniquePassword("ca38");
  const newPassword = uniquePassword("ca38n");
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  await createTestUser(request, { email, password });
  await loginViaApiOk(deviceA.request, email, password);
  await loginViaApiOk(deviceB.request, email, password);
  const pageA = await deviceA.newPage();
  await pageA.goto("/");
  await expect(pageA.getByText(SEEDED_STORE_DOMAINS[0])).toBeVisible();

  // Um terceiro navegador (anónimo) conclui a redefinição.
  const resetter = await browser.newContext();
  const resetPage = await resetter.newPage();
  await submitNewPassword(resetPage, await requestResetLink(request, email), newPassword);
  await expect(resetPage).toHaveURL(/\/login\?motivo=senha_redefinida$/);
  expect((await resetter.request.get("/api/stores")).status()).toBe(401);

  // Dispositivo A: a próxima ação (abrir uma página) leva ao login com o aviso de CA-11.
  await pageA.goto("/");
  await expect(pageA).toHaveURL(/\/login\?motivo=sessao_expirada&next=%2F$/);
  await expect(pageA.getByRole("status")).toHaveText(MESSAGES.sessionExpired);
  await expect(alertBox(pageA)).toHaveCount(0);
  await expect(pageA.locator("body")).not.toContainText(SEEDED_STORE_DOMAINS[0]);

  // Dispositivo B: a próxima ação (o painel a pedir dados) recebe acesso negado.
  expect((await deviceB.request.get("/api/stores")).status()).toBe(401);
  expect((await deviceA.request.get("/api/stores")).status()).toBe(401);

  expect((await loginViaApi(deviceB.request, email, newPassword)).status()).toBe(200);
  await deviceA.close();
  await deviceB.close();
  await resetter.close();
});

test("caso extremo: link aberto em dois navegadores — o primeiro a concluir ganha", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail("dois-nav");
  await createTestUser(request, { email, password: uniquePassword("dn") });
  const resetPath = await requestResetLink(request, email);
  const first = await browser.newContext();
  const second = await browser.newContext();
  const firstPage = await first.newPage();
  const secondPage = await second.newPage();

  // Ambos com a página de nova senha aberta.
  await secondPage.goto(resetPath);
  await waitForHydration(secondPage, "/api/auth/reset-password");
  await expect(secondPage.getByLabel("Nova senha", { exact: true })).toBeVisible();

  const winner = uniquePassword("dn-1");
  await submitNewPassword(firstPage, resetPath, winner);
  await expect(firstPage).toHaveURL(/\/login\?motivo=senha_redefinida$/);

  const loser = uniquePassword("dn-2");
  await secondPage.getByLabel("Nova senha", { exact: true }).fill(loser);
  await secondPage.getByLabel("Confirmar nova senha", { exact: true }).fill(loser);
  await secondPage.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(alertBox(secondPage)).toContainText(MESSAGES.invalidResetToken);

  expect((await loginViaApi(request, email, loser)).status()).toBe(401);
  expect((await loginViaApi(request, email, winner)).status()).toBe(200);
  await first.close();
  await second.close();
});

test("caso extremo: link pedido e senha trocada entretanto deixa de valer", async ({ request }) => {
  const email = uniqueEmail("link-troca");
  const password = uniquePassword("lt");
  const changed = uniquePassword("lt-trocada");
  await createTestUser(request, { email, password });
  const token = tokenFromResetPath(await requestResetLink(request, email));

  await loginViaApiOk(request, email, password);
  const change = await request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: changed },
  });
  expect(change.status()).toBe(200);

  const reset = await request.post("/api/auth/reset-password", {
    data: { token, newPassword: uniquePassword("lt-desfazer") },
  });
  expect(reset.status()).toBe(400);
  expect((await reset.json()).error.code).toBe("INVALID_RESET_TOKEN");
  expect((await loginViaApi(request, email, changed)).status()).toBe(200);
});

test("caso extremo: redefinir pelo link zera a contagem de tentativas de login", async ({
  request,
}) => {
  const email = uniqueEmail("reset-zera");
  const password = uniquePassword("rz");
  const newPassword = uniquePassword("rz-nova");
  await createTestUser(request, { email, password });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    expect((await loginViaApi(request, email, `errada-${attempt}-abc`)).status()).toBe(401);
  }
  expect((await loginViaApi(request, email, password)).status()).toBe(429);

  const token = tokenFromResetPath(await requestResetLink(request, email));
  const reset = await request.post("/api/auth/reset-password", {
    data: { token, newPassword },
  });
  expect(reset.status()).toBe(200);
  expect((await loginViaApi(request, email, newPassword)).status()).toBe(200);
});

test("caso extremo: 'esqueci a senha' normaliza maiúsculas e espaços no e-mail", async ({
  request,
}) => {
  const email = uniqueEmail("forgot-norm");
  await createTestUser(request, { email, password: uniquePassword("fn") });
  const response = await request.post("/api/auth/forgot-password", {
    data: { email: `  ${email.toUpperCase()} ` },
  });
  expect(response.status()).toBe(200);
  const messages = await readOutbox(request, email);
  expect(messages).toHaveLength(1);
  expect(messages[0].to).toBe(email);
});

test("caso extremo: nova senha com 9 caracteres pelo link é recusada na tela e na API", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("reset-curta");
  const password = uniquePassword("rc");
  await createTestUser(request, { email, password });
  const resetPath = await requestResetLink(request, email);
  const calls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/reset-password")) calls.push(req.method());
  });

  await submitNewPassword(page, resetPath, "123456789");
  await expect(page.locator("#reset-new-password-error")).toHaveText(MESSAGES.passwordMin);
  expect(calls).toEqual([]);

  const api = await request.post("/api/auth/reset-password", {
    data: { token: tokenFromResetPath(resetPath), newPassword: "123456789" },
  });
  expect(api.status()).toBe(400);
  expect((await api.json()).error.message).toBe(MESSAGES.passwordMin);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});
