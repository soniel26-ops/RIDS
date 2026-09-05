import Link from "next/link";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import {
  parseAuthErrorCode,
  parseResetToken,
  type SearchParams,
} from "@/components/auth/authQuery";
import { AUTH_ERROR_MESSAGES } from "@/shared/types";

export const dynamic = "force-dynamic";

/**
 * /redefinir-senha?token=<43 chars>[&erro=<AuthErrorCode>]
 * Sem token, ou com formato inválido, mostra só a mensagem de CA-29 e o link para pedir
 * um novo; a API não é chamada.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const token = parseResetToken(params.token);

  return (
    <AuthPageShell title="Definir nova senha">
      {token ? (
        <ResetPasswordForm token={token} initialErrorCode={parseAuthErrorCode(params.erro)} />
      ) : (
        <div className="flex flex-col gap-4">
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40"
          >
            {AUTH_ERROR_MESSAGES.INVALID_RESET_TOKEN}
          </p>
          <Link href="/esqueci-senha" className="text-sm underline">
            Pedir um novo link
          </Link>
        </div>
      )}
    </AuthPageShell>
  );
}
