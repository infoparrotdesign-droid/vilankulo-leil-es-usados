# Diagnóstico read-only da ligação de base de dados

Resultado: a aplicação usa a base **Lovable Cloud** (gerida pelo Lovable), não o projeto externo `ibwasunbdqplanwhnexf`.

## Evidências
- Integração do projeto: backend "Lovable Cloud", gerido pelo Lovable, ativo; ferramentas da sessão ligadas à mesma instância.
- Código da aplicação e configuração local apontam para a mesma instância Cloud.
- O ref `ibwasunbdqplanwhnexf` não aparece em nenhum ficheiro nem na configuração da integração.

## GitHub vs base de dados
- O repositório de código está ligado apenas ao armazenamento Git interno do Lovable; não foi encontrada ligação a um repositório GitHub nesta sessão.
- A ligação Git guarda só o código; não determina a base de dados usada.

## O que depende do proprietário
- Para usar o projeto externo, é preciso um projeto Lovable novo, sem Cloud, e ligá-lo em Settings → General → External Supabase → Connect.

Nada foi alterado.
