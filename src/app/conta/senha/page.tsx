import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { parseAuthErrorCode, parseFlag, type SearchParams } from "@/components/auth/authQuery";
import { PanelHeader } from "@/components/PanelHeader";
import { requirePageUser } from "@/server/auth/session-guard";

export const dynamic = "force-dynamic";

/** /conta/senha?ok=1 | ?erro=<AuthErrorCode> — página protegida (CA-22). */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePageUser({ next: "/conta/senha" });
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <PanelHeader user={user} />
      <section aria-labelledby="change-password-heading" className="max-w-md">
        <h2 id="change-password-heading" className="mb-3 text-lg font-medium">
          Alterar a senha
        </h2>
        <ChangePasswordForm
          ok={parseFlag(params.ok)}
          initialErrorCode={parseAuthErrorCode(params.erro)}
        />
      </section>
    </main>
  );
}
