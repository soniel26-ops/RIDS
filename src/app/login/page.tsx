import { redirect } from "next/navigation";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  firstParam,
  parseAuthErrorCode,
  parseLoginNotice,
  type SearchParams,
} from "@/components/auth/authQuery";
import { getCurrentUser } from "@/server/auth/session-guard";
import { toSafeInternalPath } from "@/shared/safe-path";

export const dynamic = "force-dynamic";

/**
 * /login?next=<caminho>&motivo=sessao_expirada|senha_redefinida&erro=<AuthErrorCode>
 * Quem já tem sessão válida vai para "/" (CA-6). O formulário recebe tudo por props.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const params = await searchParams;
  const next = toSafeInternalPath(firstParam(params.next));
  const notice = parseLoginNotice(params.motivo);
  const initialErrorCode = parseAuthErrorCode(params.erro);

  return (
    <AuthPageShell title="Entrar no RIDS">
      <LoginForm next={next} notice={notice} initialErrorCode={initialErrorCode} />
    </AuthPageShell>
  );
}
