# Permanência RH — site e Banco de Talentos

Site estático (HTML, CSS e JavaScript) publicado no GitHub Pages, com cadastro real no Supabase e painel administrativo com login.

**Para colocar no ar, siga o `GUIA-DE-LANCAMENTO.md`.**

## Estrutura

```
site/                              -> conteúdo do repositório permanenciarh.github.io
  index.html, banco-de-talentos.html, empresas.html, desenvolvimento-profissional.html,
  conteudos.html, sobre.html, privacidade.html, 404.html
  admin.html                       Painel da equipe (login, não indexado)
  css/style.css, css/admin.css     Estilos (tokens de cor da marca no topo de style.css)
  js/config.js                     ÚNICO arquivo a configurar: supabaseUrl e supabaseAnonKey
  js/main.js, js/cadastro.js       Site público
  js/admin.js                      Painel
  js/vendor/supabase.js            supabase-js 2.45.4 (MIT), hospedado no próprio site
  robots.txt, sitemap.xml, assets/images/og-permanencia-rh.png
  .github/workflows/manter-ativo.yml  Evita a pausa do Supabase gratuito
supabase/functions/cadastro-candidato/index.ts   Recebe o cadastro (validação no servidor)
docs/banco-de-dados.sql            Tabelas, RLS, auditoria, funções e bucket privado
docs/autenticacao-e-permissoes.md  Papéis e regras de acesso
docs/checklist-seguranca.md        Conferência antes e depois do lançamento
```

## Como funciona o cadastro
1. O formulário valida os campos no navegador e envia para a função `cadastro-candidato`.
2. A função aceita só envios vindos do domínio do site, aplica limite de tentativas por IP (guardado como hash), descarta robôs (campo invisível), valida tudo de novo, confere se o arquivo é mesmo um PDF de até 5 MB e salva candidato, autorizações e currículo (em bucket privado).
3. O site só mostra "Cadastro recebido!" quando a função responde `{"ok": true}`.
4. Sem `supabaseUrl` no `config.js`, o formulário fica em modo de demonstração e não envia nada.

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
