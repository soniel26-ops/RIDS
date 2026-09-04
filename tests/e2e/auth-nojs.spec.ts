/**
 * Caso extremo "login sem JavaScript": os formulários nativos continuam a funcionar
 * (303 do servidor e mensagens via ?erro= / ?enviado= / ?motivo=).
 */
import { expect, test } from "@playwright/test";
import {
  MESSAGES,
  alertBox,
  createTestUser,
  loginViaApi,
  loginViaApiOk,
  readOutbox,
  uniqueEmail,
  uniquePassword,
} from "./helpers/auth";

test.use({ javaScriptEnabled: false });

test("caso extremo (sem JS): login válido entra e mostra o painel", async ({ page }) => {
  const email = uniqueEmail("nojs");
  const password = uniquePassword("nojs");
  await createTestUser(page.request, { email, password });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("header").getByText(email)).toBeVisible();
  await expect(page.locator("header").getByText("Proprietário", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/stores")).status()).toBe(200);
});

test("caso extremo (sem JS): senha errada volta ao login com a mensagem genérica", async ({
  page,
}) => {
  const email = uniqueEmail("nojs-errada");
  await createTestUser(page.request, { email, password: uniquePassword("nojs") });

  await page.goto("/login?next=%2Fconta%2Fsenha");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-nojs");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/login\?erro=INVALID_CREDENTIALS&next=%2Fconta%2Fsenha$/);
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidCredentials);
});

test("caso extremo (sem JS): 'Esqueci a senha' envia o link e mostra a frase neutra", async ({
  page,
}) => {
  const email = uniqueEmail("nojs-forgot");
  await createTestUser(page.request, { email, password: uniquePassword("nojs") });

  await page.goto("/esqueci-senha");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();

  await expect(page).toHaveURL(/\/esqueci-senha\?enviado=1$/);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.forgotNeutral);
  expect(await readOutbox(page.request, email)).toHaveLength(1);
});

test("caso extremo (sem JS): redefinir pelo link e sair funcionam com formulários nativos", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("nojs-reset");
  const password = uniquePassword("nojs");
  const newPassword = uniquePassword("nojs-nova");
  await createTestUser(request, { email, password });
  await request.post("/api/auth/forgot-password", { data: { email } });
  const [message] = await readOutbox(request, email);
  const resetPath = message.text.match(/(\/redefinir-senha\?token=[A-Za-z0-9_-]{43})/)![1];

  await page.goto(resetPath);
  await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page).toHaveURL(/\/login\?motivo=senha_redefinida$/);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.passwordResetNotice);
  expect((await loginViaApi(request, email, password)).status()).toBe(401);

  // Entra pela API (o login nativo tem o seu próprio teste) e sai pelo formulário nativo.
  await loginViaApiOk(page.request, email, newPassword);
  await page.goto("/");
  await expect(page.locator("header").getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/stores")).status()).toBe(401);
});
