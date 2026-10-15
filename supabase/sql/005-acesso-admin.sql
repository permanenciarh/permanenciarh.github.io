-- 005 - Libera o acesso do Álamo ao painel como administrador.
-- Rode DEPOIS de criar o usuário em Authentication > Users > Add user.
-- Pode rodar mais de uma vez sem problema.

insert into equipe (user_id, nome, papel, ativo)
select id, 'Álamo Monteiro', 'admin', true
from auth.users
where lower(email) = 'allamomonteiro@gmail.com'
on conflict (user_id) do update set papel = 'admin', ativo = true;

-- Conferência: deve aparecer 1 linha com papel = admin.
select u.email, u.email_confirmed_at, e.nome, e.papel, e.ativo
from auth.users u
left join equipe e on e.user_id = u.id
where lower(u.email) = 'allamomonteiro@gmail.com';
