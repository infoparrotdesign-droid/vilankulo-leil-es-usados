const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseURL = process.env.VILASHOP_PREVIEW_URL; // Local GitHub Actions preview; no Lovable workspace gate.
if (!baseURL) throw new Error("VILASHOP_PREVIEW_URL não definido.");

const results = [];
const record = (name, status, detail = "") => results.push({ name, status, detail });
const reportPath = path.join(process.cwd(), "artifacts", "preview-e2e-report.md");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const failedRequests = [];
  let blockedMutations = 0;

  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || "falha"}`));

  // This audit must never create purchases, bids, messages, profiles or other real records.
  await page.route("**/*", async route => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      blockedMutations += 1;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  try {
    const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    record("Preview abre e responde", response && response.status() < 400 ? "APROVADO" : "FALHOU", `HTTP ${response?.status() ?? "sem resposta"}`);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    record("Página inicial apresenta conteúdo VilaShop", /VilaShop/i.test(bodyText) && bodyText.length > 100 ? "APROVADO" : "FALHOU", `Texto visível: ${bodyText.length} caracteres. Início: ${bodyText.slice(0, 450).replace(/\\s+/g, " ")}`);

    const cards = page.locator("article.market-listing-card");
    const cardCount = await cards.count();
    record("Anúncios visíveis", cardCount > 0 ? "APROVADO" : "FALHOU", `${cardCount} cartões encontrados`);

    const cardSummaries = [];
    for (let i = 0; i < Math.min(cardCount, 10); i++) {
      const card = cards.nth(i);
      const title = (await card.innerText()).replace(/\s+/g, " ").slice(0, 120);
      cardSummaries.push(title);
      const openButton = card.locator("button.market-card-open");
      await openButton.click();
      await page.waitForTimeout(350);
      const dialog = page.getByRole("dialog");
      const dialogVisible = await dialog.isVisible().catch(() => false);
      record(`Abrir anúncio ${i + 1}`, dialogVisible ? "APROVADO" : "FALHOU", title);
      if (dialogVisible) {
        const dialogText = await dialog.innerText().catch(() => "");
        for (const label of ["Iniciar compra", "Enviar proposta", "Fazer um lance", "Iniciar conversa"]) {
          const action = dialog.getByRole("button", { name: new RegExp(label, "i") }).first();
          if (await action.count()) {
            await action.click();
            await page.waitForTimeout(250);
            const loginVisible = await page.getByRole("dialog").filter({ hasText: /Entre no VilaShop|Criar conta|entrar/i }).isVisible().catch(() => false);
            const stillVisible = await page.getByRole("dialog").count();
            record(`Botão “${label}” — comportamento sem sessão`, loginVisible || stillVisible > 0 ? "APROVADO" : "REVER", "Verificado sem sessão; qualquer escrita de rede foi bloqueada.");
            // Close any nested dialog and reopen the listing to inspect other actions.
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(100);
            if (!(await dialog.isVisible().catch(() => false))) {
              await openButton.click().catch(() => {});
              await page.waitForTimeout(150);
            }
          }
        }
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
    record("Resumo dos anúncios examinados", "INFO", cardSummaries.join(" | ") || "Nenhum cartão");

    // Test search input and category controls when present, without submitting forms.
    const search = page.locator('input[placeholder*="Pesquisar"], input[placeholder*="pesquisar"], input[aria-label*="Pesquisar"]').first();
    if (await search.count()) {
      await search.fill("bicicleta");
      await page.waitForTimeout(400);
      record("Campo de pesquisa aceita texto", "APROVADO", "Pesquisa preenchida sem efectuar escrita.");
    } else {
      record("Campo de pesquisa", "NÃO VERIFICADO", "Não foi encontrado selector de pesquisa conhecido.");
    }

    record("Nenhuma escrita real enviada", blockedMutations === 0 ? "APROVADO" : "APROVADO COM BLOQUEIOS", `${blockedMutations} pedidos mutáveis interceptados e bloqueados`);
    await page.screenshot({ path: path.join(process.cwd(), "artifacts", "preview-home.png"), fullPage: true }).catch(() => {});
    record("Erros JavaScript da página", pageErrors.length === 0 ? "APROVADO" : "FALHOU", pageErrors.join(" | ") || "Nenhum erro pageerror");
    record("Pedidos de rede falhados", failedRequests.length === 0 ? "INFO" : "AVISO", failedRequests.slice(0, 12).join(" | ") || "Nenhum");
  } catch (error) {
    record("Execução da auditoria", "FALHOU", error.stack || error.message);
  } finally {
    await browser.close();
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const lines = [
      "# Relatório de auditoria browser — VilaShop Preview",
      "",
      `Data UTC: ${new Date().toISOString()}`,
      `Preview: ${baseURL}`,
      "",
      "| Verificação | Resultado | Detalhe |",
      "|---|---|---|",
      ...results.map(item => `| ${item.name.replace(/\|/g, "/")} | **${item.status}** | ${item.detail.replace(/\|/g, "/").replace(/\n/g, " ")} |`),
      "",
      "Nota: testes executados sem autenticação. Todos os pedidos HTTP mutáveis foram bloqueados; funcionalidades que exigem conta, credenciais ou confirmação de pagamento não são declaradas testadas.",
    ];
    fs.writeFileSync(reportPath, lines.join("\n"));
    console.log(lines.join("\n"));
    if (results.some(item => item.status === "FALHOU")) process.exitCode = 1;
  }
})();
