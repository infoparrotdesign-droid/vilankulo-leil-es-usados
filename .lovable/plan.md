# Auditoria de testes manuais no Preview (só leitura)

## Âmbito
- Versão em teste: commit `ea36d94` ("Add private VilaShop messaging"), confirmada de novo no início.
- Não edito ficheiros, não faço commits, não executo SQL nem migrations e não altero dados reais.
- O Preview corre num navegador automático real (Playwright, Chromium). Os cliques acontecem de facto, e cada passo fica com captura de ecrã.
- Nota: o projeto não está publicado. Testo o Preview atual (a mesma versão que vê no editor), não um site publicado.

## Passos
1. Abrir a página inicial e listar todos os botões e controlos visíveis nos anúncios de demonstração.
2. Para cada controlo (lance, favoritos, seguir vendedor, proposta/contraproposta, iniciar compra, contactar, filtros, pesquisa, categorias e outros):
   - Clicar primeiro sem sessão iniciada e registar o resultado.
   - Registar o passo, o que acontece no ecrã e a mensagem mostrada.
   - Vigiar o tráfego de rede para saber se tentou gravar na base (pedidos de escrita) ou se só mudou o ecrã.
3. Bloquear no navegador de teste qualquer pedido de escrita (POST/PATCH/DELETE para a base) para garantir que nada é gravado. Se um botão tentar gravar, registo a tentativa como "tentou persistir — bloqueado".
4. Não inicio sessão com a sua conta nem crio contas de teste, para não alterar registos. Os fluxos que exigem sessão ficam BLOCKED, com o motivo.

## Resultado entregue
Uma tabela por controlo: passo, resultado, mensagem mostrada, estado local ou tentativa de gravação, e PASS/FAIL/BLOCKED, com capturas de ecrã como prova.
