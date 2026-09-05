/**
 * Infraestrutura dos testes de aceitação de autenticação (login-painel).
 * Tudo passa pelo servidor de dev: usuários via POST /api/dev/test-user, e-mails pela caixa
 * capturada GET /api/dev/outbox (MAIL_TRANSPORT=captured). A única leitura fora do servidor é
 * a auditoria (CA-39 a CA-43), consultada por SQL como faria o responsável técnico; nunca lê
 * `passwordHash`.
 */
import { config as loadEnv } from "dotenv";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

loadEnv({ quiet: true });

export type Role = "OWNER" | "ADMIN" | "MARKETING";

/** Textos exatos do contrato (04-resumo-backend.md e 05-resumo-frontend.md). */
export const MESSAGES = {
  invalidCredentials: "E-mail ou senha incorretos",
  tooManyAttempts: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  unauthenticated: "Sessão necessária.",
  invalidCurrentPassword: "Senha atual incorreta",
  invalidResetToken: "Este link é inválido ou expirou; peça um novo",
  passwordMin: "A senha deve ter pelo menos 10 caracteres.",
  passwordsMismatch: "As senhas não coincidem.",
  informEmail: "Informe o e-mail.",
  informPassword: "Informe a senha.",
  invalidEmail: "E-mail inválido.",
  sessionExpired: "A sua sessão terminou. Entre de novo.",
  passwordResetNotice: "Senha redefinida. Entre com a nova senha.",
  passwordChanged: "Senha alterada com sucesso.",
  forgotNeutral: "Se existir uma conta com este e-mail, enviámos um link para redefinir a senha",
  resetEmailSubject: "Redefinir a senha do RIDS",
} as const;

export const SEEDED_STORE_DOMAINS = ["sonielparis.fr", "sonielsupply.com"] as const;

export const SESSION_COOKIE = "rids_session";

/** Isola cada teste: contadores de tentativas, sessões e caixa de e-mail são por e-mail. */
export function uniqueEmail(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}@exemplo.test`;
}

/** Senha única por teste, para provar que nunca reaparece em nenhuma resposta (CA-21). */
export function uniquePassword(tag: string): string {
  return `Segr3d0-${tag}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createTestUser(
  request: APIRequestContext,
  user: { email: string; password: string; role?: Role },
): Promise<{ id: string; email: string; role: Role }> {
  const response = await request.post("/api/dev/test-user", { data: user });
  expect(response.status(), `POST /api/dev/test-user: ${await response.text()}`).toBe(200);
  return (await response.json()) as { id: string; email: string; role: Role };
}

/** Faz login pela API no jar de cookies do contexto dado (page.context().request ou request). */
export async function loginViaApi(request: APIRequestContext, email: string, password: string) {
  return request.post("/api/auth/login", { data: { email, password } });
}

export async function loginViaApiOk(request: APIRequestContext, email: string, password: string) {
  const response = await loginViaApi(request, email, password);
  expect(response.status(), `login de ${email}: ${await response.text()}`).toBe(200);
  return response;
}

/**
 * O alerta visível do formulário. O Next injeta `<div role="alert" id="__next-route-announcer__">`
 * (anunciador de rota, vazio) em toda página com JavaScript; sem excluí-lo, `getByRole("alert")`
 * resolve para dois elementos.
 */
export function alertBox(page: Page): Locator {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** Espera a hidratação do formulário: só então o `onSubmit` do React está ligado. */
export async function waitForHydration(page: Page, formAction: string): Promise<void> {
  await expect(page.locator(`form[action="${formAction}"]`)).toHaveAttribute("novalidate", "");
}

/**
 * Preenche e envia o login. Espera a resposta de /api/auth/login; se entrou, espera também a
 * navegação sair de /login (o formulário faz `location.assign(next)` só depois da resposta).
 */
export async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await waitForHydration(page, "/api/auth/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login"),
  );
  await page.getByRole("button", { name: "Entrar" }).click();
  const response = await loginResponse;
  if (response.status() === 200) {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
}

/** Abre a tela de login (com ou sem `next`) e entra como um usuário real. */
export async function loginViaPage(
  page: Page,
  email: string,
  password: string,
  loginPath = "/login",
): Promise<void> {
  await page.goto(loginPath);
  await fillLogin(page, email, password);
}

export interface CapturedMessage {
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

export async function readOutbox(
  request: APIRequestContext,
  email: string,
): Promise<CapturedMessage[]> {
  const response = await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { messages: CapturedMessage[] };
  return body.messages;
}

/**
 * Extrai o caminho relativo do link de redefinição. O e-mail é montado com APP_HOST
 * (localhost:3000); o Playwright navega contra 127.0.0.1:3000, por isso só o caminho conta.
 */
export function extractResetPath(text: string): string {
  const match = text.match(/https?:\/\/[^/\s]+(\/redefinir-senha\?token=[A-Za-z0-9_-]{43})/);
  if (!match) throw new Error("e-mail capturado sem link de redefinição");
  return match[1];
}

export function tokenFromResetPath(path: string): string {
  return new URL(path, "http://localhost").searchParams.get("token") ?? "";
}

/** Pede um link para o e-mail e devolve o caminho do link mais recente da caixa. */
export async function requestResetLink(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post("/api/auth/forgot-password", { data: { email } });
  expect(response.status(), await response.text()).toBe(200);
  const messages = await readOutbox(request, email);
  expect(messages.length).toBeGreaterThan(0);
  return extractResetPath(messages[0].text);
}

export function sessionCookieValue(setCookieHeaders: string[]): string | undefined {
  const header = setCookieHeaders.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  return header?.split(";")[0].slice(SESSION_COOKIE.length + 1);
}

// ----- Auditoria (consulta externa do responsável técnico) ------------------------------

export interface AuditRow {
  id: string;
  event: "LOGIN_SUCCEEDED" | "LOGIN_FAILED" | "PASSWORD_CHANGED" | "PASSWORD_RESET";
  email: string;
  userId: string | null;
  reason: string | null;
  /** Epoch em ms do instante gravado (UTC), independente do fuso do processo. */
  createdAtMs: number;
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL ausente no ambiente dos testes e2e");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Todas as entradas de auditoria de um e-mail, da mais antiga à mais recente. Nunca toca em User. */
export async function readAuditFor(email: string): Promise<AuditRow[]> {
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      event: AuditRow["event"];
      email: string;
      userId: string | null;
      reason: string | null;
      createdAtMs: string;
    }>(
      `SELECT id, event, email, "userId", reason,
              (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint::text AS "createdAtMs"
         FROM "AuthAuditLog"
        WHERE email = $1
        ORDER BY "createdAt", id`,
      [email],
    );
    return result.rows.map((row) => ({ ...row, createdAtMs: Number(row.createdAtMs) }));
  });
}

/** Linhas completas (todas as colunas) como JSON, para provar que nada sensível está guardado. */
export async function readAuditRawFor(email: string): Promise<Record<string, unknown>[]> {
  return withDb(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT * FROM "AuthAuditLog" WHERE email = $1 ORDER BY "createdAt"`,
      [email],
    );
    return result.rows;
  });
}

export async function auditColumnNames(): Promise<string[]> {
  return withDb(async (client) => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'AuthAuditLog'`,
    );
    return result.rows.map((row) => row.column_name);
  });
}
