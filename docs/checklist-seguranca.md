# Checklist de segurança e LGPD

## Já implementado
- [x] Público sem nenhuma permissão no banco (RLS ativo em todas as tabelas, nenhuma política para `anon`).
- [x] Cadastro só pela função `cadastro-candidato`, com origem restrita ao domínio do site, limite de 5 envios a cada 10 minutos por IP (guardado como hash), campo anti-robô e validação completa no servidor.
- [x] PDF validado por tamanho (5 MB) e assinatura real (`%PDF-`), salvo em bucket privado.
- [x] Mensagem de sucesso só após confirmação do servidor; e-mail duplicado recebe resposta neutra.
- [x] Autorizações separadas (ciência, compartilhamento, conteúdos, perfil comportamental), nenhuma pré-marcada, com histórico.
- [x] Perfil comportamental calculado no servidor e salvo só com autorização própria.
- [x] Painel com login individual, sessão que expira ao fechar a aba e papéis aplicados no banco.
- [x] Currículo aberto por link assinado de 60 segundos, com registro de cada acesso.
- [x] Exclusão apaga o PDF e anonimiza o registro; recrutador não altera dados pessoais.
- [x] Content-Security-Policy, nenhum script/fonte/cookie de terceiros, `noindex` no painel.
- [x] Nenhum dado pessoal em localStorage, URL ou log.

## Antes de divulgar
- [ ] Projeto Supabase criado na região São Paulo.
- [ ] "Verify JWT" desligado só na função `cadastro-candidato`; secret `ALLOWED_ORIGINS` configurado.
- [ ] Cadastro público de usuários desligado no Supabase Auth.
- [ ] Chave `service_role` em nenhum arquivo do GitHub (só existe dentro do Supabase).
- [ ] Teste completo da Parte 3 do guia, incluindo exclusão do cadastro de teste.
- [ ] Workflow "Manter Supabase ativo" executado com sucesso.

## Recomendado em seguida
- [ ] Revisão jurídica do Aviso de Privacidade e dos Termos de Uso.
- [ ] E-mail próprio para o canal de dados pessoais.
- [ ] Senhas fortes e exclusivas para cada pessoa da equipe (verificação em duas etapas pode ser adicionada ao painel numa próxima versão).
- [ ] Revisar a lista de usuários da equipe a cada 3 meses.
