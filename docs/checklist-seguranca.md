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

## Atualização 2 (vagas, diversidade, ficha interna, empresas)
- [ ] `002-vagas-e-diversidade.sql` aplicado: conferir em *Table Editor* que `diversidade`, `ficha_interna`, `empresas` e `empresa_interacoes` aparecem com **RLS enabled**.
- [ ] Teste anônimo: `GET /rest/v1/vagas?select=empresa_cliente` com a chave pública deve falhar (coluna não liberada). `GET /rest/v1/diversidade` e `/rest/v1/ficha_interna` devem voltar vazios ou com erro.
- [ ] Dados de diversidade só são gravados quando a caixa de autorização específica foi marcada (testar enviando sem marcar).
- [ ] Ficha interna: entrar com um usuário `recrutador` e confirmar que a seção não aparece.
- [ ] Acesso a dados de diversidade aparece no **Registro de acessos** como `ver_diversidade`.
- [ ] O PDF do LinkedIn é lido no navegador: na aba *Rede* do navegador não deve haver envio do arquivo antes de clicar em **Enviar**.
- [ ] Mensagem de acompanhamento: o texto padrão não deve conter dados de outras pessoas (ele fica salvo só no navegador de quem edita).
