/**
 * Login do painel — critérios provados como um cliente HTTP real (fixture `request`).
 */
import { expect, test } from "@playwright/test";
import {
  MESSAGES,
  SEEDED_STORE_DOMAINS,
  createTestUser,
  loginViaApi,
  loginViaApiOk,
  sessionCookieValue,
  uniqueEmail,
  uniquePassword,
  type Role,
} from "./helpers/auth";

test("CA-4: com sessão válida, /api/stores devolve as lojas normalmente", async ({ request }) => {
  const email = uniqueEmail("ca4");
  const password = uniquePassword("ca4");
  await createTestUser(request, { email, password });
  await loginViaApiOk(request, email, password);

  const response = await request.get("/api/stores");
  expect(response.status()).toBe(200);
  const stores = (await response.json()) as Array<{ domain: string; name: string }>;
  expect(Array.isArray(stores)).toBe(true);
  const domains = stores.map((store) => store.domain).sort();
  expect(domains).toEqual(expect.arrayContaining([...SEEDED_STORE_DOMAINS]));
});

test("CA-10: sem sessão, qualquer dado do painel recebe acesso negado controlado, sem dados", async ({
  request,
}) => {
  const stores = await request.get("/api/stores");
  expect(stores.status()).toBe(401);
  const body = await stores.text();
  expect(JSON.parse(body)).toEqual({
    error: { code: "UNAUTHENTICATED", message: MESSAGES.unauthenticated },
  });
  for (const domain of SEEDED_STORE_DOMAINS) expect(body).not.toContain(domain);

  const changePassword = await request.post("/api/auth/change-password", {
    data: { currentPassword: "abcdefghij", newPassword: "abcdefghijk" },
  });
  expect(changePassword.status()).toBe(401);
  expect((await changePassword.json()).error.code).toBe("UNAUTHENTICATED");

  const unknownApi = await request.get("/api/qualquer-coisa");
  expect(unknownApi.status()).toBe(401);
  expect((await unknownApi.json()).error.code).toBe("UNAUTHENTICATED");
});

test("CA-12: sessão adulterada ou desconhecida é tratada como não autenticada", async ({
  request,
  page,
}) => {
  const garbage = await request.get("/api/stores", { headers: { Cookie: "rids_session=lixo" } });
  expect(garbage.status()).toBe(401);
  expect((await garbage.json()).error.code).toBe("UNAUTHENTICATED");
  const cleared = garbage
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  expect(cleared.some((v) => v.startsWith("rids_session=;") && /Max-Age=0/i.test(v))).toBe(true);

  // Token bem formado mas inexistente (43 chars base64url).
  const forged = "A".repeat(43);
  const unknown = await request.get("/api/stores", {
    headers: { Cookie: `rids_session=${forged}` },
  });
  expect(unknown.status()).toBe(401);

  // Página com cookie inválido: login, sem dados.
  await page
    .context()
    .addCookies([{ name: "rids_session", value: forged, domain: "127.0.0.1", path: "/" }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?motivo=sessao_expirada&next=%2F$/);
  await expect(page.locator("body")).not.toContainText(SEEDED_STORE_DOMAINS[0]);
});

test("CA-17: a verificação de saúde continua pública, sem cookie", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok" });
  for (const domain of SEEDED_STORE_DOMAINS) expect(JSON.stringify(body)).not.toContain(domain);
});

test("CA-19: qualquer cargo vê todas as lojas registradas, sem restrição por loja", async ({
  request,
}) => {
  const password = uniquePassword("ca19");
  const seen: Record<Role, string[]> = { OWNER: [], ADMIN: [], MARKETING: [] };
  for (const role of ["OWNER", "ADMIN", "MARKETING"] as const) {
    const email = uniqueEmail(`ca19-${role.toLowerCase()}`);
    await createTestUser(request, { email, password, role });
    await loginViaApiOk(request, email, password);
    const response = await request.get("/api/stores");
    expect(response.status(), role).toBe(200);
    const stores = (await response.json()) as Array<{ domain: string }>;
    seen[role] = stores.map((s) => s.domain).sort();
    await request.post("/api/auth/logout", { data: {} });
  }
  expect(seen.MARKETING).toEqual(expect.arrayContaining([...SEEDED_STORE_DOMAINS]));
  expect(seen.ADMIN).toEqual(seen.OWNER);
  expect(seen.MARKETING).toEqual(seen.OWNER);
});

test("CA-31: toda conta tem exatamente um cargo dentre Proprietário, Admin e Marketing", async ({
  request,
}) => {
  const password = uniquePassword("ca31");
  const invalid = await request.post("/api/dev/test-user", {
    data: { email: uniqueEmail("ca31-invalido"), password, role: "SUPERUSER" },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");

  const empty = await request.post("/api/dev/test-user", {
    data: { email: uniqueEmail("ca31-vazio"), password, role: "" },
  });
  expect(empty.status()).toBe(400);

  for (const role of ["OWNER", "ADMIN", "MARKETING"] as const) {
    const email = uniqueEmail(`ca31-${role.toLowerCase()}`);
    const created = await createTestUser(request, { email, password, role });
    expect(created.role).toBe(role);
    const login = await loginViaApiOk(request, email, password);
    const body = (await login.json()) as { user: { role: string } };
    expect(["OWNER", "ADMIN", "MARKETING"]).toContain(body.user.role);
    expect(body.user.role).toBe(role);
    await request.post("/api/auth/logout", { data: {} });
  }

  // Sem cargo informado, a conta ainda nasce com um cargo (o padrão OWNER).
  const defaulted = await createTestUser(request, { email: uniqueEmail("ca31-default"), password });
  expect(["OWNER", "ADMIN", "MARKETING"]).toContain(defaulted.role);
});

test("CA-33: Admin e Marketing fazem o mesmo que o Proprietário nesta entrega", async ({
  browser,
}) => {
  for (const role of ["ADMIN", "MARKETING"] as const) {
    const context = await browser.newContext();
    const email = uniqueEmail(`ca33-${role.toLowerCase()}`);
    const password = uniquePassword("ca33");
    const newPassword = uniquePassword("ca33n");
    await createTestUser(context.request, { email, password, role });
    await loginViaApiOk(context.request, email, password);

    const stores = await context.request.get("/api/stores");
    expect(stores.status(), `${role} lista lojas`).toBe(200);
    expect(((await stores.json()) as unknown[]).length).toBeGreaterThanOrEqual(2);

    const change = await context.request.post("/api/auth/change-password", {
      data: { currentPassword: password, newPassword },
    });
    expect(change.status(), `${role} troca a senha`).toBe(200);
    expect(await change.json()).toEqual({ ok: true });

    const logout = await context.request.post("/api/auth/logout", { data: {} });
    expect(logout.status(), `${role} sai`).toBe(204);
    expect((await context.request.get("/api/stores")).status()).toBe(401);
    expect((await loginViaApi(context.request, email, newPassword)).status()).toBe(200);
    await context.close();
  }
});

test("caso extremo: e-mail com maiúsculas e espaços entra na mesma conta (API)", async ({
  request,
}) => {
  const email = uniqueEmail("norm");
  const password = uniquePassword("norm");
  await createTestUser(request, { email, password });

  const response = await loginViaApi(request, `  ${email.toUpperCase()}  `, password);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { user: { email: string } };
  expect(body.user.email).toBe(email);
  const setCookies = response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  expect(sessionCookieValue(setCookies)).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("caso extremo: a senha é comparada exatamente como digitada (espaços contam)", async ({
  request,
}) => {
  const email = uniqueEmail("exata");
  const password = ` ${uniquePassword("exata")} `;
  await createTestUser(request, { email, password });

  expect((await loginViaApi(request, email, password.trim())).status()).toBe(401);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("caso extremo: entradas muito longas ou estranhas são recusadas com mensagem controlada", async ({
  request,
}) => {
  const email = uniqueEmail("longo");
  const password = uniquePassword("longo");
  await createTestUser(request, { email, password });
  const controlled = new Set<string>([
    MESSAGES.invalidCredentials,
    MESSAGES.invalidEmail,
    MESSAGES.informEmail,
    MESSAGES.informPassword,
    "Senha demasiado longa.",
  ]);

  const cases: Array<{ name: string; email: string; password: string }> = [
    { name: "e-mail com milhares de caracteres", email: `${"a".repeat(5000)}@x.test`, password },
    { name: "senha com milhares de caracteres", email, password: "x".repeat(5000) },
    { name: "emojis", email, password: "🔒🔑🙂🙃🤖🎉🚀🌍🍀🔥" },
    { name: "caracteres de controle na senha", email, password: "abc\u0000def\u0007ghij" },
    { name: "quebra de linha no e-mail", email: `${email}\nx@y.test`, password },
  ];
  for (const testCase of cases) {
    const response = await loginViaApi(request, testCase.email, testCase.password);
    expect([400, 401], testCase.name).toContain(response.status());
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(controlled.has(body.error.message), `${testCase.name}: ${body.error.message}`).toBe(
      true,
    );
    expect(JSON.stringify(body)).not.toMatch(/scrypt|prisma|stack|Error:/i);
  }

  // O sistema continua a funcionar.
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await loginViaApi(request, email, password)).status()).toBe(200);
});

test("caso extremo: POST de outra origem é recusado (defesa contra login-CSRF)", async ({
  request,
}) => {
  const response = await request.post("/api/auth/login", {
    data: { email: uniqueEmail("origem"), password: "abcdefghij" },
    headers: { Origin: "https://atacante.example" },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN_ORIGIN");
});
