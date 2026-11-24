# VilaShop — separação de emails

- Administração: `info.parrotdesign@gmail.com`.
- Destinatário designado para notificações: `adminvilashop@gmail.com`.
- O endereço de notificações não recebe permissões administrativas.
- A função de autorização da base de dados valida simultaneamente a sessão autenticada, o registo de administrador e o email confirmado autorizado.
- O trigger de autenticação concede o registo administrativo apenas ao email autorizado e remove-o se o email da conta mudar ou deixar de corresponder.

## Estado do envio de emails

A aplicação já possui notificações internas na área da conta. O repositório ainda não contém um serviço/transporte de email transaccional configurado para encaminhar esses eventos para a caixa externa. Por isso, `adminvilashop@gmail.com` fica definido como destinatário oficial, mas o envio externo só ficará activo depois de configurar e validar um fornecedor SMTP/API e o respectivo segredo no ambiente de produção. Nenhuma chave ou palavra-passe deve ser colocada no código.
