/**
 * Helpers HTTP das rotas de autenticação: cookie de sessão, leitura do corpo (JSON ou
 * formulário nativo), resposta JSON-ou-303 e verificação de origem.
 * Nenhum helper aqui toca no banco; a lógica de negócio vive em auth.service.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { ZodError } from "zod";
import { toSafeInternalPath } from "@/shared/safe-path";
import type { ApiError } from "@/shared/types";
import { AuthError, isAuthError } from "./auth.errors";
import { firstIssueMessage } from "./schemas";

export const SESSION_COOKIE = "rids_session";

// ----- Cookie ---------------------------------------------------------------------

function cookieBaseAttributes(env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.NODE_ENV === "production",
  };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
  env: NodeJS.ProcessEnv = process.env,
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    expires: expiresAt,
    ...cookieBaseAttributes(env),
  });
  return response;
}

export function clearSessionCookie(
  response: NextResponse,
  env: NodeJS.ProcessEnv = process.env,
): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    expires: new Date(0),
    maxAge: 0,
    ...cookieBaseAttributes(env),
  });
  return response;
}

// ----- Corpo do pedido ------------------------------------------------------------------

/** true quando o corpo veio de um formulário nativo (progressividade sem JavaScript). */
export function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return (
    contentType.startsWith("application/x-www-form-urlencoded") ||
    contentType.startsWith("multipart/form-data")
  );
}

/**
 * Objeto plano com os campos do corpo, para o mesmo esquema Zod. Corpo vazio, JSON
 * inválido ou não-objeto → {} (a validação devolve a mensagem do campo em falta).
 */
export async function readAuthBody(request: Request): Promise<Record<string, unknown>> {
  try {
    if (isFormRequest(request)) {
      const form = await request.formData();
      const body: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") body[key] = value;
      }
      return body;
    }
    const text = await request.text();
    if (text.trim() === "") return {};
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ----- Respostas ----------------------------------------------------------------------

export function validationError(error: ZodError): AuthError {
  return new AuthError("VALIDATION_ERROR", firstIssueMessage(error));
}

/**
 * Converte qualquer erro numa AuthError. Erros desconhecidos viram AUTH_UNAVAILABLE e
 * só a mensagem vai para o log (nunca e-mail, senha, token ou cookie).
 */
export function toAuthError(error: unknown, context: string): AuthError {
  if (isAuthError(error)) return error;
  console.error(`${context} falhou`, error instanceof Error ? error.message : String(error));
  return new AuthError("AUTH_UNAVAILABLE");
}

export function apiErrorResponse(error: AuthError): NextResponse {
  const body: ApiError = { error: { code: error.code, message: error.message } };
  return NextResponse.json(body, { status: error.status });
}

/** Acrescenta parâmetros de query a um caminho; valores undefined são omitidos. */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  const query = search.toString();
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export interface AuthOutcome {
  /** Resposta completa para pedidos em JSON (já com cookies, se houver). */
  json: NextResponse;
  /** Caminho de página para o 303 quando o pedido veio de formulário nativo. */
  formRedirect: string;
}

/**
 * JSON quando o corpo veio em JSON; 303 para uma página quando veio de formulário.
 *
 * O `Location` é um caminho relativo (RFC 9110 §10.2.2), nunca uma URL absoluta: no
 * Next 16 `request.url` é montado com o hostname configurado do servidor (ex.
 * `localhost`), não com o `Host` do pedido, e um 303 absoluto levaria o navegador a
 * outro host (127.0.0.1 → localhost, ou atrás de um reverse proxy), perdendo o cookie.
 * `formRedirect` passa por `toSafeInternalPath` como defesa em profundidade.
 */
export function respondAuth(request: NextRequest, outcome: AuthOutcome): NextResponse {
  if (!isFormRequest(request)) return outcome.json;
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: toSafeInternalPath(outcome.formRedirect) },
  });
  for (const cookie of outcome.json.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

/** Resultado de erro: ApiError em JSON, ou 303 para `formPath?erro=<code>&...extra`. */
export function errorOutcome(
  error: AuthError,
  formPath: string,
  extra: Record<string, string | undefined> = {},
): AuthOutcome {
  return {
    json: apiErrorResponse(error),
    formRedirect: withQuery(formPath, { erro: error.code, ...extra }),
  };
}

// ----- Origem ---------------------------------------------------------------------------

/**
 * Defesa em profundidade contra login-CSRF: se `Origin` vier, o host tem de coincidir
 * com `Host` ou `X-Forwarded-Host`. Sem `Origin` (ferramentas HTTP) segue.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new AuthError("FORBIDDEN_ORIGIN");
  }
  const candidates = [request.headers.get("x-forwarded-host"), request.headers.get("host")]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) => value.split(",").map((v) => v.trim().toLowerCase()));
  if (!candidates.includes(originHost)) {
    throw new AuthError("FORBIDDEN_ORIGIN");
  }
}
