# VilaShop — administração e notificações por email

## Destinatários e permissões

- **Conta remetente e única conta administrativa:** `info.parrotdesign@gmail.com`.
- **Destinatário adicional:** `adminvilashop@gmail.com`.
- Os dois recebem cópia das notificações administrativas.
- O segundo endereço não recebe sessão, palavra-passe, papel de administrador nem acesso ao painel.

## Transporte Gmail gratuito

O envio usa a Gmail API com OAuth 2.0 e o âmbito mínimo `https://www.googleapis.com/auth/gmail.send`. A Edge Function `send-admin-notification` só aceita pedidos autenticados com o segredo interno `VILASHOP_MAILER_TOKEN`; os destinatários e o remetente são fixos no servidor. Nenhuma credencial Gmail fica no frontend ou no repositório.

A função envia mensagens em nome de `info.parrotdesign@gmail.com` para ambos os destinatários. O Gmail aplica os seus próprios limites e políticas de envio.

## Configuração necessária na conta Google

1. Entrar no [Google Cloud Console](https://console.cloud.google.com/) com `info.parrotdesign@gmail.com`.
2. Criar um projecto Google Cloud chamado VilaShop Notifications.
3. Em APIs & Services → Library, activar **Gmail API**.
4. Configurar Google Auth Platform / OAuth consent screen. Seleccionar External e adicionar `info.parrotdesign@gmail.com` como utilizador de teste se a aplicação estiver em Testing.
5. Em Credentials, criar um OAuth Client ID do tipo Web application. Adicionar `https://developers.google.com/oauthplayground` como Authorized redirect URI.
6. Abrir [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), abrir as definições (engrenagem), activar **Use your own OAuth credentials** e introduzir Client ID e Client Secret.
7. No passo 1 do Playground, usar apenas o âmbito `https://www.googleapis.com/auth/gmail.send`, autorizar com `info.parrotdesign@gmail.com`; no passo 2, trocar o código por tokens e guardar o **refresh token**. Não partilhar o token no chat.
8. No GitHub, abrir Settings → Secrets and variables → Actions → Environment secrets → `production` e criar:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
9. Executar o workflow **VilaShop - Test direct PostgreSQL and deploy migrations** com a opção `configure_gmail=true`. O workflow envia as credenciais ao Supabase como secrets e deriva um token interno separado. Não activa nem aplica migrations.

Se o consentimento OAuth estiver em Testing, os refresh tokens para âmbitos Gmail podem expirar ao fim de 7 dias. Para uso contínuo, configurar a aplicação como In production; o Google pode mostrar um aviso de aplicação não verificada ou exigir revisão conforme o estado e a utilização. Não conceder âmbitos Gmail mais amplos do que `gmail.send`.

## Estado de implementação

- [x] Destinatários fixos e separação entre email administrativo e caixa de notificações.
- [x] Edge Function de envio Gmail API criada no GitHub.
- [x] Segredo de chamada validado no servidor; credenciais não expostas ao browser.
- [x] Workflow preparado para publicar a função e importar OAuth secrets do ambiente GitHub `production`.
- [ ] Criar OAuth Client e obter refresh token na conta remetente.
- [ ] Adicionar os três secrets Gmail no GitHub e executar `deploy_admin_notifications=true`.
- [ ] Ligar os eventos administrativos do marketplace ao envio e testar entrega real nos dois destinatários.

A função de envio não deve ser considerada operacional até os secrets serem configurados e o teste real de entrega ser concluído. A nova função `flag-message` regista sinalizações autenticadas e chama o mailer; o chat ainda precisa de invocar o helper `flagMessageForModeration` quando uma mensagem for sinalizada. O frontend actual ainda não tem chat interno.

## Segurança

Nunca colocar credenciais em ficheiros versionados, variáveis públicas, mensagens de chat ou logs. Se um segredo for exposto, revogá-lo e gerar outro. A caixa `adminvilashop@gmail.com` é apenas destinatária; não deve ser adicionada à tabela de administradores.
