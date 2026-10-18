# Permanência RH — site e Banco de Talentos

Site estático (HTML, CSS e JavaScript) publicado no GitHub Pages, com cadastro real no Supabase e painel administrativo com login.

**Para colocar no ar, siga o `GUIA-DE-LANCAMENTO.md`.**

## Estrutura

```
site/                              -> conteúdo do repositório permanenciarh.github.io
  index.html, vagas.html, banco-de-talentos.html, perfil-comportamental.html, empresas.html, desenvolvimento-profissional.html,
  conteudos.html, sobre.html, privacidade.html, 404.html
  admin.html                       Painel da equipe (login, não indexado)
  css/style.css, css/admin.css     Estilos (tokens de cor da marca no topo de style.css)
  js/config.js                     ÚNICO arquivo a configurar: supabaseUrl e supabaseAnonKey
  js/main.js, js/cadastro.js       Site público (cadastro em 4 etapas)
  js/importar.js                   Lê o PDF do LinkedIn/currículo NO NAVEGADOR e preenche o formulário
  js/vagas.js                      Página pública de vagas (só vagas abertas, só colunas públicas)
  js/perfil.js                     Questionário de perfil comportamental (público)
  avaliacao.html + js/avaliacao.js Eneagrama e Preferência cerebral, só pelo link enviado no painel
  js/avaliacao-textos.js           Textos de interpretação usados no laudo (painel)
  js/vendor/pdf.min.js + pdf.worker.min.js   pdf.js 3.11.174 (Apache-2.0), carregado só quando a pessoa escolhe um PDF
  js/admin.js                      Painel
  js/vendor/supabase.js            supabase-js 2.45.4 (MIT), hospedado no próprio site
  robots.txt, sitemap.xml, assets/images/og-permanencia-rh.png
  .github/workflows/manter-ativo.yml  Evita a pausa do Supabase gratuito
supabase/functions/cadastro-candidato/index.ts   Recebe o cadastro (validação no servidor)
supabase/sql/banco-de-dados.sql            Tabelas, RLS, auditoria, funções e bucket privado (001)
supabase/sql/002-vagas-e-diversidade.sql   Vagas, candidaturas, diversidade, ficha interna, acompanhamento 30 dias, empresas (CRM), indicadores
supabase/sql/003-cpf-cnh.sql               CPF e CNH no cadastro
supabase/sql/005-acesso-admin.sql          Acesso do Álamo ao painel como admin
supabase/sql/006-avaliacoes-e-laudos.sql   Avaliações por link (Eneagrama + Preferência cerebral) e laudos
supabase/sql/007-agenda-e-financeiro.sql   Agenda (entrevistas e reuniões, assinatura no celular) e financeiro (fluxo de caixa)
docs/autenticacao-e-permissoes.md  Papéis e regras de acesso
docs/checklist-seguranca.md        Conferência antes e depois do lançamento
```

## Como funciona o cadastro
1. O formulário valida os campos no navegador e envia para a função `cadastro-candidato`.
2. A função aceita só envios vindos do domínio do site, aplica limite de tentativas por IP (guardado como hash), descarta robôs (campo invisível), valida tudo de novo, confere se o arquivo é mesmo um PDF de até 5 MB e salva candidato, autorizações e currículo (em bucket privado).
3. O site só mostra "Cadastro recebido!" quando a função responde `{"ok": true}`.
4. Sem `supabaseUrl` no `config.js`, o formulário fica em modo de demonstração e não envia nada.

## Painel de gestão (admin.html)
- **Visão geral:** indicadores (talentos, novos no mês, acompanhamentos pendentes, vagas, candidaturas, clientes, propostas em aberto, autorizações, prazos vencidos) e gráficos por mês, área, perfil, modalidade, estado, funil comercial e serviços.
- **Candidatos:** filtros, perfil completo, ficha interna (só admin), avaliação comportamental por link e laudo (admin e recrutador), diversidade (sob demanda), candidaturas, currículo, autorizações, contatos, retenção e exclusão.
- **Agenda:** entrevistas, reuniões, devolutivas e aplicação de testes por semana; botões para o celular (.ics e Google Agenda), confirmação pelo WhatsApp e link de assinatura da agenda.
- **Financeiro (só admin):** entradas e saídas com vencimento, baixa, parcelas e repetição mensal; saldo em caixa, resultado do mês, vencidos, gráfico de 6 meses e exportação CSV.
- **Acompanhamento:** quem completa 30 dias desde o último contato aparece aqui, com botão de WhatsApp/e-mail com mensagem pronta e botões de resposta. "Quer continuar" renova o prazo de guarda por 24 meses.
- **Vagas:** criar, publicar (status *Aberta*), copiar links, acompanhar candidaturas por etapa e incluir pessoas do banco pelo código.
- **Empresas:** funil comercial (prospecção → cliente), serviços oferecidos, valor estimado, próximo contato e histórico.

## Segurança em resumo
- O público não tem nenhuma permissão no banco. Tudo entra pela função, que usa a chave secreta apenas no servidor.
- O painel usa login do Supabase com sessão que expira ao fechar a aba. As permissões por papel (admin, recrutador, leitura) são aplicadas no banco (RLS).
- O currículo é aberto por link assinado de 60 segundos, e cada abertura fica registrada.
- A exclusão apaga o PDF e anonimiza o cadastro.
- O site não usa cookies nem recursos de terceiros.

## Testar localmente
```bash
cd site && python3 -m http.server 8000
```
Abra http://localhost:8000.

## Editar
- Textos: direto nos arquivos `.html`.
- Cores: variáveis no início de `css/style.css`.
- WhatsApp: `js/config.js` e links `wa.me` no HTML.
