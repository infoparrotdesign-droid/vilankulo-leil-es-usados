import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração indisponível — VilaShop" },
      { name: "description", content: "A área de administração do VilaShop não está disponível neste momento." },
      { property: "og:title", content: "Administração indisponível — VilaShop" },
      { property: "og:description", content: "A área de administração do VilaShop não está disponível neste momento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminUnavailablePage,
});

function AdminUnavailablePage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Administração indisponível</h1>
      <p className="mt-2 text-muted-foreground">A área de moderação não está ativa neste momento.</p>
      <Link to="/" className="mt-5 inline-flex rounded-md border px-4 py-2">Voltar ao VilaShop</Link>
    </main>
  );
}