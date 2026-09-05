/**
 * Login do painel — critérios dirigidos pela interface, como um usuário real.
 * Cada teste cria o seu próprio usuário (uniqueEmail) para não partilhar sessões nem
 * contadores de tentativas com os testes paralelos.
 */
import { expect, test } from "@playwright/test";
import {
  MESSAGES,
  alertBox,
  SEEDED_STORE_DOMAINS,
  createTestUser,
  fillLogin,
  loginViaApi,
  loginViaApiOk,
  loginViaPage,
  uniqueEmail,
  uniquePassword,
  waitForHydration,
} from "./helpers/auth";

test("CA-1: visitante que abre a página inicial é levado ao login sem ver dados das lojas", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "Entrar no RIDS" })).toBeVisible();
  for (const domain of SEEDED_STORE_DOMAINS) {
    await expect(page.locator("body")).not.toContainText(domain);
  }
});

test("CA-2: login válido leva à página pedida; sem página pedida vai à inicial", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("ca2");
  const password = uniquePassword("ca2");
  await createTestUser(page.request, { email, password });

  // Com `next`: volta à página que tentou abrir.
  await page.goto("/conta/senha");
  await expect(page).toHaveURL(/\/login\?next=%2Fconta%2Fsenha$/);
  await fillLogin(page, email, password);
  await expect(page).toHaveURL(/\/conta\/senha$/);
  await expect(page.getByRole("heading", { name: "Alterar a senha" })).toBeVisible();

  // Sem `next`: página inicial.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await loginViaPage(otherPage, email, password);
  await expect(otherPage).toHaveURL(/\/$/);
  await expect(otherPage.getByRole("heading", { name: "Lojas" })).toBeVisible();
  await other.close();
});

test("CA-3: a sessão persiste depois de fechar e reabrir o navegador", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("ca3");
  const password = uniquePassword("ca3");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);
  await expect(page).toHaveURL(/\/$/);

  // "Fechar o navegador": guarda o estado (cookies persistentes) e abre um contexto novo com ele.
  const state = await page.context().storageState();
  const sessionCookie = state.cookies.find((c) => c.name === "rids_session");
  expect(sessionCookie, "o cookie de sessão tem de ser persistente (com Expires)").toBeDefined();
  expect(sessionCookie!.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 24 * 3600);

  const reopened = await browser.newContext({ storageState: state });
  const reopenedPage = await reopened.newPage();
  await reopenedPage.goto("/");
  await expect(reopenedPage).toHaveURL(/\/$/);
  await expect(reopenedPage.getByText(SEEDED_STORE_DOMAINS[0])).toBeVisible();
  await expect(reopenedPage.getByText(email)).toBeVisible();
  await reopened.close();
});

test("CA-5: 'Sair' termina a sessão; voltar ao endereço do painel mostra o login", async ({
  page,
}) => {
  const email = uniqueEmail("ca5");
  const password = uniquePassword("ca5");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);
  await expect(page.getByText(SEEDED_STORE_DOMAINS[0])).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar no RIDS" })).toBeVisible();

  // Digitar o endereço de uma página do painel: login de novo, sem dados.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.locator("body")).not.toContainText(SEEDED_STORE_DOMAINS[0]);

  const stores = await page.request.get("/api/stores");
  expect(stores.status()).toBe(401);
});

test("CA-6: quem já tem sessão e abre /login é levado à página inicial", async ({ page }) => {
  const email = uniqueEmail("ca6");
  const password = uniquePassword("ca6");
  await createTestUser(page.request, { email, password });
  await loginViaApiOk(page.request, email, password);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Lojas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrar no RIDS" })).toHaveCount(0);
});

test("CA-7: senha errada mostra a mensagem genérica e nenhum dado do painel", async ({ page }) => {
  const email = uniqueEmail("ca7");
  const password = uniquePassword("ca7");
  await createTestUser(page.request, { email, password });

  await loginViaPage(page, email, `${password}-errada`);
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidCredentials);
  await expect(page).toHaveURL(/\/login/);
  for (const domain of SEEDED_STORE_DOMAINS) {
    await expect(page.locator("body")).not.toContainText(domain);
  }
});

test("CA-8: e-mail desconhecido mostra exatamente a mesma mensagem genérica de CA-7", async ({
  page,
}) => {
  await loginViaPage(page, uniqueEmail("ca8-inexistente"), uniquePassword("ca8"));
  await expect(alertBox(page)).toHaveText(MESSAGES.invalidCredentials);
  await expect(page).toHaveURL(/\/login/);
});

test("CA-9: campos vazios ou e-mail inválido indicam o campo em falta sem chamar a API", async ({
  page,
}) => {
  const loginRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/login")) loginRequests.push(request.method());
  });

  await page.goto("/login");
  await waitForHydration(page, "/api/auth/login");

  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#login-email-error")).toHaveText(MESSAGES.informEmail);
  await expect(page.locator("#login-password-error")).toHaveText(MESSAGES.informPassword);
  await expect(page.getByLabel("E-mail")).toHaveAttribute("aria-describedby", "login-email-error");

  await page.getByLabel("E-mail").fill("nao-e-um-email");
  await page.getByLabel("Senha", { exact: true }).fill("qualquer-coisa");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#login-email-error")).toHaveText(MESSAGES.invalidEmail);

  expect(loginRequests, "nenhuma tentativa chega ao servidor").toEqual([]);
  await expect(page).toHaveURL(/\/login$/);
});

test("CA-11: sessão terminada no meio do uso leva ao login com aviso claro, sem erro técnico", async ({
  page,
}) => {
  const email = uniqueEmail("ca11");
  const password = uniquePassword("ca11");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email, password);
  await expect(page.getByText(SEEDED_STORE_DOMAINS[0])).toBeVisible();

  // Termina a sessão no servidor (o cookie continua no navegador, mas já não vale).
  await createTestUser(page.request, { email, password });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?motivo=sessao_expirada&next=%2F$/);
  await expect(page.getByRole("status")).toHaveText(MESSAGES.sessionExpired);
  await expect(alertBox(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(SEEDED_STORE_DOMAINS[0]);
});

test("CA-14: não existe forma de criar conta na tela de login", async ({ page }) => {
  await page.goto("/login");
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["criar conta", "registar", "registrar", "cadastr", "sign up"]) {
    expect(body, `a tela não pode conter "${forbidden}"`).not.toContain(forbidden);
  }
  await expect(page.getByRole("link", { name: "Esqueci a senha" })).toBeVisible();

  const register = await page.request.get("/api/auth/register");
  expect([401, 404, 405]).toContain(register.status());
  const post = await page.request.post("/api/auth/register", { data: { email: "x@y.z" } });
  expect([401, 404, 405]).toContain(post.status());
});

test("CA-16: dois dispositivos ficam autenticados; 'Sair' num deles só termina esse", async ({
  browser,
}) => {
  const email = uniqueEmail("ca16");
  const password = uniquePassword("ca16");
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  const pageA = await deviceA.newPage();
  await createTestUser(deviceA.request, { email, password });

  await loginViaPage(pageA, email, password);
  await loginViaApiOk(deviceB.request, email, password);
  expect((await deviceA.request.get("/api/stores")).status()).toBe(200);
  expect((await deviceB.request.get("/api/stores")).status()).toBe(200);

  await pageA.getByRole("button", { name: "Sair" }).click();
  await expect(pageA).toHaveURL(/\/login$/);

  expect((await deviceA.request.get("/api/stores")).status()).toBe(401);
  expect((await deviceB.request.get("/api/stores")).status()).toBe(200);
  await deviceA.close();
  await deviceB.close();
});

test("CA-18: após 5 falhas, a 6.ª tentativa é recusada mesmo com a senha certa", async ({
  page,
}) => {
  const email = uniqueEmail("ca18");
  const password = uniquePassword("ca18");
  await createTestUser(page.request, { email, password });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await loginViaApi(page.request, email, `${password}-errada-${attempt}`);
    expect(response.status(), `tentativa ${attempt}`).toBe(401);
  }

  await loginViaPage(page, email, password);
  await expect(alertBox(page)).toHaveText(MESSAGES.tooManyAttempts);
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/stores")).status()).toBe(401);
});

test("CA-18 (caso extremo): 4 falhas seguidas de um login correto zeram a contagem", async ({
  request,
}) => {
  const email = uniqueEmail("ca18-zera");
  const password = uniquePassword("ca18z");
  await createTestUser(request, { email, password });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    expect((await loginViaApi(request, email, "senha-errada-x")).status()).toBe(401);
  }
  expect((await loginViaApi(request, email, password)).status()).toBe(200);

  // Se a contagem não tivesse sido zerada, a 2.ª falha abaixo já seria a 6.ª e daria 429.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    expect((await loginViaApi(request, email, "senha-errada-y")).status()).toBe(401);
  }
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("CA-18 (caso extremo): tentativas erradas simultâneas contam todas", async ({ request }) => {
  const email = uniqueEmail("ca18-simult");
  const password = uniquePassword("ca18s");
  await createTestUser(request, { email, password });

  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => loginViaApi(request, email, `errada-simultanea-${i}`)),
  );
  for (const response of results) expect(response.status()).toBe(401);

  const blocked = await loginViaApi(request, email, password);
  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toEqual({
    error: { code: "TOO_MANY_ATTEMPTS", message: MESSAGES.tooManyAttempts },
  });
});

test("CA-21: a senha digitada nunca reaparece nas respostas nem nas telas", async ({ page }) => {
  const email = uniqueEmail("ca21");
  const password = uniquePassword("ca21");
  await createTestUser(page.request, { email, password });

  const wrong = await loginViaApi(page.request, email, `${password}-errada`);
  expect(await wrong.text()).not.toContain(password);
  expect(JSON.stringify(wrong.headers())).not.toContain(password);

  const ok = await loginViaApi(page.request, email, password);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).not.toContain(password);
  expect(JSON.stringify(ok.headersArray())).not.toContain(password);

  const stores = await page.request.get("/api/stores");
  expect(await stores.text()).not.toContain(password);

  // HTML servido pelo servidor (com a sessão) e texto visível das páginas.
  for (const path of ["/", "/conta/senha"]) {
    const served = await page.request.get(path);
    expect(served.status()).toBe(200);
    expect(await served.text()).not.toContain(password);
    await page.goto(path);
    expect(await page.locator("body").innerText()).not.toContain(password);
  }

  // Tela de login após um erro: a senha não volta no HTML.
  const fresh = await page.context().browser()!.newContext();
  const freshPage = await fresh.newPage();
  await loginViaPage(freshPage, email, `${password}-errada`);
  await expect(alertBox(freshPage)).toBeVisible();
  expect(await freshPage.locator("body").innerText()).not.toContain(password);
  expect(await alertBox(freshPage).innerText()).not.toContain(password);
  await fresh.close();
});

test("CA-23: o painel mostra o e-mail e o cargo junto da ação 'Sair'", async ({ page }) => {
  const email = uniqueEmail("ca23");
  const password = uniquePassword("ca23");
  await createTestUser(page.request, { email, password, role: "ADMIN" });
  await loginViaPage(page, email, password);

  const header = page.locator("header");
  await expect(header.getByText(email)).toBeVisible();
  await expect(header.getByText("Admin", { exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Sair" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Alterar senha" })).toBeVisible();
});

test("CA-32: a conta do dono (OWNER) aparece com o cargo 'Proprietário'", async ({ page }) => {
  const email = uniqueEmail("ca32");
  const password = uniquePassword("ca32");
  await createTestUser(page.request, { email, password, role: "OWNER" });
  await loginViaPage(page, email, password);
  await expect(page.locator("header").getByText("Proprietário", { exact: true })).toBeVisible();
});

test("CA-33 (caso extremo 'cargo em cada conta'): Marketing vê o mesmo painel com o seu cargo", async ({
  page,
}) => {
  const email = uniqueEmail("ca33-mkt");
  const password = uniquePassword("ca33");
  await createTestUser(page.request, { email, password, role: "MARKETING" });
  await loginViaPage(page, email, password);
  await expect(page.locator("header").getByText("Marketing", { exact: true })).toBeVisible();
  for (const domain of SEEDED_STORE_DOMAINS) {
    await expect(page.getByText(domain)).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Alterar senha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});

test("caso extremo: e-mail com maiúsculas entra na mesma conta pela tela", async ({ page }) => {
  const email = uniqueEmail("caixa");
  const password = uniquePassword("caixa");
  await createTestUser(page.request, { email, password });
  await loginViaPage(page, email.toUpperCase(), password);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("header").getByText(email)).toBeVisible();
});

test("caso extremo: página pedida antes do login que não existe mostra o 404 normal, já autenticada", async ({
  page,
}) => {
  const email = uniqueEmail("nao-existe");
  const password = uniquePassword("404");
  await createTestUser(page.request, { email, password });

  await page.goto("/pagina-que-nao-existe");
  await expect(page).toHaveURL(/\/login\?next=%2Fpagina-que-nao-existe$/);
  await fillLogin(page, email, password);
  await expect(page).toHaveURL(/\/pagina-que-nao-existe$/);
  await expect(page.locator("body")).toContainText(/404|não encontrad|could not be found/i);
  expect((await page.request.get("/api/stores")).status()).toBe(200);
});

test("caso extremo: 'Sair' duas vezes não produz erro", async ({ page }) => {
  const email = uniqueEmail("sair2");
  const password = uniquePassword("sair2");
  await createTestUser(page.request, { email, password });
  await loginViaApiOk(page.request, email, password);

  const first = await page.request.post("/api/auth/logout", { data: {} });
  const second = await page.request.post("/api/auth/logout", { data: {} });
  expect(first.status()).toBe(204);
  expect(second.status()).toBe(204);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar no RIDS" })).toBeVisible();
  await expect(alertBox(page)).toHaveCount(0);
});
