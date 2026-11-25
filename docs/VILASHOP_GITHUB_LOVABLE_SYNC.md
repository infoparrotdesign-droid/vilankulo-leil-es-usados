# VilaShop — sincronização GitHub e Lovable

## Fonte oficial do código

- Repositório: https://github.com/infoparrotdesign-droid/vilankulo-leil-es-usados
- Branch de desenvolvimento: `vilashop/rebuild-foundation`
- Branch estável: `main`
- Pull request de integração: https://github.com/infoparrotdesign-droid/vilankulo-leil-es-usados/pull/1

Todo o código, configuração, testes e migrations devem ser alterados e versionados no GitHub. Não editar código directamente no agente Lovable, para evitar divergência entre branches.

## Sincronização com o projecto Lovable existente

Projecto preservado: https://lovable.dev/projects/922cb125-508d-408e-a007-65a226b8ae76

Na auditoria de 24/11/2026, o `latest_commit_sha` devolvido pelo Lovable coincidia com o `head_sha` da PR #1 (`2c831c7e92ddb23bb4f6db37beb1aa15a2aeb034`). Isto confirma que o projecto Lovable estava a reflectir o commit mais recente da branch nesse momento.

Depois de cada commit no GitHub:
1. Confirmar o novo SHA da branch.
2. Confirmar o SHA mais recente no projecto Lovable.
3. Abrir o preview e verificar as páginas afectadas.
4. Se os SHAs divergirem, investigar a sincronização antes de editar no Lovable.

## Limites actuais

- O projecto Lovable original permanece associado ao Lovable Cloud; a ligação ao Supabase externo `ibwasunbdqplanwhnexf` ainda não está confirmada na aplicação em execução.
- O facto de o código aparecer no Lovable não significa que a aplicação esteja ligada à base de dados externa.
- As migrations comunitárias permanecem pendentes; o GitHub Actions usa dry-run por defeito.
- Nunca activar `apply_migrations=true` sem revisão e autorização expressa.
- A comissão por venda continua por decidir. Não calcular nem deduzir comissão, nem registar liquidação enquanto a taxa não for aprovada.
- As credenciais Gmail só entram em produção depois de OAuth concluído e dos secrets protegidos configurados no ambiente GitHub `production`.

## Verificações

- Workflow `VilaShop - Quality checks`: lint (baseline conhecido não bloqueante), testes e build.
- Workflow `VilaShop - Test direct PostgreSQL and deploy migrations`: ligação directa, dry-run e deploy das Edge Functions; não aplica migrations sem input explícito.

### Recuperação de sincronização — 25/11/2026

- Foi criado o commit vazio `23d26c6` para re-disparar o evento GitHub; o projecto Lovable continuou a reportar o SHA anterior.
- Esta actualização documental gera um evento `push` com conteúdo alterado para testar a reacção do webhook de sincronização do Lovable.
- A acção não publica o projecto, não altera dados, não executa migrations e não consome créditos Lovable.
