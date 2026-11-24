# VilaShop — administração e encaminhamento de notificações

## Endereços

- **Conta administrativa:** `info.parrotdesign@gmail.com`.
- **Caixa de notificações:** `adminvilashop@gmail.com`.
- **Destinatários das notificações gerais por email:** ambos os endereços acima.

Os dois endereços recebem cópia dos alertas gerais da plataforma quando o serviço de envio de email estiver activo. Isto não partilha sessões, palavras-passe nem permissões: apenas `info.parrotdesign@gmail.com` pode autenticar-se como administrador. O endereço `adminvilashop@gmail.com` é um destinatário de correio e não recebe papel administrativo.

## Estado técnico

A lista de destinatários está centralizada em `src/lib/vilashop-config.ts`, através de `VILASHOP_NOTIFICATION_EMAILS`. A aplicação tem notificações internas para utilizadores, mas o repositório ainda não tem um transporte de email transaccional configurado para entregar alertas gerais a caixas externas.

Para activar a entrega real, é necessário escolher e configurar um fornecedor de email (por exemplo, Resend ou SMTP), adicionar a respectiva chave/credencial como segredo protegido no ambiente GitHub/Supabase e implementar/testar o envio no backend. Não colocar credenciais no código, no frontend ou em commits. Até esse passo ser concluído, a lista de destinatários está definida no código, mas não deve ser apresentada como encaminhamento externo activo.

## Segurança

A função de autorização da base de dados valida a sessão autenticada, o registo de administrador e o email confirmado autorizado. O trigger de autenticação concede o registo administrativo apenas ao email autorizado e remove-o se o email da conta mudar ou deixar de corresponder. O destinatário de notificações nunca é usado para conceder permissões.
