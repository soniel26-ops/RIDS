import { PanelHeader } from "@/components/PanelHeader";
import { StoreList } from "@/components/StoreList";
import { requirePageUser } from "@/server/auth/session-guard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Primeira instrução: sem sessão válida nada de loja é renderizado (CA-1, CA-11).
  const user = await requirePageUser({ next: "/" });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <PanelHeader user={user} />
      <section aria-labelledby="stores-heading">
        <h2 id="stores-heading" className="mb-3 text-lg font-medium">
          Lojas
        </h2>
        <StoreList />
      </section>
    </main>
  );
}
