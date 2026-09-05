/**
 * Trocar a própria senha estando autenticada (CA-20, CA-22, CA-26, CA-27, CA-37 e casos extremos).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  MESSAGES,
  alertBox,
  createTestUser,
  loginViaApi,
  loginViaApiOk,
  loginViaPage,
  uniqueEmail,
  uniquePassword,
  waitForHydration,
} from "./helpers/auth";

async function openChangePassword(page: Page): Promise<void> {
  await page.goto("/conta/senha");
  await expect(page.getByRole("heading", { name: "Alterar a senha" })).toBeVisible();
  await waitForHydration(page, "/api/auth/change-password");
}

async function submitChangePassword(
  page: Page,
  current: string,
  next: string,
  confirm = next,
): Promise<void> {
  await page.getByLabel("Senha atual", { exact: true }).fill(current);
  await page.getByLabel("Nova senha", { exact: true }).fill(next);
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill(confirm);
  await page.getByRole("button", { name: "Alterar senha" }).click();
}

test("CA-22: trocar a senha confirma, mantém a sessão e só a nova senha passa a entrar", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("ca22");
  const oldPassword = uniquePassword("ca22-antiga");
  const newPassword = uniquePassword("ca22-nova");
  await createTestUser(page.request, { email, password: oldPassword });
  await loginViaPage(page, email, oldPassword);

  await openChangePassword(page);
  await submitChangePassword(page, oldPassword, newPassword);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.passwordChanged);
  await expect(page).toHaveURL(/\/conta\/senha$/);
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue("");

  // Continua autenticada no mesmo dispositivo.
  expect((await page.request.get("/api/stores")).status()).toBe(200);
  await page.goto("/");
  await expect(page.locator("header").getByText(email)).toBeVisible();

  // Noutro navegador: a antiga é recusada com a mensagem de CA-7; a nova entra.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginViaPage(otherPage, email, oldPassword);
  await expect(alertBox(otherPage)).toHaveText(MESSAGES.invalidCredentials);
  await loginViaPage(otherPage, email, newPassword);
  await expect(otherPage).toHaveURL(/\/$/);
  await other.close();
});

test("CA-26: senha atual errada não muda nada, mostra a mensagem e mantém a sessão", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("ca26");
  const password = uniquePassword("ca26");
  const attempted = uniquePassword("ca26-tentada");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);

  await openChangePassword(page);
  await submitChangePassword(page, `${password}-errada`, attempted);
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidCurrentPassword);
  await expect(page.getByRole("status")).toHaveCount(0);

  expect((await page.request.get("/api/stores")).status()).toBe(200);
  expect((await loginViaApi(request, email, attempted)).status()).toBe(401);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("CA-26/CA-18: erros de senha atual somam-se ao limite de tentativas de login", async ({
  request,
  browser,
}) => {
  const email = uniqueEmail("ca26-limite");
  const password = uniquePassword("ca26l");
  await createTestUser(request, { email, password });
  await loginViaApiOk(request, email, password);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request.post("/api/auth/change-password", {
      data: { currentPassword: `errada-${attempt}-xyz`, newPassword: uniquePassword("n") },
    });
    expect(response.status(), `erro de senha atual ${attempt}`).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_CURRENT_PASSWORD");
  }

  // 6.ª: a própria troca é recusada por limite...
  const sixth = await request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: uniquePassword("n6") },
  });
  expect(sixth.status()).toBe(429);

  // ...e o login noutro dispositivo também, mesmo com a senha certa.
  const other = await browser.newContext();
  const blocked = await loginViaApi(other.request, email, password);
  expect(blocked.status()).toBe(429);
  expect((await blocked.json()).error.message).toBe(MESSAGES.tooManyAttempts);
  await other.close();
});

test("CA-27: nova senha com menos de 10 caracteres é recusada e a atual continua válida", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("ca27");
  const password = uniquePassword("ca27");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);

  const apiCalls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/auth/change-password")) apiCalls.push(req.method());
  });

  await openChangePassword(page);
  await submitChangePassword(page, password, "123456789");
  await expect(page.locator("#change-new-password-error")).toHaveText(MESSAGES.passwordMin);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(apiCalls).toEqual([]);

  // Pela API, a mesma regra vale no servidor.
  const response = await page.request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: "123456789" },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: "VALIDATION_ERROR", message: MESSAGES.passwordMin },
  });

  expect((await loginViaApi(request, email, "123456789")).status()).toBe(401);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("CA-20: senha com 10 caracteres é aceita, com 9 é recusada, espaços contam, sem outras exigências", async ({
  request,
}) => {
  const email = uniqueEmail("ca20");
  const password = uniquePassword("ca20");
  await createTestUser(request, { email, password });
  await loginViaApiOk(request, email, password);

  const nine = "abcdefghi";
  const ten = "abcdefghij";
  const tenWithSpaces = " abcdefgh ";
  expect(tenWithSpaces).toHaveLength(10);

  const rejected = await request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: nine },
  });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error.message).toBe(MESSAGES.passwordMin);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);

  const accepted = await request.post("/api/auth/change-password", {
    data: { currentPassword: password, newPassword: ten },
  });
  expect(accepted.status()).toBe(200);

  const spaces = await request.post("/api/auth/change-password", {
    data: { currentPassword: ten, newPassword: tenWithSpaces },
  });
  expect(spaces.status()).toBe(200);
  expect((await loginViaApi(request, email, tenWithSpaces)).status()).toBe(200);
  expect((await loginViaApi(request, email, tenWithSpaces.trim())).status()).toBe(401);

  // Nova senha igual à atual é aceita (não há outra regra além do mínimo).
  const same = await request.post("/api/auth/change-password", {
    data: { currentPassword: tenWithSpaces, newPassword: tenWithSpaces },
  });
  expect(same.status()).toBe(200);

  // Na criação de conta pelo técnico, a mesma regra.
  const shortAtCreation = await request.post("/api/dev/test-user", {
    data: { email: uniqueEmail("ca20-curta"), password: nine },
  });
  expect(shortAtCreation.status()).toBe(400);
  expect((await shortAtCreation.json()).error.message).toBe(MESSAGES.passwordMin);
});

test("CA-37: trocar a senha autenticada mantém o outro dispositivo autenticado", async ({
  browser,
}) => {
  const email = uniqueEmail("ca37");
  const password = uniquePassword("ca37");
  const newPassword = uniquePassword("ca37n");
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  await createTestUser(deviceA.request, { email, password });
  await loginViaApiOk(deviceA.request, email, password);
  await loginViaApiOk(deviceB.request, email, password);

  const pageA = await deviceA.newPage();
  await openChangePassword(pageA);
  await submitChangePassword(pageA, password, newPassword);
  await expect(pageA.getByRole("status")).toHaveText(MESSAGES.passwordChanged);

  expect((await deviceB.request.get("/api/stores")).status()).toBe(200);
  const pageB = await deviceB.newPage();
  await pageB.goto("/");
  await expect(pageB).toHaveURL(/\/$/);
  await expect(pageB.locator("header").getByText(email)).toBeVisible();

  await deviceB.request.post("/api/auth/logout", { data: {} });
  expect((await deviceB.request.get("/api/stores")).status()).toBe(401);
  await deviceA.close();
  await deviceB.close();
});

test("caso extremo: sessão que expira durante a troca de senha leva ao login e a senha não muda", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("troca-expira");
  const password = uniquePassword("te");
  const attempted = uniquePassword("te-nova");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);
  await openChangePassword(page);

  // A sessão termina no servidor entre abrir a tela e confirmar (a senha é reposta igual).
  await createTestUser(page.request, { email, password });

  await submitChangePassword(page, password, attempted);
  await expect(page).toHaveURL(/\/login\?motivo=sessao_expirada&next=%2Fconta%2Fsenha$/);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.sessionExpired);
  await expect(alertBox(page)).toHaveCount(0);

  expect((await loginViaApi(request, email, attempted)).status()).toBe(401);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("caso extremo: confirmação diferente da nova senha é recusada localmente", async ({
  page,
}) => {
  const email = uniqueEmail("confirma");
  const password = uniquePassword("cf");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);
  await openChangePassword(page);
  await submitChangePassword(page, password, uniquePassword("a"), uniquePassword("b"));
  await expect(page.locator("#change-confirm-password-error")).toHaveText(
    MESSAGES.passwordsMismatch,
  );
  await expect(page.getByRole("status")).toHaveCount(0);
});
