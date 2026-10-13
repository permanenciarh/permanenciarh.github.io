# Guia de lançamento — Permanência RH

Tempo total: cerca de 1 hora. Você vai precisar de um computador com Chrome ou Edge e de um e-mail.

O que está nesta pasta:

| Pasta / arquivo | Para quê |
|---|---|
| `site/` | Tudo o que vai para o GitHub (o site público e o painel `admin.html`) |
| `supabase/sql/banco-de-dados.sql` | Cria o banco no Supabase (copiar e colar) |
| `supabase/functions/cadastro-candidato/index.ts` | Função que recebe os cadastros (copiar e colar) |
| `docs/` | Permissões, checklist de segurança |

---

## Parte 1 — Colocar o site no ar (GitHub Pages)

1. Acesse **github.com** e crie uma conta. Use o nome de usuário **`permanenciarh`**.
   - Se esse nome não estiver disponível, escolha outro e me avise. Eu ajusto os endereços do site para o nome escolhido.
2. Clique em **New repository** (botão verde ou **+** no topo).
   - Repository name: **`permanenciarh.github.io`** (exatamente assim)
   - Marque **Public**. Não marque "Add a README".
   - Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Abra a pasta `site/` no seu computador, selecione **tudo o que está dentro dela** (Ctrl+A) e arraste para a página do GitHub. Espere terminar e clique em **Commit changes**.
5. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/(root)** e clique em **Save**.
6. Em 1 ou 2 minutos o site estará em **https://permanenciarh.github.io**. Marque **Enforce HTTPS** na mesma tela, se a opção aparecer.

> Até a Parte 2 ser concluída, o formulário do Banco de Talentos avisa que está em implantação e não salva nada.

---

## Parte 2 — Ligar o banco de dados (Supabase)

### 2.1 Criar o projeto
1. Acesse **supabase.com** → **Start your project** → entre com a conta do GitHub.
2. **New project**:
   - Name: `permanencia-rh`
   - Database password: clique em **Generate** e guarde a senha em local seguro.
   - Region: **South America (São Paulo)**. Isso é importante, porque o Aviso de Privacidade informa que os dados ficam em São Paulo.
   - Plano: **Free**.
3. Espere o projeto ficar pronto (1 a 2 minutos).

### 2.2 Criar as tabelas
1. Menu lateral → **SQL Editor** → **New query**.
2. Abra `supabase/sql/banco-de-dados.sql` no Bloco de Notas, copie tudo, cole no editor e clique em **Run**.
3. O resultado esperado é *Success. No rows returned*.

### 2.3 Criar a função que recebe os cadastros
1. Menu lateral → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome da função: **`cadastro-candidato`** (exatamente assim).
3. Apague o código de exemplo, cole todo o conteúdo de `supabase/functions/cadastro-candidato/index.ts` e clique em **Deploy function**.
4. Na página da função, abra os detalhes/configurações e **desligue "Enforce JWT verification"** (ou "Verify JWT"). Salve. O formulário é público e por isso não envia login. A função só aceita envios vindos do seu site.
5. **Edge Functions → Secrets** → adicione:
   - Name: `ALLOWED_ORIGINS`
   - Value: `https://permanenciarh.github.io`

### 2.4 Configurar o login da equipe
1. **Authentication → Sign In / Providers** (ou *Settings*): desligue **Allow new users to sign up**. Só você cria usuários.
2. **Authentication → URL Configuration**:
   - Site URL: `https://permanenciarh.github.io/admin.html`
   - Redirect URLs: adicione `https://permanenciarh.github.io/admin.html`
3. **Authentication → Users → Add user → Create new user**: seu e-mail e uma senha forte (mínimo de 10 caracteres). Marque **Auto Confirm User**.
4. Volte ao **SQL Editor**, cole e rode (troque o e-mail):
   ```sql
   insert into equipe (user_id, nome, papel)
   select id, 'Álamo Monteiro', 'admin' from auth.users where email = 'SEU-EMAIL-AQUI';
   ```
   O resultado esperado é *1 row*.

### 2.5 Ligar o site ao Supabase
1. No Supabase, vá em **Project Settings → API Keys** (ou *API*). Copie:
   - **Project URL** (ex.: `https://abcdefghijkl.supabase.co`)
   - **anon public key** (aba *Legacy API Keys*). Se essa aba não existir, use a **publishable key**.
   - **Nunca** use a chave *service_role* / *secret* no site.
2. No GitHub, abra o repositório → pasta `js` → arquivo **`config.js`** → ícone de lápis (Edit).
3. Preencha:
   ```js
   supabaseUrl: "https://abcdefghijkl.supabase.co",
   supabaseAnonKey: "cole-a-chave-anon-aqui",
   ```
4. Clique em **Commit changes**. Em 1 minuto o site atualiza.

### 2.6 Manter o projeto ativo
O plano gratuito do Supabase pausa o projeto depois de 7 dias sem uso. Se ele pausar, o formulário para de funcionar. Para evitar isso:
1. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crie dois:
   - `SUPABASE_URL` = a Project URL
   - `SUPABASE_ANON_KEY` = a chave anon
2. Confira se o arquivo `.github/workflows/manter-ativo.yml` está no repositório. Se não estiver (alguns navegadores não enviam pastas que começam com ponto), use **Add file → Create new file**, digite o nome `.github/workflows/manter-ativo.yml` e cole o conteúdo do arquivo de mesmo nome que está em `site/.github/workflows/`.
3. Aba **Actions** → *Manter Supabase ativo* → **Run workflow**. O resultado deve ficar verde.

O GitHub desliga tarefas agendadas em repositórios sem alterações por 60 dias e avisa por e-mail. Se receber esse aviso, é só reativar. Entrar no painel uma vez por semana também conta como uso.

---

## Parte 3 — Teste final (antes de divulgar)

- [ ] Abra **https://permanenciarh.github.io** no computador e no celular. Navegue por todas as páginas.
- [ ] Faça um cadastro de teste com seus dados e um PDF. A mensagem esperada é **"Cadastro recebido!"**.
- [ ] Na aba **Perfil Comportamental**, faça o teste. Depois salve o resultado com um segundo cadastro (outro e-mail) e marque "incluir meu perfil".
- [ ] Entre em **https://permanenciarh.github.io/admin.html** com o usuário da etapa 2.4.
- [ ] Veja os cadastros na lista, abra o perfil e clique em **Abrir currículo**. No segundo cadastro, confira o bloco **Perfil comportamental** e o filtro por perfil.
- [ ] Mude o status e registre um contato.
- [ ] Em *Retenção e LGPD*, exclua o cadastro de teste (digite o código para confirmar).
- [ ] Na aba **Registro de acessos**, confira se as ações aparecem.
- [ ] Teste o formulário de empresas: ele deve abrir o WhatsApp com a mensagem pronta.
- [ ] Cole o link do site em **linkedin.com/post-inspector** para conferir a imagem de prévia.

---

## Atualização 2 — vagas, preenchimento automático e painel de gestão

Para quem já está com o site no ar (feito uma única vez):

1. **Site:** envie os arquivos novos para o repositório (Add file → Upload files, substituindo os antigos).
2. **Banco:** no Supabase, *SQL Editor → New query*, cole o conteúdo de `supabase/sql/002-vagas-e-diversidade.sql` e clique em **Run**.
3. **Função:** em *Edge Functions → cadastro-candidato → Code*, substitua pelo novo `supabase/functions/cadastro-candidato/index.ts` e clique em **Deploy** (mantenha "Verify JWT" desligado).

**Como acessar as informações:** entre em **https://permanenciarh.github.io/admin.html** com o e-mail e a senha que você criou pelo convite. Os dados brutos também ficam no Supabase, em *Table Editor* (use para correções pontuais; evite exportar planilhas).

---

## Rotina depois do lançamento

| Quando | O que fazer |
|---|---|
| Toda semana | Entrar no painel, ver novos cadastros e atualizar os status. |
| Ao receber pedido de dados pessoais | Registrar na aba **Pedidos LGPD** e responder em até 15 dias. |
| Toda semana | Aba **Acompanhamento**: mandar a mensagem de 30 dias (WhatsApp ou e-mail) e registrar a resposta. |
| Toda semana | Aba **Empresas**: conferir a agenda comercial e atualizar a etapa de cada prospecção. |
| Todo mês | Filtro **Retenção → Prazo vencido**: confirmar o interesse do candidato (botão *renovar*) ou excluir. |
| Ao encaminhar para empresa | Só para quem marcou a autorização de compartilhamento (o painel bloqueia os demais). Registre o encaminhamento. |
| Ao incluir alguém na equipe | Criar o usuário (2.4, item 3) e rodar o insert com o papel `recrutador` ou `leitura`. |

**Perfil comportamental:** use o resultado para abrir a conversa na entrevista ("o teste indicou que você é mais Lobo; me conte uma situação em que…"). Ele é um questionário de autoconhecimento, não um teste psicológico, e não deve aprovar nem eliminar ninguém sozinho.

**Papéis:** `admin` faz tudo. `recrutador` vê perfis e currículos, muda status e registra contatos. `leitura` só vê perfis, sem currículo.

---

## Pendências recomendadas (não impedem o lançamento)

- **E-mail de privacidade:** hoje o canal de dados pessoais é o WhatsApp. Quando criar um e-mail (ex.: um Gmail da Permanência), me envie que eu atualizo o site.
- **Revisão jurídica:** o Aviso de Privacidade e os Termos foram escritos com base na LGPD, mas vale a leitura de um advogado.
- **CNPJ:** quando formalizar (MEI ou empresa), o responsável no Aviso de Privacidade muda para a razão social.
- **Domínio próprio** (ex.: permanenciarh.com.br, no Registro.br): pode ser ligado ao GitHub Pages depois. Nesse caso, os endereços precisam ser atualizados no site e no Supabase.
