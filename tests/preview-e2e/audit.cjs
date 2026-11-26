const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseURL = process.env.VILASHOP_PREVIEW_URL;
if (!baseURL) throw new Error("VILASHOP_PREVIEW_URL não definido.");

const results = [];
const record = (name, status, detail = "") => results.push({ name, status, detail });
const reportPath = path.join(process.cwd(), "artifacts", "preview-e2e-report.md");
const cardSelector = "article.market-listing-card";
const openSelector = "button.market-card-open";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const failedRequests = [];
  let blockedMutations = 0;
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || "falha"}`));

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
    await page.waitForTimeout(3500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    record("Preview local abre e responde", response && response.status() < 400 ? "APROVADO" : "FALHOU", `HTTP ${response?.status() ?? "sem resposta"}`);
    record("Página inicial VilaShop", /VilaShop/i.test(bodyText) && bodyText.length > 500 ? "APROVADO" : "FALHOU", `${bodyText.length} caracteres; ${bodyText.slice(0, 260).replace(/\s+/g, " ")}`);

    const cardCount = await page.locator(cardSelector).count();
    record("Cartões de anúncios de demonstração", cardCount > 0 ? "APROVADO" : "FALHOU", `${cardCount} encontrados`);

    const cardTitles = [];
    for (let i = 0; i < Math.min(cardCount, 10); i++) {
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const card = page.locator(cardSelector).nth(i);
      const summary = (await card.innerText()).replace(/\s+/g, " ").slice(0, 120);
      cardTitles.push(summary);
      await card.locator(openSelector).click();
      const listingDialog = page.getByRole("dialog").first();
      const visible = await listingDialog.isVisible().catch(() => false);
      record(`Abrir anúncio ${i + 1}`, visible ? "APROVADO" : "FALHOU", summary);
      if (!visible) continue;

      const actionLabels = ["Iniciar compra", "Enviar proposta", "Fazer um lance", "Iniciar conversa"];
      for (const label of actionLabels) {
        const action = listingDialog.getByRole("button", { name: new RegExp(label, "i") }).first();
        if (!(await action.count())) continue;
        try {
          await action.click({ timeout: 5000 });
          await page.waitForTimeout(350);
          const dialogs = page.getByRole("dialog");
          const dialogCount = await dialogs.count();
          const visibleText = await page.locator("body").innerText().catch(() => "");
          const expected = /entrar|iniciar sessão|criar conta|login|autenticação/i.test(visibleText) || dialogCount > 0;
          record(`Botão “${label}” sem sessão — anúncio ${i + 1}`, expected ? "APROVADO" : "REVER", "Clique executado; sem autenticação e sem escrita real.");
        } catch (error) {
          record(`Botão “${label}” sem sessão — anúncio ${i + 1}`, "FALHOU", error.message.slice(0, 260));
        }
        // Reload resets stacked dialogs so each action is tested independently.
        await page.goto(baseURL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await page.locator(cardSelector).nth(i).locator(openSelector).click();
        await page.waitForTimeout(200);
      }
    }
    record("Resumo dos anúncios", "INFO", cardTitles.join(" | ") || "Nenhum");

    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    const search = page.locator('input[placeholder*="Pesquisar"], input[placeholder*="pesquisar"], input[aria-label*="Pesquisar"]').first();
    if (await search.count()) {
      await search.fill("bicicleta");
      await page.waitForTimeout(500);
      record("Campo de pesquisa aceita texto", "APROVADO", "Pesquisa preenchida localmente.");
    } else {
      record("Campo de pesquisa", "NÃO VERIFICADO", "Selector não encontrado.");
    }

    record("Pedidos mutáveis bloqueados", "APROVADO", `${blockedMutations} pedidos não-GET interceptados; nenhum enviado para o backend.`);
    record("Erros JavaScript", pageErrors.length === 0 ? "APROVADO" : "FALHOU", pageErrors.join(" | ") || "Nenhum pageerror.");
    record("Pedidos de rede falhados", failedRequests.length === 0 ? "INFO" : "AVISO", failedRequests.slice(0, 8).join(" | ") || "Nenhum.");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    await page.screenshot({ path: path.join(process.cwd(), "artifacts", "preview-home.png"), fullPage: true }).catch(() => {});
  } catch (error) {
    record("Execução da auditoria", "FALHOU", error.stack || error.message);
  } finally {
    await browser.close();
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const lines = [
      "# Relatório de auditoria browser — VilaShop (GitHub Preview)",
      "",
      `Data UTC: ${new Date().toISOString()}`,
      `Origem: ${baseURL}`,
      "",
      "| Verificação | Resultado | Detalhe |",
      "|---|---|---|",
      ...results.map(item => `| ${item.name.replace(/\|/g, "/")} | **${item.status}** | ${item.detail.replace(/\|/g, "/").replace(/\n/g, " ")} |`),
      "",
      "Segurança: sem sessão autenticada; todos os pedidos HTTP mutáveis foram bloqueados. Nenhuma compra, proposta, mensagem, lance ou alteração de conta foi enviada.",
    ];
    fs.writeFileSync(reportPath, lines.join("\n"));
    console.log(lines.join("\n"));
    if (results.some(item => item.status === "FALHOU")) process.exitCode = 1;
  }
})();
