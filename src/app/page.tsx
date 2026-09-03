import { StoreList } from "@/components/StoreList";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">RIDS</h1>
        <p className="text-zinc-500">Gestão das lojas Shopify</p>
      </header>
      <section aria-labelledby="stores-heading">
        <h2 id="stores-heading" className="mb-3 text-lg font-medium">
          Lojas
        </h2>
        <StoreList />
      </section>
    </main>
  );
}
