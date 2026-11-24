# VilaShop

O VilaShop é um marketplace orientado à comunidade, criado para aproximar compradores e vendedores em Moçambique.

## Arquitectura oficial

- **GitHub** é a fonte oficial do código, das alterações, dos testes e dos processos de CI/CD.
- **Supabase externo** (`ibwasunbdqplanwhnexf`) é o backend oficial: PostgreSQL, autenticação, armazenamento e funções.
- **Lovable** permanece como projecto de apoio/preview. O backend Lovable Cloud não é a base oficial do VilaShop.
- A publicação da aplicação exige um destino de hospedagem configurado separadamente; GitHub Actions executa testes e automações, mas não é, por si só, o servidor permanente da aplicação.

## Desenvolvimento

Requisitos: Bun (versão actual) e Git.

```sh
git clone https://github.com/infoparrotdesign-droid/vilankulo-leil-es-usados.git
cd vilankulo-leil-es-usados
bun install --frozen-lockfile
bun run dev
```

A configuração pública do Supabase encontra-se em `.env` para o ambiente de desenvolvimento/build. Use `.env.example` como referência. A chave publishable/anon é concebida para uso no cliente; nunca coloque chaves `service_role`, secret keys, palavras-passe ou tokens privados no repositório.

## Base de dados

As migrations oficiais estão em `supabase/migrations`. As alterações de schema devem ser versionadas no GitHub e aplicadas ao projecto externo através do workflow protegido de migrations. O workflow mantém `apply_migrations=false` por padrão; não activar a aplicação automática sem revisão explícita.

## Verificações

```sh
bun run lint
bun run test
bun run build
```
