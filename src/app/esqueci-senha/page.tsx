import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { parseAuthErrorCode, parseFlag, type SearchParams } from "@/components/auth/authQuery";

export const dynamic = "force-dynamic";

/** /esqueci-senha?enviado=1 | ?erro=<AuthErrorCode> (caminho sem JavaScript). */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <AuthPageShell title="Esqueci a senha">
      <ForgotPasswordForm
        sent={parseFlag(params.enviado)}
        initialErrorCode={parseAuthErrorCode(params.erro)}
      />
    </AuthPageShell>
  );
}
