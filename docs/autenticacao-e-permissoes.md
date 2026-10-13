# Autenticação e permissões

## Princípios
- O site público **não tem login** nesta versão. O botão "Entrar" só deve aparecer quando o painel existir.
- Somente a equipe autorizada da Permanência RH acessa dados de candidatos.
- Empresas nunca acessam o banco diretamente. Recebem perfis selecionados, para uma vaga específica, de quem autorizou o compartilhamento.
- Toda regra de acesso é aplicada **no banco** (RLS do PostgreSQL), não apenas na interface.

## Autenticação (equipe)
- Supabase Auth com **e-mail e senha forte** (mínimo de 10 caracteres). A verificação em duas etapas pode ser adicionada ao painel numa próxima versão.
- Desative o cadastro público de usuários em *Authentication → Providers → Email → Allow new users to sign up = off*. Usuários são convidados pelo admin.
- Após criar o usuário em *Authentication → Users*, insira a linha correspondente na tabela `equipe` com o papel.
- A sessão do painel fica só na aba aberta (sessionStorage) e termina ao fechá-la.

## Papéis

| Ação | admin | recrutador | leitura |
|---|:-:|:-:|:-:|
| Ver lista e filtros de candidatos | ✔ | ✔ | ✔ |
| Ver perfil profissional e perfil comportamental | ✔ | ✔ | ✔ |
| Baixar currículo (URL assinada, 60 s) | ✔ | ✔ | — |
| Atualizar status e registrar contatos/encaminhamentos | ✔ | ✔ | — |
| Corrigir dados a pedido do titular (no Table Editor do Supabase) | ✔ | — | — |
| Tratar pedidos LGPD (acesso, exclusão, retirada de autorização) | ✔ | — | — |
| Excluir / anonimizar | ✔ | — | — |
| Gerenciar equipe e papéis | ✔ | — | — |
| Ver auditoria | ✔ | — | — |
| Ver visão geral (indicadores) | ✔ | ✔ | ✔ |
| **Ficha interna** (anotações de entrevista, o que a pessoa busca, plano contratado) | ✔ | — | — |
| Ver dados de diversidade (sob demanda, acesso registrado) | ✔ | ✔ | — |
| Criar e editar vagas; mudar etapa de candidaturas | ✔ | ✔ | — |
| Excluir vagas e empresas | ✔ | — | — |
| Ver empresas e prospecções | ✔ | ✔ | ✔ |
| Cadastrar e editar empresas; registrar contatos comerciais | ✔ | ✔ | — |
| Registrar acompanhamento mensal (check-in de 30 dias) | ✔ | ✔ | — |

## Registro de acessos
- Alterações em `candidatos` são registradas automaticamente pelo trigger `auditar_candidato`.
- O painel registra também **ver perfil** e **abrir currículo** pela função `registrar_acesso`.
- A auditoria não guarda dados pessoais, apenas quem fez, o quê, quando e o identificador do registro.

## Compartilhamento com empresas
- Use a visão `perfis_compartilhaveis`, que traz só dados profissionais e só de quem autorizou.
- Cada envio a uma empresa vira uma linha em `interacoes` (`tipo = 'encaminhamento'`, com o nome da empresa).
- Antes de enviar o currículo completo, confirme o interesse do candidato na vaga.

## Futuro: área empresarial
Quando houver login para empresas, crie as tabelas `empresas`, `usuarios_empresa` e `vagas`, e uma tabela `perfis_liberados (vaga_id, candidato_id, liberado_por, expira_em)`. A empresa só enxerga perfis liberados para as próprias vagas, com prazo de expiração e registro de cada visualização.
