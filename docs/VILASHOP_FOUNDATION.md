# VilaShop — Fundação do projecto

> Documento de trabalho para a reconstrução progressiva do marketplace. Não substitui os Termos, Política de Privacidade nem validação jurídica local.

## 1. Visão

O VilaShop é um marketplace moçambicano orientado à comunidade. Deve aproximar compradores, vendedores particulares e empresas, facilitar descoberta de artigos e criar confiança através de reputação, comunicação moderada e processos transparentes.

**Princípio de produto:** descobrir, conectar, comprar e vender.

## 2. Regras já decididas

- Nome do produto: VilaShop.
- Arranque: Província de Inhambane; expansão nacional numa fase posterior.
- Idade mínima de registo: 18 anos. Não admitir menores, mesmo com autorização de responsável.
- Vendedores: particulares e empresas.
- Tipos de anúncio: leilão, venda directa e negociação de preço.
- Comissão comercial do VilaShop: 10% sobre o preço-base acordado, acrescentada ao valor pago pelo comprador. O vendedor recebe integralmente o preço-base que definiu/negociou; a taxa é suportada pelo comprador e apresentada separadamente antes da confirmação. Exemplo: preço-base 10.000 MZN + taxa 1.000 MZN = total 11.000 MZN. A aplicação operacional fica sujeita à revisão jurídica/fiscal local.
- Pagamentos iniciais: verificação manual. Não tratar comprovativo enviado pelo utilizador como confirmação suficiente; a equipa confirma a transacção.
- Entrega: comprador e vendedor combinam previamente quem suporta o custo e a forma de entrega.
- O comprador confirma recepção; o vendedor informa a entrega; a equipa VilaShop valida oficialmente a entrega.
- O prazo máximo de 3 dias para liquidar o vendedor começa apenas depois da confirmação oficial da entrega pela equipa.
- Um pedido de ajuda é analisado pelo administrador; não suspende automaticamente o pagamento.
- Se o administrador suspender o pagamento, este fica suspenso durante a análise e a decisão final é registada.
- O administrador confirma o encerramento de processos de mediação.
- Não permitir contactos pessoais, links externos ou tentativas de levar transacções para fora da plataforma nos espaços de negociação/mediação.
- Avisar e permitir corrigir mensagens sinalizadas antes do envio; não penalizar automaticamente uma primeira tentativa corrigida.
- Conta administrativa exclusiva: info.parrotdesign@gmail.com. Destinatários de notificações: info.parrotdesign@gmail.com e adminvilashop@gmail.com; a segunda caixa não recebe privilégios administrativos.
- Não existem, nesta fase, integrações/API confirmadas de M-Pesa, e-Mola, SMS ou WhatsApp.
- Não activar custódia, retenção ou pagamentos a terceiros sem validação do operador de pagamentos e aconselhamento jurídico moçambicano.

### Política de preços e transparência
- O vendedor indica o preço-base que pretende receber.
- O VilaShop calcula uma taxa de serviço de 10% sobre o preço-base e acrescenta-a ao total pago pelo comprador.
- O comprador deve ver a discriminação: preço do artigo, taxa VilaShop e total a pagar, antes de confirmar a compra.
- O formulário de publicação mostra ao vendedor uma simulação em tempo real, com o valor que recebe e o total estimado para o comprador, incentivando preços competitivos sem esconder a taxa.
- Em propostas, contrapropostas e leilões, os valores apresentados são preços-base; a taxa é calculada sobre o valor final acordado/vencedor.

## 3. Experiência principal

### Página inicial — comunidade e descoberta
- Cabeçalho com marca, pesquisa, navegação, favoritos, notificações e conta.
- Boas-vindas e chamada para explorar ou começar a vender.
- Categorias, publicações recentes, lojas/vendedores em destaque.
- Recomendações, oportunidades e leilões.
- Conteúdo personalizado para utilizadores autenticados.
- Descoberta pública para visitantes; acções como seguir, favoritar, licitar, negociar, comprar e vender exigem conta. Esta regra deve ser confirmada antes de ser considerada fechada.

### Contas e vendedores
- Perfis de particulares e empresas.
- Página pública do vendedor com apresentação, localização, artigos e avaliações.
- Seguir vendedores/lojas e receber notificações internas quando novos anúncios forem aprovados e publicados.
- Avaliações/depoimentos associados apenas a compras concluídas.

### Anúncios e leilões
- Suportar venda directa, negociação e leilão.
- Registar cada proposta válida com data/hora e valor.
- Histórico de propostas visível a todos os visitantes do leilão, inclusive quem ainda não licitou.
- Identificar concorrentes com rótulos anónimos consistentes dentro do mesmo leilão; nunca expor nomes, telefones ou outros dados pessoais no histórico público.
- Apenas propostas válidas entram no histórico; não permitir ao vendedor apagar ou manipular propostas.
- A visibilidade do histórico depois do encerramento do leilão ainda precisa de decisão.

### Pedidos, pagamentos e entrega
- Registo de encomendas e respectivos estados.
- Comprovativo de pagamento como evidência submetida, sujeito a verificação administrativa.
- Notificações internas em cada etapa relevante.
- Registo da confirmação de entrega, início do prazo de liquidação e pagamento ao vendedor.
- Pedidos de ajuda, anexos, análise administrativa e mediação supervisionada.

### Administração e confiança
- Gestão de utilizadores, vendedores, anúncios, categorias e conteúdo sinalizado.
- Moderação de mensagens e anúncios.
- Gestão de pedidos de ajuda, mediações e decisões de suspensão/libertação de pagamentos.
- Registo de auditoria para alterações administrativas e etapas financeiras.
- Alertas por email para ocorrências importantes.

## 4. Direcção visual

- Identidade aprovada para implementação: laranja queimado, carvão esverdeado, creme quente e verde profundo.
- Laranja principal: #D95716; carvão: #202B29; creme: #FFF5E9; verde: #28665A; dourado de apoio: #E8B85C; branco: #FFFFFF.
- O laranja é a cor de acção e reconhecimento da marca; o carvão estrutura navegação e áreas de destaque; o creme mantém a experiência acolhedora; o verde é reservado a confiança e estados positivos.
- Evitar a aparência genérica baseada em azuis/roxos e gradientes decorativos.
- Suporte a tema automático do dispositivo e escolha manual, com preferência manual persistente.
- Interface clara, acessível, responsiva e em português usado em Moçambique.
- Toda a marca visível deve usar VilaShop, não o nome antigo Boladas.

## 5. Princípios técnicos

- Construir por módulos pequenos e verificáveis.
- Preservar a branch `main` como referência estável; desenvolver na branch `vilashop/rebuild-foundation`.
- Não apagar dados, tabelas, utilizadores ou ficheiros existentes sem plano de migração e cópia de segurança.
- Antes de alterações à base de dados: inspeccionar políticas RLS, funções, triggers e migrações.
- Validar permissões no servidor/base de dados; não confiar apenas em controlos visuais.
- Nunca colocar chaves secretas no frontend ou no repositório.
- Criar testes para regras de idade, propostas, permissões, pagamentos, entrega e mediação.
- Não ligar pagamentos reais enquanto o modelo operacional e regulatório não estiver esclarecido.

## 6. Ordem de reconstrução

1. Auditoria do código, base de dados, autenticação, segurança e experiência actual.
2. Fundação de marca VilaShop, navegação, layout responsivo e sistema de temas.
3. Contas, perfis e tipos de vendedor.
4. Catálogo, categorias, pesquisa e publicação/moderação de anúncios.
5. Leilões e histórico público de propostas.
6. Venda directa, negociação e encomendas.
7. Pagamentos manuais, entrega e liquidação com controlos administrativos.
8. Comunidade: seguir vendedores, favoritos, recomendações, avaliações e notificações.
9. Pedidos de ajuda, mediação, moderação e painel administrativo.
10. Testes completos, revisão de segurança, validação jurídica e lançamento gradual.

## 7. Primeira entrega técnica

A primeira entrega não deve remover funcionalidades nem alterar dados existentes. Deve estabelecer uma base de trabalho segura, identificar dependências e riscos e preparar a migração progressiva do nome e da experiência para VilaShop.
