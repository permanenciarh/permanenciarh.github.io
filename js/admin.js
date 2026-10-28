/**
 * Permanência RH — painel administrativo do Banco de Talentos
 *
 * Segurança:
 *  - Login pelo Supabase Auth; a sessão fica em sessionStorage (sai ao fechar a aba).
 *  - Todas as permissões são aplicadas no banco (RLS). A interface só esconde o que o papel não pode fazer.
 *  - Nenhum dado pessoal vai para URL, console ou armazenamento do navegador.
 *  - Todo conteúdo exibido é inserido com textContent (proteção contra XSS).
 */
(function () {
  "use strict";

  var C = window.PRH_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var PAGE_SIZE = 50;

  var AREAS = ["Administrativo","Agronegócio e campo","Alimentação e cozinha","Armazém e operações","Atendimento ao cliente","Comercial e vendas","Comércio e varejo","Comunicação e marketing","Construção civil","Contabilidade e finanças","Educação","Engenharia","Jurídico","Limpeza e conservação","Logística e distribuição","Manutenção","Portaria e segurança patrimonial","Produção e indústria","Recursos Humanos","Saúde","Segurança do trabalho","Serviços gerais","Tecnologia da informação","Transporte e motoristas","Outra área"];
  var UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
  var EXPS = ["Sem experiência","Até 1 ano","De 1 a 3 anos","De 3 a 5 anos","De 5 a 10 anos","Mais de 10 anos"];
  var STATUS = {
    cadastro_recebido: "Cadastro recebido", perfil_em_analise: "Perfil em análise", perfil_atualizado: "Perfil atualizado",
    considerado_para_oportunidade: "Considerado para oportunidade", contato_realizado: "Contato realizado",
    encaminhado_processo_seletivo: "Encaminhado para processo seletivo", arquivado: "Arquivado", excluido: "Excluído"
  };
  var MODAL = { presencial: "Presencial", hibrido: "Híbrido", remoto: "Remoto", todas: "Todas" };
  var TIPOS = { clt: "CLT", estagio: "Estágio", aprendizagem: "Jovem aprendiz", temporario: "Temporário", pj: "PJ", freelancer: "Freelancer" };
  var FINALIDADES = { ciencia_aviso: "Ciência do Aviso de Privacidade", compartilhar_empresas: "Compartilhar perfil com empresas", receber_conteudos: "Receber conteúdos por e-mail", perfil_comportamental: "Incluir perfil comportamental", dados_diversidade: "Dados de diversidade (sensíveis)" };
  var PERFIS = { aguia: "Águia · Idealizador", gato: "Gato · Comunicador", lobo: "Lobo · Organizador", tubarao: "Tubarão · Executor" };
  var CNH_HABILITA = { A: ["A", "AB", "AC", "AD", "AE"], B: ["B", "AB", "C", "AC", "D", "AD", "E", "AE"], C: ["C", "AC", "D", "AD", "E", "AE"], D: ["D", "AD", "E", "AE"], E: ["E", "AE"] };
  function fmtCpf(c) { return c && c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c; }
  function fmtCnh(c) { if (!c) return null; if (c.cnh_categoria === "nao_possui") return "Não possui"; return c.cnh_categoria ? "Categoria " + c.cnh_categoria + (c.cnh_ear ? " · com EAR" : "") : null; }
  var PEDIDOS = { acesso: "Acesso", correcao: "Correção", exclusao: "Exclusão", retirada_consentimento: "Retirada de autorização", portabilidade: "Portabilidade", outro: "Outro" };

  var sb = null, me = null, page = 0, current = null, lastFocus = null;
  // Convite (primeiro acesso) ou redefinição: capturado antes de o supabase-js limpar o endereço
  var FLUXO_SENHA = /type=(invite|recovery)/.test(location.hash) ? location.hash.match(/type=(invite|recovery)/)[1] : null;

  /* ------------------------------------------------------------ utilidades */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtData(s) { if (!s) return "—"; var d = new Date(s.length === 10 ? s + "T12:00:00" : s); return d.toLocaleDateString("pt-BR"); }
  function fmtDataHora(s) { return s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"; }
  function show(id) { ["view-login", "view-nova-senha", "view-sem-acesso", "view-config", "view-app"].forEach(function (v) { $(v).hidden = v !== id; }); }
  function msg(text, kind) {
    var box = $("global-msg");
    box.innerHTML = "";
    if (!text) return;
    box.appendChild(el("div", { class: "admin-toast " + (kind || ""), text: text }));
    clearTimeout(msg.t); msg.t = setTimeout(function () { box.innerHTML = ""; }, 6000);
  }
  function erroAmigavel(e) {
    var m = (e && (e.message || e.error_description)) || "";
    if (/sem_permissao|permission|row-level/i.test(m)) return "Seu papel não permite esta ação.";
    if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
    if (/fetch|network/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    return "Não foi possível concluir a ação. Tente novamente.";
  }
  function can(action) {
    var p = me && me.papel;
    if (action === "editar") return p === "admin" || p === "recrutador";
    if (action === "admin") return p === "admin";
    return !!p;
  }
  function fillSelect(sel, values) { values.forEach(function (v) { sel.appendChild(el("option", { value: v, text: v })); }); }

  /* ------------------------------------------------------------ inicialização */
  function init() {
    if (!C.supabaseUrl || !C.supabaseAnonKey || !window.supabase) { show("view-config"); return; }
    sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    fillSelect($("f-area"), AREAS); fillSelect($("f-uf"), UFS); fillSelect($("f-exp"), EXPS);
    Object.keys(STATUS).forEach(function (k) { $("f-status").appendChild(el("option", { value: k, text: STATUS[k] })); });

    sb.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") show("view-nova-senha");
      if (event === "SIGNED_OUT") { me = null; $("admin-user").hidden = true; show("view-login"); }
    });

    sb.auth.getSession().then(function (r) {
      if (r.data.session && FLUXO_SENHA) {
        // Primeiro acesso por convite ou link de redefinição: pede a senha antes de entrar
        $("ns-title").textContent = FLUXO_SENHA === "invite" ? "Crie sua senha de acesso" : "Definir nova senha";
        show("view-nova-senha");
        return;
      }
      if (r.data.session) carregarPerfil(); else show("view-login");
    });

    bindLogin(); bindApp();
  }

  function bindLogin() {
    $("form-login").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("login-email").value.trim(), senha = $("login-senha").value;
      $("login-err").textContent = "";
      if (!email || !senha) { $("login-err").textContent = "Informe e-mail e senha."; return; }
      $("btn-login").disabled = true;
      sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
        $("btn-login").disabled = false;
        if (r.error) { $("login-err").textContent = erroAmigavel(r.error); return; }
        $("login-senha").value = "";
        carregarPerfil();
      });
    });
    $("btn-esqueci").addEventListener("click", function () {
      var email = $("login-email").value.trim();
      if (!email) { $("login-err").textContent = "Digite seu e-mail acima e clique de novo em \"Esqueci minha senha\"."; return; }
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function () {
        $("login-err").textContent = "";
        msg("Se o e-mail estiver cadastrado, você receberá um link para definir uma nova senha.", "ok");
      });
    });
    $("form-nova-senha").addEventListener("submit", function (e) {
      e.preventDefault();
      var s = $("ns-senha").value;
      if (s.length < 10) { $("ns-err").textContent = "A senha precisa ter pelo menos 10 caracteres."; return; }
      sb.auth.updateUser({ password: s }).then(function (r) {
        if (r.error) { $("ns-err").textContent = erroAmigavel(r.error); return; }
        history.replaceState(null, "", location.pathname);
        FLUXO_SENHA = null;
        msg("Senha salva.", "ok");
        carregarPerfil();
      });
    });
    $("btn-sair").addEventListener("click", function () { sb.auth.signOut(); });
  }

  function carregarPerfil() {
    sb.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) { show("view-login"); return; }
      sb.from("equipe").select("nome,papel,ativo").eq("user_id", user.id).maybeSingle().then(function (q) {
        if (q.error || !q.data || !q.data.ativo) { show("view-sem-acesso"); $("admin-user").hidden = false; $("admin-user-name").textContent = ""; return; }
        me = { id: user.id, nome: q.data.nome, papel: q.data.papel };
        $("admin-user").hidden = false;
        $("admin-user-name").textContent = me.nome + " · " + ({ admin: "Administrador", recrutador: "Recrutador", leitura: "Leitura" })[me.papel];
        document.querySelectorAll("[data-admin-only]").forEach(function (b) { b.hidden = me.papel !== "admin"; });
        document.querySelectorAll("[data-edit-only]").forEach(function (b) { b.hidden = !can("editar"); });
        show("view-app");
        carregarPainel();
      });
    });
  }

  /* ------------------------------------------------------------ abas */
  function bindApp() {
    document.querySelectorAll(".admin-tabs .tab").forEach(function (t) {
      t.addEventListener("click", function () {
        var tab = t.getAttribute("data-tab");
        document.querySelectorAll(".admin-tabs .tab").forEach(function (o) { if (o === t) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current"); });
        irPara(tab);
      });
    });
    $("filtros").addEventListener("submit", function (e) { e.preventDefault(); page = 0; listar(); });
    $("filtros").addEventListener("reset", function () { setTimeout(function () { page = 0; listar(); }, 0); });
    $("pg-prev").addEventListener("click", function () { if (page > 0) { page--; listar(); } });
    $("pg-next").addEventListener("click", function () { page++; listar(); });
    $("btn-fechar").addEventListener("click", fecharDrawer);
    $("drawer-backdrop").addEventListener("click", fecharDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("drawer").hidden) fecharDrawer(); });
    $("form-pedido").addEventListener("submit", registrarPedido);
    bindGestao();
    bindAgendaFin();
  }

  var ABAS = ["painel", "candidatos", "acompanhamento", "agenda", "vagas", "empresas", "orientacao", "financeiro", "pedidos", "auditoria"];
  function irPara(tab) {
    document.querySelectorAll(".admin-tabs .tab").forEach(function (o) { if (o.getAttribute("data-tab") === tab) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current"); });
    ABAS.forEach(function (n) { $("tab-" + n).hidden = n !== tab; });
    if (tab === "painel") carregarPainel();
    if (tab === "candidatos") listar();
    if (tab === "acompanhamento") listarAcomp();
    if (tab === "vagas") listarVagas();
    if (tab === "agenda") listarAgenda();
    if (tab === "financeiro") listarFin();
    if (tab === "empresas") listarEmpresas();
    if (tab === "orientacao") listarOri();
    if (tab === "pedidos") listarPedidos();
    if (tab === "auditoria") listarAuditoria();
  }

  /* ------------------------------------------------------------ lista de candidatos */
  function listar() {
    var q = sb.from("candidatos")
      .select("id,codigo,nome,nome_social,cargo_desejado,cargo_desejado_2,cargo_desejado_3,area,cidade,uf,modalidade,cnh_categoria,cnh_ear,status,criado_em", { count: "exact" })
      .order("criado_em", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    var busca = $("f-busca").value.trim().replace(/[%,()*]/g, " ").trim();
    var buscaCpf = busca.replace(/\D/g, "");
    if (busca && /^[\d.\-\s]+$/.test(busca) && buscaCpf.length >= 3) q = q.like("cpf", "%" + buscaCpf + "%");
    else if (busca) q = q.or("nome.ilike.%" + busca + "%,nome_social.ilike.%" + busca + "%,email.ilike.%" + busca + "%,codigo.ilike.%" + busca + "%");
    var cargoF = $("f-cargo").value.trim().replace(/[%,()*]/g, " ").trim();
    if (cargoF) q = q.or("cargo_desejado.ilike.%" + cargoF + "%,cargo_desejado_2.ilike.%" + cargoF + "%,cargo_desejado_3.ilike.%" + cargoF + "%");
    if ($("f-area").value) q = q.eq("area", $("f-area").value);
    if ($("f-uf").value) q = q.eq("uf", $("f-uf").value);
    var cidade = $("f-cidade").value.trim().replace(/[%,()*]/g, " ").trim();
    if (cidade) q = q.ilike("cidade", "%" + cidade + "%");
    if ($("f-modalidade").value) q = q.eq("modalidade", $("f-modalidade").value);
    if ($("f-exp").value) q = q.eq("experiencia", $("f-exp").value);
    if ($("f-tipo").value) q = q.contains("tipos_oportunidade", [$("f-tipo").value]);
    var cnhF = $("f-cnh").value;
    if (cnhF === "possui") q = q.not("cnh_categoria", "is", null).neq("cnh_categoria", "nao_possui");
    else if (cnhF === "nao_possui") q = q.eq("cnh_categoria", "nao_possui");
    else if (cnhF) q = q.in("cnh_categoria", CNH_HABILITA[cnhF]);
    if ($("f-ear").value === "sim") q = q.eq("cnh_ear", true);
    if ($("f-perfil").value === "sem") q = q.is("perfil_predominante", null);
    else if ($("f-perfil").value) q = q.eq("perfil_predominante", $("f-perfil").value);
    var st = $("f-status").value;
    if (st === "ativos") q = q.is("excluido_em", null); else if (st) q = q.eq("status", st);
    var hoje = new Date().toISOString().slice(0, 10);
    if ($("f-retencao").value === "vencida") q = q.lt("reter_ate", hoje).is("excluido_em", null);
    if ($("f-retencao").value === "30") { var d = new Date(); d.setDate(d.getDate() + 30); q = q.lte("reter_ate", d.toISOString().slice(0, 10)).is("excluido_em", null); }

    var tbody = $("cand-tbody");
    tbody.innerHTML = "";
    tbody.appendChild(el("tr", null, [el("td", { colspan: "9", class: "muted", text: "Carregando…" })]));
    q.then(function (r) {
      tbody.innerHTML = "";
      if (r.error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "9", class: "error-msg", text: erroAmigavel(r.error) })])); return; }
      var total = r.count || 0;
      $("cand-count").textContent = total + (total === 1 ? " candidato encontrado" : " candidatos encontrados");
      if (!r.data.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "9", class: "muted", text: "Nenhum candidato com estes filtros." })]));
      r.data.forEach(function (c) {
        var btn = el("button", { type: "button", class: "btn-link", text: nomeExib(c), title: c.nome_social ? "Nome civil: " + c.nome : null, onclick: function () { abrir(c.id, btn); } });
        var outros = cargosDe(c).slice(1);
        tbody.appendChild(el("tr", null, [
          el("td", { class: "mono", text: c.codigo }), el("td", null, [btn]),
          el("td", null, [c.cargo_desejado, outros.length ? el("div", { class: "small muted", text: "também: " + outros.join(", ") }) : null]),
          el("td", { text: c.area }), el("td", { text: c.cidade + "/" + c.uf }), el("td", { text: MODAL[c.modalidade] || c.modalidade }),
          el("td", { text: !c.cnh_categoria ? "—" : c.cnh_categoria === "nao_possui" ? "Não" : c.cnh_categoria + (c.cnh_ear ? " · EAR" : "") }),
          el("td", null, [el("span", { class: "pill pill-" + c.status, text: STATUS[c.status] })]), el("td", { text: fmtData(c.criado_em) })
        ]));
      });
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      $("pg-info").textContent = "Página " + (page + 1) + " de " + pages;
      $("pg-prev").disabled = page === 0;
      $("pg-next").disabled = page + 1 >= pages;
    });
  }

  /* ------------------------------------------------------------ detalhe */
  function abrir(id, origin) {
    if ($("drawer").hidden) lastFocus = origin || document.activeElement;
    Promise.all([
      sb.from("candidatos").select("*").eq("id", id).single(),
      sb.from("consentimentos").select("finalidade,concedido,registrado_em,versao_aviso,origem").eq("candidato_id", id).order("registrado_em", { ascending: false }),
      sb.from("interacoes").select("tipo,descricao,empresa,criado_em,autor_id").eq("candidato_id", id).order("criado_em", { ascending: false }),
      sb.from("candidaturas").select("id,etapa,criado_em,vaga_id,vagas(codigo,titulo,status)").eq("candidato_id", id).order("criado_em", { ascending: false }),
      can("admin") ? sb.from("ficha_interna").select("*").eq("candidato_id", id).maybeSingle() : Promise.resolve({ data: null }),
      can("editar") ? sb.from("avaliacoes").select(AVAL_COLS).eq("candidato_id", id).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] }),
      can("editar") ? sb.from("laudos").select("*").eq("candidato_id", id) : Promise.resolve({ data: [] }),
      can("editar") ? sb.from("compromissos").select("id,titulo,inicio,status").eq("candidato_id", id).order("inicio", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      can("editar") ? sb.from("entrevistas_star").select("*").eq("candidato_id", id) : Promise.resolve({ data: [] }),
      can("editar") ? sb.from("documentos_pessoa").select("*").eq("candidato_id", id).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] }),
      can("editar") ? sb.from("orientacao_clientes").select("id,codigo,status").eq("candidato_origem", id).maybeSingle() : Promise.resolve({ data: null })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      current = res[0].data;
      sb.rpc("registrar_acesso", { p_acao: "ver_perfil", p_candidato: id });
      // Sem o SQL 006 as tabelas não existem: a seção mostra o aviso em vez de quebrar o painel
      var aval = res[5].error ? null : (res[5].data || []), laudos = res[6].error ? null : (res[6].data || []);
      // Sem o SQL 010 a tabela da entrevista STAR não existe: a seção mostra o aviso em vez de quebrar o painel
      var stars = res[8].error ? null : (res[8].data || []);
      renderDrawer(current, res[1].data || [], res[2].data || [], res[3].data || [], res[4].data, aval, laudos, res[7].error ? null : (res[7].data || []), stars, res[9].error ? null : (res[9].data || []), res[10].error ? null : (res[10].data || false));
      abrirDrawer();
    });
  }
  function abrirDrawer() {
    var jaAberto = !$("drawer").hidden;
    $("drawer").hidden = false; $("drawer-backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    if (!jaAberto) $("d-nome").focus(); else $("drawer").scrollTop = 0;
  }
  /** Abre o painel lateral para vagas e empresas. */
  function abrirPainel(cod, titulo, sub, build, origin) {
    if ($("drawer").hidden) lastFocus = origin || document.activeElement;
    current = null;
    $("d-codigo").textContent = cod || ""; $("d-nome").textContent = titulo; $("d-sub").textContent = sub || "";
    var body = $("drawer-body"); body.innerHTML = "";
    build(body);
    abrirDrawer();
  }
  function fecharDrawer() {
    $("drawer").hidden = true; $("drawer-backdrop").hidden = true; document.body.style.overflow = "";
    current = null; $("drawer-body").innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function dl(pairs) {
    var d = el("dl", { class: "kv" });
    pairs.forEach(function (p) { if (p[1] === null || p[1] === undefined || p[1] === "") return; d.appendChild(el("dt", { text: p[0] })); d.appendChild(el("dd", null, [typeof p[1] === "string" ? document.createTextNode(p[1]) : p[1]])); });
    return d;
  }
  function section(title, nodes) { return el("section", { class: "d-sec" }, [el("h3", { text: title })].concat(nodes)); }
  function safeLink(url, label) {
    if (!/^https?:\/\//i.test(url || "")) return null;
    return el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: label || url });
  }

  function renderDrawer(c, cons, inter, cands, ficha, aval, laudos, comps, stars, docs, cli) {
    $("d-codigo").textContent = c.codigo;
    $("d-nome").textContent = nomeExib(c);
    $("d-sub").textContent = c.cargo_desejado + " · " + c.cidade + "/" + c.uf;
    var body = $("drawer-body"); body.innerHTML = "";
    var excluido = !!c.excluido_em;

    if (excluido) body.appendChild(el("p", { class: "note", text: "Registro anonimizado em " + fmtData(c.excluido_em) + "." }));

    // Status
    if (!excluido) {
      var sel = el("select", { id: "d-status", "aria-label": "Status do registro" });
      Object.keys(STATUS).filter(function (k) { return k !== "excluido"; }).forEach(function (k) { var o = el("option", { value: k, text: STATUS[k] }); if (k === c.status) o.selected = true; sel.appendChild(o); });
      var btnSt = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Salvar status", onclick: function () {
        btnSt.disabled = true;
        sb.from("candidatos").update({ status: sel.value }).eq("id", c.id).select("status").then(function (r) {
          btnSt.disabled = false;
          if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Seu papel não permite alterar o status.", "err"); return; }
          c.status = sel.value; msg("Status atualizado.", "ok"); listar();
        });
      } });
      if (!can("editar")) { sel.disabled = true; btnSt.hidden = true; }
      body.appendChild(section("Status", [el("div", { class: "inline" }, [sel, btnSt])]));
    }

    // Ficha interna (somente administrador)
    if (can("admin") && !excluido) body.appendChild(secaoFicha(c, ficha));

    // Contato
    body.appendChild(section("Contato", [dl([
      ["Nome social", c.nome_social], ["Nome civil", c.nome_social ? c.nome : null], ["E-mail", c.email], ["Telefone", c.telefone], ["CPF", can("editar") ? fmtCpf(c.cpf) : (c.cpf ? "***." + c.cpf.slice(3, 6) + ".***-**" : null)], ["LinkedIn", safeLink(c.linkedin_url, "Abrir perfil")], ["Cidade", c.cidade + "/" + c.uf]
    ])]));

    // Perfil
    body.appendChild(section("Perfil profissional", [dl([
      ["Área", c.area], ["Cargos desejados", cargosDe(c).map(function (x, i) { return (i + 1) + "ª " + x; }).join(" · ")],
      ["Experiência total", c.experiencia], ["Experiência no cargo (1ª opção)", c.experiencia_cargo], ["Escolaridade", c.escolaridade], ["CNH", fmtCnh(c)],
      ["Competências", c.competencias], ["Idiomas", c.idiomas], ["Modalidade", MODAL[c.modalidade]],
      ["Tipo de oportunidade", (c.tipos_oportunidade || []).map(function (t) { return TIPOS[t] || t; }).join(", ")],
      ["Disponibilidade", c.disponibilidade], ["Pretensão salarial", c.pretensao_faixa]
    ]), el("p", { class: "resumo", text: c.resumo })]));

    // Perfil comportamental
    if (c.perfil_predominante) {
      var pb = el("ul", { class: "res-bars" });
      [["aguia", c.perfil_aguia], ["gato", c.perfil_gato], ["lobo", c.perfil_lobo], ["tubarao", c.perfil_tubarao]]
        .sort(function (a, b) { return b[1] - a[1]; })
        .forEach(function (r) {
          pb.appendChild(el("li", { class: r[0] === c.perfil_predominante ? "is-top" : "" }, [
            el("span", { class: "res-bar-label", text: PERFIS[r[0]] }),
            el("span", { class: "res-bar-track", "aria-hidden": "true" }, [el("span", { style: "width:" + Number(r[1]) + "%" })]),
            el("span", { class: "res-bar-val", text: Number(r[1]) + "%" })
          ]));
        });
      body.appendChild(section("Perfil comportamental", [
        el("p", null, [el("strong", { text: "Predominante: " + PERFIS[c.perfil_predominante] }), el("span", { class: "muted small", text: " · respondido em " + fmtData(c.perfil_respondido_em) })]),
        pb,
        el("p", { class: "hint", text: "Questionário de autoconhecimento, não é teste psicológico. Use como ponto de partida para a entrevista, nunca como critério isolado de aprovação ou eliminação." })
      ]));
    }

    // Avaliação por link (DISC, Big Five, Eneagrama, Preferência cerebral), entrevista STAR e laudo
    if (can("editar") && !excluido) {
      body.appendChild(secaoAvaliacoes(c, cands, aval));
      body.appendChild(secaoStar(c, cands, stars));
      body.appendChild(secaoLaudo(c, cands, aval, laudos, stars));
      body.appendChild(secaoAgendaCandidato(c, comps, cands));
    }

    // Candidaturas
    var candList = el("ul", { class: "plain" });
    if (!cands.length) candList.appendChild(el("li", { class: "muted small", text: "Nenhuma candidatura a vagas." }));
    cands.forEach(function (k) {
      var v = k.vagas || {};
      candList.appendChild(el("li", null, [
        el("button", { type: "button", class: "btn-link", text: (v.codigo || "") + " · " + (v.titulo || "Vaga"), onclick: function () { abrirVaga(k.vaga_id); } }),
        " ", el("span", { class: "pill pill-etapa-" + k.etapa, text: ETAPAS_CAND[k.etapa] || k.etapa }),
        el("span", { class: "muted small", text: " · " + fmtData(k.criado_em) })
      ]));
    });
    body.appendChild(section("Candidaturas a vagas", [candList]));

    // Diversidade (dados sensíveis: só admin e recrutador, carregados sob demanda e com registro de acesso)
    if (can("editar") && !excluido) {
      var divBox = el("div");
      var temDiv = ult_dados_div(cons);
      var btnDiv = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Mostrar dados de diversidade", onclick: function () {
        btnDiv.disabled = true;
        sb.rpc("registrar_acesso", { p_acao: "ver_diversidade", p_candidato: c.id });
        sb.from("diversidade").select("*").eq("candidato_id", c.id).maybeSingle().then(function (r) {
          btnDiv.remove();
          if (r.error) { divBox.appendChild(el("p", { class: "error-msg", text: erroAmigavel(r.error) })); return; }
          if (!r.data) { divBox.appendChild(el("p", { class: "muted small", text: "A pessoa não informou dados de diversidade." })); return; }
          var d = r.data;
          divBox.appendChild(dl([
            ["Gênero", DIV.genero[d.genero]], ["Pessoa trans", DIV.simnao[d.pessoa_trans]], ["Raça/cor (IBGE)", DIV.raca_cor[d.raca_cor]],
            ["Pessoa com deficiência", DIV.simnao[d.pcd]], ["Tipo de deficiência", DIV.pcd_tipo[d.pcd_tipo]], ["Adaptações", d.pcd_adaptacoes],
            ["LGBTQIA+", DIV.simnao[d.lgbtqia]], ["50 anos ou mais", DIV.simnao[d.pessoa_50_mais]]
          ]));
        });
      } });
      divBox.appendChild(el("p", { class: "hint", text: temDiv ? "Dado sensível (LGPD art. 11), informado com autorização específica. Use só para vagas afirmativas e indicadores de diversidade. O acesso fica registrado." : "Sem autorização registrada para dados de diversidade." }));
      if (temDiv) divBox.appendChild(btnDiv);
      body.appendChild(section("Diversidade e inclusão", [divBox]));
    }

    // Currículo
    var cvNodes = [];
    if (c.curriculo_path) {
      var btnCv = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Abrir currículo (PDF)", onclick: function () {
        btnCv.disabled = true;
        sb.storage.from("curriculos").createSignedUrl(c.curriculo_path, 60).then(function (r) {
          btnCv.disabled = false;
          if (r.error) { msg("Você não tem permissão para abrir currículos ou o arquivo não existe.", "err"); return; }
          sb.rpc("registrar_acesso", { p_acao: "baixar_curriculo", p_candidato: c.id });
          var a = el("a", { href: r.data.signedUrl, target: "_blank", rel: "noopener noreferrer" });
          document.body.appendChild(a); a.click(); a.remove();
        });
      } });
      if (!can("editar")) btnCv.hidden = true;
      cvNodes.push(btnCv, el("p", { class: "hint", text: "O link é temporário (60 segundos) e o acesso fica registrado." }));
    }
    var lk = safeLink(c.curriculo_link, "Abrir link do currículo informado pelo candidato");
    if (lk) cvNodes.push(el("p", null, [lk]));
    if (!cvNodes.length) cvNodes.push(el("p", { class: "muted small", text: "Nenhum currículo enviado." }));
    body.appendChild(section("Currículo", cvNodes));

    // Autorizações (última de cada finalidade)
    var ult = {};
    cons.forEach(function (k) { if (!ult[k.finalidade]) ult[k.finalidade] = k; });
    var consList = el("ul", { class: "plain" });
    Object.keys(FINALIDADES).forEach(function (f) {
      var k = ult[f];
      consList.appendChild(el("li", null, [
        el("span", { class: "pill " + (k && k.concedido ? "pill-ok" : "pill-no"), text: k && k.concedido ? "Sim" : "Não" }),
        " " + FINALIDADES[f] + (k ? " — " + fmtDataHora(k.registrado_em) + " (aviso v" + k.versao_aviso + ")" : "")
      ]));
    });
    var consNodes = [consList];
    if (can("editar") && !excluido && ult.compartilhar_empresas && ult.compartilhar_empresas.concedido) {
      consNodes.push(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Registrar retirada da autorização de compartilhamento", onclick: function () {
        sb.from("consentimentos").insert({ candidato_id: c.id, finalidade: "compartilhar_empresas", concedido: false, versao_aviso: ult.compartilhar_empresas.versao_aviso, origem: "pedido_titular" }).then(function (r) {
          if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
          msg("Retirada de autorização registrada.", "ok"); abrir(c.id, lastFocus);
        });
      } }));
    }
    body.appendChild(section("Autorizações", consNodes));

    // Contatos e encaminhamentos
    var lista = el("ol", { class: "timeline" });
    if (!inter.length) lista.appendChild(el("li", { class: "muted small", text: "Nenhum registro ainda." }));
    inter.forEach(function (i) {
      lista.appendChild(el("li", null, [
        el("strong", { text: ({ contato: "Contato", encaminhamento: "Encaminhamento", observacao: "Observação", atualizacao_status: "Status" })[i.tipo] || i.tipo }),
        el("span", { class: "muted small", text: " · " + fmtDataHora(i.criado_em) + (i.empresa ? " · " + i.empresa : "") }),
        el("p", { text: i.descricao })
      ]));
    });
    var interNodes = [lista];
    if (can("editar") && !excluido) {
      var tipo = el("select", { id: "i-tipo" }, [el("option", { value: "contato", text: "Contato realizado" }), el("option", { value: "encaminhamento", text: "Encaminhamento para empresa" }), el("option", { value: "observacao", text: "Observação" })]);
      var emp = el("input", { type: "text", id: "i-empresa", maxlength: "120" });
      var desc = el("textarea", { id: "i-desc", maxlength: "2000", required: true });
      var err = el("p", { class: "error-msg", role: "alert" });
      var form = el("form", { class: "admin-form", novalidate: true }, [
        el("div", { class: "fields" }, [
          el("div", { class: "field" }, [el("label", { for: "i-tipo", text: "Tipo" }), tipo]),
          el("div", { class: "field" }, [el("label", { for: "i-empresa", text: "Empresa (se houver)" }), emp]),
          el("div", { class: "field full" }, [el("label", { for: "i-desc", text: "Descrição" }), desc])
        ]), err, el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Registrar" })
      ]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!desc.value.trim()) { err.textContent = "Descreva o contato ou encaminhamento."; return; }
        if (tipo.value === "encaminhamento" && !(ult.compartilhar_empresas && ult.compartilhar_empresas.concedido)) {
          err.textContent = "Este candidato não autorizou o compartilhamento do perfil com empresas. Peça a autorização antes de encaminhar."; return;
        }
        sb.from("interacoes").insert({ candidato_id: c.id, tipo: tipo.value, descricao: desc.value.trim(), empresa: emp.value.trim() || null, autor_id: me.id }).then(function (r) {
          if (r.error) { err.textContent = erroAmigavel(r.error); return; }
          msg("Registro incluído.", "ok"); abrir(c.id, lastFocus);
        });
      });
      interNodes.push(el("details", null, [el("summary", { class: "btn btn-secondary btn-sm", text: "Novo registro" }), form]));
    }
    body.appendChild(section("Contatos e encaminhamentos", interNodes));

    // Assessoria de carreira e documentos
    if (can("editar") && !excluido) {
      body.appendChild(secaoCarreira(c, cli));
      body.appendChild(secaoDocumentos({ coluna: "candidato_id", pasta: "candidatos", id: c.id }, docs, function () { abrir(c.id, lastFocus); }));
    }

    // Retenção e LGPD
    var vencido = c.reter_ate < new Date().toISOString().slice(0, 10);
    var ret = [dl([["Cadastrado em", fmtDataHora(c.criado_em)], ["Atualizado em", fmtDataHora(c.atualizado_em)], ["Manter até", fmtData(c.reter_ate) + (vencido && !excluido ? " (vencido)" : "")],
      ["Último acompanhamento", c.ultimo_checkin ? fmtData(c.ultimo_checkin) : "Ainda não houve"], ["Próximo acompanhamento", excluido ? null : fmtData(c.proximo_checkin)]])];
    if (can("editar") && !excluido) {
      ret.push(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Candidato confirmou interesse: renovar por 24 meses", onclick: function () {
        sb.rpc("renovar_retencao", { p_candidato: c.id }).then(function (r) {
          if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
          msg("Prazo renovado até " + fmtData(r.data) + ".", "ok"); abrir(c.id, lastFocus);
        });
      } }));
    }
    if (can("admin") && !excluido) {
      var conf = el("input", { type: "text", id: "conf-excluir", autocomplete: "off" });
      var btnEx = el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Excluir dados definitivamente", onclick: function () {
        if (conf.value.trim().toUpperCase() !== c.codigo) { msg("Digite o código " + c.codigo + " para confirmar.", "err"); conf.focus(); return; }
        btnEx.disabled = true;
        var passo1 = (c.curriculo_path ? sb.storage.from("curriculos").remove([c.curriculo_path]) : Promise.resolve({})).then(function (r0) {
          return r0.error ? r0 : apagarArquivos("candidato_id", c.id);
        });
        passo1.then(function (r1) {
          if (r1.error) { btnEx.disabled = false; msg("Não foi possível apagar os arquivos (currículo e documentos). Nada foi excluído.", "err"); return; }
          sb.rpc("anonimizar_candidato", { p_candidato: c.id }).then(function (r2) {
            if (r2.error) { btnEx.disabled = false; msg(erroAmigavel(r2.error), "err"); return; }
            msg("Dados excluídos (registro anonimizado).", "ok"); fecharDrawer(); listar();
          });
        });
      } });
      ret.push(el("div", { class: "danger-zone" }, [
        el("h4", { text: "Excluir dados" }),
        el("p", { class: "small", text: "Use para pedido de exclusão do titular ou fim do prazo de retenção. Apaga o currículo e os documentos guardados e anonimiza o cadastro. Não pode ser desfeito." }),
        el("label", { for: "conf-excluir", class: "small", text: "Digite " + c.codigo + " para confirmar" }), conf, btnEx
      ]));
    }
    body.appendChild(section("Retenção e LGPD", ret));
  }

  /* ------------------------------------------------------------ pedidos LGPD */
  function listarPedidos() {
    var tbody = $("ped-tbody"); tbody.innerHTML = "";
    sb.from("solicitacoes_titular").select("*").order("criado_em", { ascending: false }).limit(200).then(function (r) {
      if (r.error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "error-msg", text: erroAmigavel(r.error) })])); return; }
      if (!r.data.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "muted", text: "Nenhum pedido registrado." })]));
      var hoje = new Date().toISOString().slice(0, 10);
      r.data.forEach(function (p) {
        var atrasado = p.status !== "concluida" && p.status !== "recusada" && p.prazo_resposta < hoje;
        var sel = el("select", { "aria-label": "Status do pedido" });
        [["aberta", "Aberto"], ["em_andamento", "Em andamento"], ["concluida", "Concluído"], ["recusada", "Recusado"]].forEach(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === p.status) op.selected = true; sel.appendChild(op); });
        sel.addEventListener("change", function () {
          var upd = { status: sel.value, responsavel_id: me.id, respondido_em: (sel.value === "concluida" || sel.value === "recusada") ? new Date().toISOString() : null };
          sb.from("solicitacoes_titular").update(upd).eq("id", p.id).then(function (u) { msg(u.error ? erroAmigavel(u.error) : "Pedido atualizado.", u.error ? "err" : "ok"); listarPedidos(); });
        });
        tbody.appendChild(el("tr", null, [
          el("td", { text: fmtData(p.criado_em) }), el("td", { text: p.email_contato }), el("td", { text: PEDIDOS[p.tipo] || p.tipo }),
          el("td", null, [el("span", { class: atrasado ? "pill pill-no" : "", text: fmtData(p.prazo_resposta) + (atrasado ? " · atrasado" : "") })]),
          el("td", null, [sel]), el("td", { class: "small muted", text: p.detalhes || "" })
        ]));
      });
    });
  }
  function registrarPedido(e) {
    e.preventDefault();
    var email = $("p-email").value.trim(), codigo = $("p-codigo").value.trim().toUpperCase();
    $("p-err").textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $("p-err").textContent = "Informe o e-mail do titular."; return; }
    var achar = codigo ? sb.from("candidatos").select("id").eq("codigo", codigo).maybeSingle() : Promise.resolve({ data: null });
    achar.then(function (r) {
      if (codigo && !r.data) { $("p-err").textContent = "Código não encontrado."; return; }
      sb.from("solicitacoes_titular").insert({ email_contato: email, tipo: $("p-tipo").value, detalhes: $("p-detalhes").value.trim() || null, candidato_id: r.data ? r.data.id : null }).then(function (ins) {
        if (ins.error) { $("p-err").textContent = erroAmigavel(ins.error); return; }
        $("form-pedido").reset(); msg("Pedido registrado.", "ok"); listarPedidos();
      });
    });
  }

  /* ------------------------------------------------------------ auditoria */
  function listarAuditoria() {
    var tbody = $("aud-tbody"); tbody.innerHTML = "";
    Promise.all([
      sb.from("auditoria").select("*").order("id", { ascending: false }).limit(200),
      sb.from("equipe").select("user_id,nome")
    ]).then(function (res) {
      if (res[0].error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "5", class: "error-msg", text: erroAmigavel(res[0].error) })])); return; }
      var nomes = {}; (res[1].data || []).forEach(function (u) { nomes[u.user_id] = u.nome; });
      res[0].data.forEach(function (a) {
        tbody.appendChild(el("tr", null, [
          el("td", { text: fmtDataHora(a.criado_em) }), el("td", { text: a.ator_id ? (nomes[a.ator_id] || "Usuário removido") : "Site / sistema" }),
          el("td", { text: a.acao.replace(/_/g, " ") }), el("td", { class: "mono small", text: (a.entidade_id || "").slice(0, 8) }),
          el("td", { class: "small", text: a.detalhes && a.detalhes.status_para ? (STATUS[a.detalhes.status_de] || "") + " → " + (STATUS[a.detalhes.status_para] || "") : "" })
        ]));
      });
    });
  }

  /* ============================================================ GESTÃO: painel, acompanhamento, vagas, empresas */
  var ETAPAS_CAND = { inscrito: "Inscrito", triagem: "Triagem", entrevista: "Entrevista", finalista: "Finalista", contratado: "Contratado", nao_selecionado: "Não selecionado" };
  var VAGA_STATUS = { rascunho: "Rascunho", aberta: "Aberta", pausada: "Pausada", encerrada: "Encerrada" };
  var AFIRM = { pcd: "Afirmativa · PcD", mulheres: "Afirmativa · Mulheres", pessoas_negras: "Afirmativa · Pessoas negras", lgbtqia: "Afirmativa · LGBTQIA+", pessoas_50_mais: "Afirmativa · 50+", pessoas_trans: "Afirmativa · Pessoas trans" };
  var EMP_ETAPAS = [["prospeccao", "Prospecção"], ["contato_feito", "Contato feito"], ["proposta", "Proposta enviada"], ["negociacao", "Negociação"], ["cliente", "Cliente"], ["inativo", "Inativo"], ["perdida", "Perdida"]];
  var EMP_ETAPA = {}; EMP_ETAPAS.forEach(function (e) { EMP_ETAPA[e[0]] = e[1]; });
  var SERVICOS = [["rs", "Recrutamento e seleção"], ["mapeamento", "Mapeamento de talentos"], ["divulgacao", "Divulgação de vagas"], ["consultoria", "Consultoria de RH"],
    ["processos", "Estruturação de processos de RH"], ["treinamento", "Treinamento e desenvolvimento"], ["avaliacao_psicologica", "Avaliação comportamental / perfil"],
    ["clima", "Pesquisa de clima"], ["empregabilidade", "Projetos de empregabilidade"], ["outro", "Outro"]];
  var SERVICO = {}; SERVICOS.forEach(function (e) { SERVICO[e[0]] = e[1]; });
  var PORTES = [["mei", "MEI"], ["micro", "Microempresa"], ["pequena", "Pequena"], ["media", "Média"], ["grande", "Grande"]];
  var ORIGENS = [["indicacao", "Indicação"], ["linkedin", "LinkedIn"], ["instagram", "Instagram"], ["site", "Site"], ["whatsapp", "WhatsApp"], ["evento", "Evento"], ["prospeccao_ativa", "Prospecção ativa"], ["outro", "Outro"]];
  var EMP_INT = { ligacao: "Ligação", reuniao: "Reunião", email: "E-mail", whatsapp: "WhatsApp", proposta: "Proposta", visita: "Visita", outro: "Outro" };
  var PLANOS = [["nenhum", "Nenhum plano contratado"], ["curriculo", "Currículo"], ["linkedin", "LinkedIn"], ["curriculo_linkedin", "Currículo + LinkedIn"], ["entrevistas", "Preparação para entrevistas"],
    ["orientacao", "Orientação de carreira"], ["posicionamento", "Posicionamento profissional"], ["personalizado", "Plano personalizado"]];
  var DIV = {
    genero: { mulher: "Mulher", homem: "Homem", nao_binaria: "Pessoa não binária", outro: "Outro" },
    raca_cor: { branca: "Branca", preta: "Preta", parda: "Parda", amarela: "Amarela", indigena: "Indígena" },
    pcd_tipo: { fisica: "Física", auditiva: "Auditiva", visual: "Visual", intelectual: "Intelectual", psicossocial: "Psicossocial", tea: "TEA", multipla: "Múltipla" },
    simnao: { sim: "Sim", nao: "Não" }
  };
  var CORES_PERFIL = { aguia: "#c4522a", gato: "#d9893b", lobo: "#3c6e71", tubarao: "#1a1814", sem: "#b9b2a6" };
  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  var empresasCache = [], empView = "funil";

  function hojeISO(n) { var d = new Date(); d.setDate(d.getDate() + (n || 0)); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function opts(obj) { return Object.keys(obj).map(function (k) { return [k, obj[k]]; }); }
  function ult_dados_div(cons) { for (var i = 0; i < cons.length; i++) if (cons[i].finalidade === "dados_diversidade") return cons[i].concedido; return false; }
  /** Nome para chamar a pessoa: o nome social, quando houver */
  function nomeExib(c) { return (c && (c.nome_social || c.nome)) || ""; }
  function cargosDe(c) { return [c.cargo_desejado, c.cargo_desejado_2, c.cargo_desejado_3].filter(Boolean); }
  function primeiroNome(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
  function foneWa(t) {
    var d = String(t || "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    return d.length >= 12 && d.length <= 13 ? d : null;
  }
  function copiar(texto, alvo) {
    var ok = function () { alvo.textContent = " Copiado."; }, falha = function () { alvo.textContent = " " + texto; };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(ok, falha); else falha();
  }
  function confirmarDuasVezes(btn, textoConfirma, acao) {
    var armado = false, original = btn.textContent;
    btn.addEventListener("click", function () {
      if (!armado) { armado = true; btn.textContent = textoConfirma; setTimeout(function () { armado = false; btn.textContent = original; }, 5000); return; }
      acao();
    });
  }

  /** Monta um formulário a partir de uma lista de campos. Todo valor entra por .value/textContent (sem HTML). */
  function buildForm(spec, data, prefix) {
    var wrap = el("div", { class: "fields" }), inputs = {};
    spec.forEach(function (f) {
      var id = prefix + "-" + f.k, inp, v = data ? data[f.k] : f.def;
      if (v === undefined) v = f.def;
      if (f.type === "textarea") inp = el("textarea", { id: id, maxlength: String(f.max || 2000), rows: String(f.rows || 3) });
      else if (f.type === "select") {
        inp = el("select", { id: id });
        if (!f.required) inp.appendChild(el("option", { value: "", text: f.placeholder || "—" }));
        f.options.forEach(function (o) { inp.appendChild(el("option", { value: o[0], text: o[1] })); });
      } else if (f.type === "checks") {
        inp = el("fieldset", { class: "checks-grid", id: id }, [el("legend", { class: "visually-hidden", text: f.label })]);
        f.options.forEach(function (o) {
          var cb = el("input", { type: "checkbox", id: id + "-" + o[0], value: o[0] });
          if ((v || []).indexOf(o[0]) >= 0) cb.checked = true;
          inp.appendChild(el("label", { for: id + "-" + o[0], class: "check-inline" }, [cb, " " + o[1]]));
        });
      } else inp = el("input", { type: f.type || "text", id: id, maxlength: f.max ? String(f.max) : null, step: f.step || null, min: f.min != null ? String(f.min) : null, inputmode: f.inputmode || null });
      if (f.type !== "checks" && v !== null && v !== undefined) inp.value = v;
      if (f.required && f.type !== "checks") inp.setAttribute("aria-required", "true");
      if (!can("editar")) inp.disabled = true;
      inputs[f.k] = inp;
      var label = f.type === "checks" ? el("p", { class: "label-like", text: f.label }) : el("label", { for: id }, [f.label, f.required ? el("span", { class: "req", "aria-hidden": "true", text: " *" }) : null]);
      wrap.appendChild(el("div", { class: "field" + (f.full ? " full" : "") }, [label, inp, f.hint ? el("span", { class: "hint", text: f.hint }) : null]));
    });
    return {
      node: wrap, inputs: inputs,
      values: function () {
        var o = {};
        spec.forEach(function (f) {
          var i = inputs[f.k];
          if (f.type === "checks") o[f.k] = [].slice.call(i.querySelectorAll("input:checked")).map(function (c) { return c.value; });
          else if (f.type === "number") o[f.k] = i.value === "" ? null : Number(i.value);
          else { var t = i.value.trim(); o[f.k] = t === "" ? null : t; }
        });
        return o;
      },
      faltando: function () { return spec.filter(function (f) { return f.required && f.type !== "checks" && !inputs[f.k].value.trim(); }).map(function (f) { return f.label; }); }
    };
  }

  function bindGestao() {
    $("btn-nova-vaga").addEventListener("click", function (e) { abrirVaga(null, null, e.currentTarget); });
    $("btn-nova-empresa").addEventListener("click", function (e) { abrirEmpresa(null, e.currentTarget); });
    $("btn-nova-pessoa").addEventListener("click", function (e) { abrirCliente(null, e.currentTarget); });
    $("ori-filtros").addEventListener("submit", function (e) { e.preventDefault(); renderOri(); });
    $("of-busca").addEventListener("input", function () { renderOri(); });
    $("of-status").addEventListener("change", function () { renderOri(); });
    $("vg-status").addEventListener("change", listarVagas);
    $("ac-janela").addEventListener("change", listarAcomp);
    fillSelect2($("ef-servico"), SERVICOS); fillSelect2($("ef-etapa"), EMP_ETAPAS);
    ["ef-busca", "ef-servico", "ef-etapa"].forEach(function (id) { $(id).addEventListener(id === "ef-busca" ? "input" : "change", renderEmpresas); });
    $("emp-filtros").addEventListener("submit", function (e) { e.preventDefault(); });
    document.querySelectorAll("[data-emp-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        empView = b.getAttribute("data-emp-view");
        document.querySelectorAll("[data-emp-view]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        renderEmpresas();
      });
    });
    var modelo = $("ac-modelo");
    modelo.value = lerModelo();
    modelo.addEventListener("input", function () { try { localStorage.setItem("prh_modelo_acomp", modelo.value); } catch (e) { /* sem armazenamento: usa o texto só nesta sessão */ } });
    $("ac-modelo-padrao").addEventListener("click", function () { modelo.value = MODELO_PADRAO; try { localStorage.removeItem("prh_modelo_acomp"); } catch (e) { /* ok */ } });
  }
  function fillSelect2(sel, pares) { pares.forEach(function (p) { sel.appendChild(el("option", { value: p[0], text: p[1] })); }); }

  /* ------------------------------------------------------------ visão geral */
  function carregarPainel() {
    var k = $("kpis"), g = $("dash-grid");
    k.innerHTML = ""; g.innerHTML = "";
    k.appendChild(el("p", { class: "muted", text: "Carregando indicadores…" }));
    sb.rpc("painel_resumo").then(function (r) {
      k.innerHTML = "";
      if (r.error) { k.appendChild(el("p", { class: "error-msg", text: /painel_resumo|function/i.test(r.error.message || "") ? "Atualize o banco de dados (arquivo docs/002-vagas-e-diversidade.sql) para ver os indicadores." : erroAmigavel(r.error) })); return; }
      renderPainel(r.data || {});
      painelExtras();
      $("painel-atualizado").textContent = "Atualizado em " + new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    });
  }
  function mapa(arr) { var m = {}; (arr || []).forEach(function (x) { m[x.k] = x; }); return m; }
  function soma(arr, campo) { return (arr || []).reduce(function (a, x) { return a + Number(x[campo || "n"] || 0); }, 0); }

  function kpi(rotulo, valor, sub, opts2) {
    opts2 = opts2 || {};
    var tag = opts2.tab ? "button" : "div";
    var card = el(tag, { class: "kpi" + (opts2.alerta ? " kpi-alerta" : ""), type: opts2.tab ? "button" : null, onclick: opts2.tab ? function () { irPara(opts2.tab); } : null }, [
      el("span", { class: "kpi-label", text: rotulo }), el("strong", { class: "kpi-valor", text: String(valor) }), sub ? el("span", { class: "kpi-sub", text: sub }) : null
    ]);
    return card;
  }
  function cartao(titulo, nodes, cls) { return el("section", { class: "dash-card " + (cls || "") }, [el("h2", { text: titulo })].concat(nodes)); }
  function barras(itens, opts2) {
    opts2 = opts2 || {};
    if (!itens.length || !soma(itens)) return el("p", { class: "muted small", text: opts2.vazio || "Sem dados ainda." });
    var max = Math.max.apply(null, itens.map(function (i) { return i.n; })) || 1;
    var ul = el("ul", { class: "hbars" });
    itens.forEach(function (i) {
      var w = Math.round(i.n / max * 100);
      ul.appendChild(el("li", { onclick: i.click || null, class: i.click ? "clicavel" : "" }, [
        el("span", { class: "hb-label", text: i.label }),
        el("span", { class: "hb-track", "aria-hidden": "true" }, [el("span", { class: "hb-fill", style: "width:" + w + "%" + (i.cor ? ";background:" + i.cor : "") })]),
        el("span", { class: "hb-val", text: (opts2.fmt ? opts2.fmt(i.n) : String(i.n)) + (i.extra ? " · " + i.extra : "") })
      ]));
    });
    return ul;
  }

  function renderPainel(d) {
    var vg = mapa(d.vagas), cand = mapa(d.candidaturas), emp = mapa(d.empresas);
    var empN = function (e) { return emp[e] ? emp[e].n : 0; }, empV = function (e) { return emp[e] ? Number(emp[e].valor) : 0; };
    var pipeline = empV("proposta") + empV("negociacao");
    var ativos = d.ativos || 0;
    var k = $("kpis");
    k.appendChild(kpi("Talentos no banco", ativos, "+" + (d.novos_30 || 0) + " nos últimos 30 dias", { tab: "candidatos" }));
    k.appendChild(kpi("Acompanhamentos pendentes", d.checkin_pendente || 0, "contato mensal com candidatos", { tab: "acompanhamento", alerta: d.checkin_pendente > 0 }));
    k.appendChild(kpi("Vagas abertas", vg.aberta ? vg.aberta.n : 0, (vg.rascunho ? vg.rascunho.n : 0) + " em rascunho", { tab: "vagas" }));
    k.appendChild(kpi("Candidaturas", soma(d.candidaturas), (cand.entrevista ? cand.entrevista.n : 0) + " em entrevista · " + (cand.contratado ? cand.contratado.n : 0) + " contratados", { tab: "vagas" }));
    k.appendChild(kpi("Clientes", empN("cliente"), empN("prospeccao") + empN("contato_feito") + " em prospecção", { tab: "empresas" }));
    k.appendChild(kpi("Propostas em aberto", brl.format(pipeline), empN("proposta") + empN("negociacao") + " em proposta ou negociação", { tab: "empresas" }));
    k.appendChild(kpi("Autorizaram compartilhar", ativos ? Math.round((d.compartilhar_ok || 0) / ativos * 100) + "%" : "—", (d.compartilhar_ok || 0) + " perfis podem ser apresentados a empresas"));
    k.appendChild(kpi("Prazo de guarda vencido", d.retencao_vencida || 0, "revisar ou excluir (LGPD)", { alerta: d.retencao_vencida > 0, tab: "candidatos" }));
    var badge = $("badge-checkin"); badge.hidden = !d.checkin_pendente; badge.textContent = d.checkin_pendente || "";

    var g = $("dash-grid");
    // cadastros por mês (6 meses, completando meses sem cadastro)
    var porMes = {}; (d.por_mes || []).forEach(function (m) { porMes[m.mes] = m.n; });
    var meses = [], hoje = new Date();
    for (var i = 5; i >= 0; i--) { var dt = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); var key = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"); meses.push({ k: key, n: porMes[key] || 0, label: dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") }); }
    var maxM = Math.max.apply(null, meses.map(function (m) { return m.n; })) || 1;
    var cols = el("div", { class: "cols", role: "img", "aria-label": "Cadastros por mês: " + meses.map(function (m) { return m.label + " " + m.n; }).join(", ") });
    meses.forEach(function (m) { cols.appendChild(el("div", { class: "col" }, [el("span", { class: "col-val", text: String(m.n) }), el("span", { class: "col-bar", style: "height:" + Math.max(2, Math.round(m.n / maxM * 100)) + "%" }), el("span", { class: "col-lab", text: m.label })])); });
    g.appendChild(cartao("Novos cadastros por mês", [cols], "span-2"));

    g.appendChild(cartao("Funil comercial", [barras(EMP_ETAPAS.filter(function (e) { return e[0] !== "inativo"; }).map(function (e) {
      return { label: e[1], n: empN(e[0]), extra: empV(e[0]) ? brl.format(empV(e[0])) : "", cor: e[0] === "perdida" ? "#b9b2a6" : e[0] === "cliente" ? "#3c6e71" : null };
    }), { vazio: "Cadastre empresas e prospecções na aba Empresas." })]));

    // agenda
    var ag = el("ul", { class: "agenda" });
    if (!(d.agenda || []).length) ag.appendChild(el("li", { class: "muted small", text: "Nenhum contato com empresa marcado para os próximos 7 dias." }));
    (d.agenda || []).forEach(function (a) {
      var atras = a.data < hojeISO();
      ag.appendChild(el("li", null, [
        el("span", { class: "ag-data" + (atras ? " atrasado" : ""), text: a.data === hojeISO() ? "Hoje" : fmtData(a.data) }),
        el("button", { type: "button", class: "btn-link", text: a.nome, onclick: function (e) { abrirEmpresa(a.id, e.currentTarget); } }),
        el("span", { class: "muted small", text: (EMP_ETAPA[a.etapa] || "") + (a.passo ? " · " + a.passo : "") })
      ]));
    });
    g.appendChild(cartao("Agenda comercial (7 dias)", [ag]));

    g.appendChild(cartao("Candidaturas por etapa", [barras(opts(ETAPAS_CAND).map(function (e) { return { label: e[1], n: cand[e[0]] ? cand[e[0]].n : 0 }; }), { vazio: "Ainda não há candidaturas." })]));
    g.appendChild(cartao("Talentos por área", [barras((d.por_area || []).map(function (a) { return { label: a.k, n: a.n }; }))]));
    var pp = mapa(d.por_perfil);
    g.appendChild(cartao("Perfil comportamental", [barras(["aguia", "gato", "lobo", "tubarao", "sem"].map(function (p) { return { label: p === "sem" ? "Não respondeu" : PERFIS[p], n: pp[p] ? pp[p].n : 0, cor: CORES_PERFIL[p] }; }))]));
    var pm = mapa(d.por_modalidade);
    g.appendChild(cartao("Modalidade desejada", [barras(["presencial", "hibrido", "remoto", "todas"].map(function (m) { return { label: MODAL[m], n: pm[m] ? pm[m].n : 0 }; }))]));
    g.appendChild(cartao("Estados", [barras((d.por_uf || []).map(function (a) { return { label: a.k, n: a.n }; }))]));
    g.appendChild(cartao("Serviços em pauta com empresas", [barras((d.servicos || []).map(function (s) { return { label: SERVICO[s.k] || s.k, n: s.n }; }), { vazio: "Marque os serviços de cada empresa na aba Empresas." })]));
  }

  /* ------------------------------------------------------------ acompanhamento a cada 30 dias */
  var MODELO_PADRAO = "Olá, {nome}! Tudo bem? Aqui é {eu}, da Permanência RH. Estou passando para saber como você está e como anda sua busca profissional.\n\nVocê quer continuar com seu perfil no nosso Banco de Talentos? Se algo mudou (cargo, cidade, telefone), me conta que eu atualizo. Se preferir sair, é só responder que eu excluo seus dados.";
  function lerModelo() { try { return localStorage.getItem("prh_modelo_acomp") || MODELO_PADRAO; } catch (e) { return MODELO_PADRAO; } }
  function textoMensagem(nome) { return ($("ac-modelo").value || MODELO_PADRAO).replace(/\{nome\}/g, primeiroNome(nome)).replace(/\{eu\}/g, primeiroNome(me && me.nome)); }

  function listarAcomp() {
    var tbody = $("acomp-tbody"); tbody.innerHTML = "";
    tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "muted", text: "Carregando…" })]));
    var limite = hojeISO(Number($("ac-janela").value || 0));
    sb.from("candidatos").select("id,codigo,nome,nome_social,email,telefone,cargo_desejado,ultimo_checkin,proximo_checkin", { count: "exact" })
      .is("excluido_em", null).lte("proximo_checkin", limite).order("proximo_checkin", { ascending: true }).limit(200)
      .then(function (r) {
        tbody.innerHTML = "";
        if (r.error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "error-msg", text: erroAmigavel(r.error) })])); return; }
        $("acomp-count").textContent = (r.count || 0) + (r.count === 1 ? " pessoa para contato" : " pessoas para contato");
        if (!r.data.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "muted", text: "Tudo em dia. Ninguém para contatar neste período." })]));
        r.data.forEach(function (c) { tbody.appendChild(linhaAcomp(c)); });
      });
  }
  function linhaAcomp(c) {
    var atras = c.proximo_checkin < hojeISO();
    var envio = el("div", { class: "btn-row tight" });
    var wa = foneWa(c.telefone);
    if (wa) envio.appendChild(el("a", { class: "btn btn-whats btn-sm", target: "_blank", rel: "noopener noreferrer", text: "WhatsApp",
      onclick: function (e) { e.currentTarget.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(textoMensagem(nomeExib(c))); }, href: "https://wa.me/" + wa }));
    envio.appendChild(el("a", { class: "btn btn-secondary btn-sm", text: "E-mail",
      onclick: function (e) { e.currentTarget.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("Permanência RH: seu perfil no Banco de Talentos") + "&body=" + encodeURIComponent(textoMensagem(nomeExib(c))); }, href: "mailto:" + c.email }));
    var resp = el("div", { class: "btn-row tight" });
    var tr;
    function registrar(manter, nota, depois) {
      [].forEach.call(resp.querySelectorAll("button"), function (b) { b.disabled = true; });
      sb.rpc("registrar_checkin", { p_candidato: c.id, p_manter: manter, p_nota: nota || null }).then(function (r) {
        if (r.error) { [].forEach.call(resp.querySelectorAll("button"), function (b) { b.disabled = false; }); msg(erroAmigavel(r.error), "err"); return; }
        tr.classList.add("feito");
        resp.innerHTML = ""; resp.appendChild(el("span", { class: "pill pill-ok", text: "Registrado · próximo em " + fmtData(r.data) }));
        if (depois) depois();
      });
    }
    if (can("editar")) {
      resp.appendChild(el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Quer continuar", onclick: function () { registrar(true); } }));
      resp.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Sem resposta", onclick: function () { registrar(false, "sem resposta"); } }));
      if (can("admin")) {
        var sair = el("button", { type: "button", class: "btn btn-danger-ghost btn-sm", text: "Pediu para sair" });
        confirmarDuasVezes(sair, "Confirmar pedido", function () {
          sb.from("solicitacoes_titular").insert({ email_contato: c.email, tipo: "exclusao", candidato_id: c.id, detalhes: "Pedido feito no acompanhamento mensal." }).then(function (ins) {
            if (ins.error) { msg(erroAmigavel(ins.error), "err"); return; }
            registrar(false, "pediu exclusão dos dados", function () { msg("Pedido de exclusão registrado em Pedidos LGPD. Conclua a exclusão no cadastro da pessoa.", "ok"); });
          });
        });
        resp.appendChild(sair);
      }
    }
    var nomeBtn = el("button", { type: "button", class: "btn-link", text: nomeExib(c), onclick: function () { abrir(c.id, nomeBtn); } });
    tr = el("tr", null, [
      el("td", null, [nomeBtn, el("div", { class: "mono small muted", text: c.codigo })]),
      el("td", { text: c.cargo_desejado }),
      el("td", { text: c.ultimo_checkin ? fmtData(c.ultimo_checkin) : "Primeiro contato" }),
      el("td", null, [el("span", { class: atras ? "pill pill-no" : "pill", text: fmtData(c.proximo_checkin) + (atras ? " · atrasado" : "") })]),
      el("td", null, [envio]), el("td", null, [resp])
    ]);
    return tr;
  }

  /* ------------------------------------------------------------ ficha interna (só administrador) */
  function secaoFicha(c, ficha) {
    var f = buildForm([
      { k: "plano", label: "Plano com a Permanência", type: "select", options: PLANOS, placeholder: "Não definido" },
      { k: "plano_inicio", label: "Início do plano", type: "date" },
      { k: "plano_fim", label: "Fim do plano", type: "date" },
      { k: "plano_detalhes", label: "Detalhes do plano", max: 1000, full: true },
      { k: "o_que_busca", label: "O que a pessoa busca", type: "textarea", max: 2000, full: true },
      { k: "sobre_a_pessoa", label: "Como a pessoa fala de si / anotações da entrevista", type: "textarea", max: 4000, rows: 5, full: true },
      { k: "pontos_fortes", label: "Pontos fortes", type: "textarea", max: 2000 },
      { k: "pontos_atencao", label: "Pontos de atenção", type: "textarea", max: 2000 },
      { k: "parecer", label: "Parecer e próximos passos", type: "textarea", max: 3000, full: true }
    ], ficha || {}, "fi");
    var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Salvar ficha" });
    var info = el("span", { class: "small muted", role: "status", text: ficha && ficha.atualizado_em ? " Última atualização: " + fmtDataHora(ficha.atualizado_em) : "" });
    var form = el("form", { class: "admin-form", novalidate: true }, [f.node, el("div", { class: "btn-row" }, [btn, info])]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); btn.disabled = true;
      var v = f.values(); v.candidato_id = c.id;
      if (v.plano_inicio && v.plano_fim && v.plano_fim < v.plano_inicio) { btn.disabled = false; msg("A data de fim do plano é anterior ao início.", "err"); return; }
      sb.from("ficha_interna").upsert(v, { onConflict: "candidato_id" }).select("atualizado_em").single().then(function (r) {
        btn.disabled = false;
        if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
        info.textContent = " Salvo em " + fmtDataHora(r.data && r.data.atualizado_em || new Date().toISOString());
        msg("Ficha interna salva.", "ok");
      });
    });
    var resumo = ficha && ficha.plano && ficha.plano !== "nenhum" ? el("p", null, [el("span", { class: "pill pill-plano", text: "Plano: " + (PLANOS.filter(function (p) { return p[0] === ficha.plano; })[0] || [0, ficha.plano])[1] })]) : null;
    var det = el("details", { class: "ficha", open: ficha ? true : null }, [el("summary", { text: ficha ? "Abrir / editar ficha" : "Preencher ficha" }), form]);
    return el("section", { class: "d-sec d-ficha" }, [
      el("h3", { text: "Ficha interna" }),
      el("p", { class: "hint", text: "Visível só para administradores. Nunca é compartilhada com empresas. A pessoa pode pedir acesso aos próprios dados (LGPD art. 18), então registre fatos e percepções profissionais com respeito." }),
      resumo, det
    ]);
  }

  /* ------------------------------------------------------------ vagas */
  function listarVagas() {
    var tbody = $("vagas-tbody"); tbody.innerHTML = "";
    tbody.appendChild(el("tr", null, [el("td", { colspan: "7", class: "muted", text: "Carregando…" })]));
    var q = sb.from("vagas").select("id,codigo,titulo,empresa_cliente,cidade,uf,modalidade,status,afirmativa,publicada_em,criado_em,empresas(nome),candidaturas(count)").order("criado_em", { ascending: false }).limit(300);
    if ($("vg-status").value) q = q.eq("status", $("vg-status").value);
    q.then(function (r) {
      tbody.innerHTML = "";
      if (r.error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "7", class: "error-msg", text: erroAmigavel(r.error) })])); return; }
      if (!r.data.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "7", class: "muted", text: "Nenhuma vaga ainda. Clique em “Nova vaga” para criar a primeira." })]));
      r.data.forEach(function (v) {
        var n = v.candidaturas && v.candidaturas[0] ? v.candidaturas[0].count : 0;
        var b = el("button", { type: "button", class: "btn-link", text: v.titulo, onclick: function () { abrirVaga(v.id, null, b); } });
        tbody.appendChild(el("tr", null, [
          el("td", { class: "mono", text: v.codigo }), el("td", null, [b, v.afirmativa ? el("div", { class: "small muted", text: AFIRM[v.afirmativa] }) : null]),
          el("td", { text: (v.empresas && v.empresas.nome) || v.empresa_cliente || "—" }),
          el("td", { text: (v.cidade ? v.cidade + (v.uf ? "/" + v.uf : "") + " · " : "") + (MODAL[v.modalidade] || "") }),
          el("td", null, [el("span", { class: "pill pill-vaga-" + v.status, text: VAGA_STATUS[v.status] })]),
          el("td", { text: String(n) }), el("td", { text: fmtData(v.publicada_em) })
        ]));
      });
    });
  }

  function abrirVaga(id, empresaId, origin) {
    Promise.all([
      id ? sb.from("vagas").select("*").eq("id", id).single() : Promise.resolve({ data: null }),
      sb.from("empresas").select("id,nome").order("nome").limit(500),
      id ? sb.from("candidaturas").select("id,etapa,criado_em,candidato_id,candidatos(codigo,nome,nome_social,cargo_desejado,cidade,uf)").eq("vaga_id", id).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      var v = res[0].data, emps = res[1].data || [], cands = res[2].data || [];
      abrirPainel(v ? v.codigo : "Nova vaga", v ? v.titulo : "Cadastrar vaga", v ? VAGA_STATUS[v.status] + (v.publicada_em ? " · publicada em " + fmtData(v.publicada_em) : "") : "Preencha e salve. Ela só aparece no site com status “Aberta”.", function (body) {
        var f = buildForm([
          { k: "titulo", label: "Título da vaga", required: true, max: 120, full: true },
          { k: "empresa_id", label: "Empresa (cadastro interno)", type: "select", options: emps.map(function (e) { return [e.id, e.nome]; }), placeholder: "Nenhuma / não cadastrada", def: empresaId || null },
          { k: "empresa_cliente", label: "Empresa cliente (anotação interna)", max: 120, hint: "Nunca aparece no site." },
          { k: "empresa_exibicao", label: "Como a empresa aparece no site", required: true, max: 120, def: "Empresa confidencial" },
          { k: "area", label: "Área", type: "select", required: true, options: AREAS.map(function (a) { return [a, a]; }) },
          { k: "cidade", label: "Cidade", max: 80 },
          { k: "uf", label: "UF", type: "select", options: UFS.map(function (u) { return [u, u]; }) },
          { k: "modalidade", label: "Modalidade", type: "select", required: true, options: [["presencial", "Presencial"], ["hibrido", "Híbrido"], ["remoto", "Remoto"]] },
          { k: "tipo", label: "Tipo de contratação", type: "select", required: true, options: opts(TIPOS) },
          { k: "afirmativa", label: "Vaga afirmativa", type: "select", options: opts(AFIRM), placeholder: "Não", hint: "Confirme com a empresa e com a legislação aplicável (ex.: cota PcD, Lei 8.213/91)." },
          { k: "faixa_salarial", label: "Faixa salarial (opcional)", max: 80, hint: "Ex.: R$ 2.500 a R$ 3.000 ou “A combinar”." },
          { k: "encerra_em", label: "Inscrições até", type: "date" },
          { k: "status", label: "Status", type: "select", required: true, options: opts(VAGA_STATUS), def: "rascunho" },
          { k: "descricao", label: "Sobre a vaga", type: "textarea", required: true, max: 4000, rows: 5, full: true },
          { k: "requisitos", label: "Requisitos", type: "textarea", max: 3000, full: true },
          { k: "beneficios", label: "Benefícios", type: "textarea", max: 2000, full: true }
        ], v, "vg");
        var err = el("p", { class: "error-msg", role: "alert" });
        var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: v ? "Salvar alterações" : "Criar vaga" });
        var form = el("form", { class: "admin-form", novalidate: true }, [f.node, err, can("editar") ? btn : null]);
        form.addEventListener("submit", function (e) {
          e.preventDefault(); err.textContent = "";
          var falta = f.faltando(); if (falta.length) { err.textContent = "Preencha: " + falta.join(", ") + "."; return; }
          var val = f.values(); btn.disabled = true;
          var q = v ? sb.from("vagas").update(val).eq("id", v.id).select("id").single() : sb.from("vagas").insert(val).select("id").single();
          q.then(function (r) {
            btn.disabled = false;
            if (r.error) { err.textContent = erroAmigavel(r.error); return; }
            msg(v ? "Vaga atualizada." : "Vaga criada.", "ok"); listarVagas(); abrirVaga(r.data.id);
          });
        });

        if (v && v.status === "aberta") {
          var pub = new URL("vagas.html#" + v.codigo, location.href).href, cand = new URL("banco-de-talentos.html?vaga=" + v.id + "#cadastro", location.href).href;
          var s1 = el("span", { class: "small muted", role: "status" }), s2 = el("span", { class: "small muted", role: "status" });
          body.appendChild(section("Divulgar", [
            el("p", null, [el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar link da vaga", onclick: function () { copiar(pub, s1); } }), s1]),
            el("p", null, [el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar link direto de candidatura", onclick: function () { copiar(cand, s2); } }), s2]),
            el("p", { class: "hint", text: "Use nos posts do LinkedIn, Instagram e WhatsApp." })
          ]));
        } else if (v) body.appendChild(el("p", { class: "note small", text: "Esta vaga não aparece no site. Mude o status para “Aberta” para publicar." }));

        if (v) body.appendChild(secaoCandidaturas(v, cands));
        body.appendChild(section(v ? "Dados da vaga" : "Dados da vaga", [form]));

        if (v && can("admin")) {
          var del = el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Excluir vaga" });
          confirmarDuasVezes(del, "Clique de novo para excluir (apaga as candidaturas)", function () {
            sb.from("vagas").delete().eq("id", v.id).then(function (r) { if (r.error) { msg(erroAmigavel(r.error), "err"); return; } msg("Vaga excluída.", "ok"); fecharDrawer(); listarVagas(); });
          });
          body.appendChild(el("div", { class: "danger-zone" }, [el("p", { class: "small", text: "Prefira “Encerrada” para manter o histórico." }), del]));
        }
      }, origin);
    });
  }

  function secaoCandidaturas(v, cands) {
    var nodes = [];
    var resumo = {}; cands.forEach(function (k) { resumo[k.etapa] = (resumo[k.etapa] || 0) + 1; });
    nodes.push(el("p", { class: "small muted", text: cands.length ? Object.keys(ETAPAS_CAND).filter(function (e) { return resumo[e]; }).map(function (e) { return ETAPAS_CAND[e] + ": " + resumo[e]; }).join(" · ") : "Nenhuma candidatura ainda." }));
    if (cands.length) {
      var ul = el("ul", { class: "cand-list" });
      cands.forEach(function (k) {
        var p = k.candidatos || {};
        var sel = el("select", { "aria-label": "Etapa de " + (nomeExib(p) || "candidato") });
        opts(ETAPAS_CAND).forEach(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === k.etapa) op.selected = true; sel.appendChild(op); });
        if (!can("editar")) sel.disabled = true;
        sel.addEventListener("change", function () {
          sb.from("candidaturas").update({ etapa: sel.value }).eq("id", k.id).select("id").then(function (r) {
            if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Seu papel não permite alterar a etapa.", "err"); sel.value = k.etapa; return; }
            k.etapa = sel.value; msg("Etapa atualizada.", "ok");
          });
        });
        var nb = el("button", { type: "button", class: "btn-link", text: nomeExib(p) || "Candidato", onclick: function () { abrir(k.candidato_id, nb); } });
        ul.appendChild(el("li", null, [el("div", null, [nb, el("div", { class: "small muted", text: (p.codigo || "") + " · " + (p.cargo_desejado || "") + (p.cidade ? " · " + p.cidade + "/" + p.uf : "") + " · " + fmtData(k.criado_em) })]), sel]));
      });
      nodes.push(ul);
    }
    if (can("editar")) {
      var cod = el("input", { type: "text", id: "add-cand-cod", placeholder: "PRH-0000-XXXXXX", autocomplete: "off" });
      var err = el("p", { class: "error-msg", role: "alert" });
      var form = el("form", { class: "inline add-cand", novalidate: true }, [el("label", { for: "add-cand-cod", class: "small", text: "Incluir pessoa do banco pelo código" }), cod, el("button", { type: "submit", class: "btn btn-secondary btn-sm", text: "Incluir" })]);
      form.addEventListener("submit", function (e) {
        e.preventDefault(); err.textContent = "";
        var c = cod.value.trim().toUpperCase(); if (!c) return;
        sb.from("candidatos").select("id").eq("codigo", c).is("excluido_em", null).maybeSingle().then(function (r) {
          if (!r.data) { err.textContent = "Código não encontrado."; return; }
          sb.from("candidaturas").insert({ vaga_id: v.id, candidato_id: r.data.id, etapa: "triagem" }).then(function (ins) {
            if (ins.error) { err.textContent = /duplicate|23505/.test(ins.error.message + ins.error.code) ? "Esta pessoa já está nesta vaga." : erroAmigavel(ins.error); return; }
            msg("Pessoa incluída na vaga.", "ok"); abrirVaga(v.id);
          });
        });
      });
      nodes.push(form, err);
    }
    return section("Candidaturas (" + cands.length + ")", nodes);
  }

  /* ------------------------------------------------------------ empresas (CRM) */
  function listarEmpresas() {
    $("emp-funil").innerHTML = ""; $("emp-funil").appendChild(el("p", { class: "muted", text: "Carregando…" }));
    sb.from("empresas").select("id,nome,segmento,porte,cidade,uf,contato_nome,contato_email,contato_telefone,etapa,servicos,valor_estimado,proximo_passo,proximo_contato,atualizado_em").order("atualizado_em", { ascending: false }).limit(1000)
      .then(function (r) {
        if (r.error) { $("emp-funil").innerHTML = ""; $("emp-funil").appendChild(el("p", { class: "error-msg", text: erroAmigavel(r.error) })); return; }
        empresasCache = r.data || []; renderEmpresas();
      });
  }
  function filtradas() {
    var q = $("ef-busca").value.trim().toLowerCase(), sv = $("ef-servico").value, et = $("ef-etapa").value;
    return empresasCache.filter(function (e) {
      if (sv && (e.servicos || []).indexOf(sv) < 0) return false;
      if (et && e.etapa !== et) return false;
      if (q && [e.nome, e.contato_nome, e.segmento, e.cidade].join(" ").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderEmpresas() {
    var lista = filtradas(), funil = $("emp-funil"), tab = $("emp-lista"), tbody = $("emp-tbody");
    funil.hidden = empView !== "funil"; tab.hidden = empView !== "lista";
    funil.innerHTML = ""; tbody.innerHTML = "";
    if (!empresasCache.length) { funil.hidden = false; tab.hidden = true; funil.appendChild(el("div", { class: "vazio" }, [el("p", { text: "Nenhuma empresa cadastrada ainda." }), el("p", { class: "small muted", text: "Cadastre clientes e prospecções para acompanhar o funil, os serviços oferecidos e os próximos contatos." })])); return; }
    var hoje = hojeISO();
    if (empView === "funil") {
      EMP_ETAPAS.forEach(function (et) {
        var itens = lista.filter(function (e) { return e.etapa === et[0]; });
        var total = itens.reduce(function (a, e) { return a + Number(e.valor_estimado || 0); }, 0);
        var col = el("section", { class: "funil-col funil-" + et[0], "aria-label": et[1] }, [
          el("header", null, [el("h2", { text: et[1] }), el("span", { class: "small muted", text: itens.length + (total ? " · " + brl.format(total) : "") })])
        ]);
        itens.forEach(function (e) {
          var atras = e.proximo_contato && e.proximo_contato < hoje;
          var card = el("button", { type: "button", class: "emp-card", onclick: function () { abrirEmpresa(e.id, card); } }, [
            el("strong", { text: e.nome }),
            el("span", { class: "small muted", text: [e.segmento, e.cidade ? e.cidade + (e.uf ? "/" + e.uf : "") : ""].filter(Boolean).join(" · ") }),
            (e.servicos || []).length ? el("span", { class: "chips" }, (e.servicos || []).slice(0, 3).map(function (s) { return el("span", { class: "chip-mini", text: SERVICO[s] || s }); })) : null,
            el("span", { class: "emp-card-foot" }, [
              el("span", { text: e.valor_estimado ? brl.format(e.valor_estimado) : "" }),
              e.proximo_contato ? el("span", { class: atras ? "atrasado" : "", text: (atras ? "Atrasado: " : "Contato: ") + fmtData(e.proximo_contato) }) : null
            ])
          ]);
          col.appendChild(card);
        });
        if (!itens.length) col.appendChild(el("p", { class: "small muted", text: "—" }));
        funil.appendChild(col);
      });
    } else {
      if (!lista.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "6", class: "muted", text: "Nenhuma empresa com estes filtros." })]));
      lista.forEach(function (e) {
        var b = el("button", { type: "button", class: "btn-link", text: e.nome, onclick: function () { abrirEmpresa(e.id, b); } });
        var atras = e.proximo_contato && e.proximo_contato < hoje;
        tbody.appendChild(el("tr", null, [
          el("td", null, [b, el("div", { class: "small muted", text: [e.segmento, e.cidade].filter(Boolean).join(" · ") })]),
          el("td", null, [el("span", { class: "pill pill-emp-" + e.etapa, text: EMP_ETAPA[e.etapa] })]),
          el("td", { class: "small", text: (e.servicos || []).map(function (s) { return SERVICO[s] || s; }).join(", ") }),
          el("td", { class: "small", text: [e.contato_nome, e.contato_telefone].filter(Boolean).join(" · ") }),
          el("td", { text: e.valor_estimado ? brl.format(e.valor_estimado) : "—" }),
          el("td", null, [e.proximo_contato ? el("span", { class: atras ? "pill pill-no" : "", text: fmtData(e.proximo_contato) }) : document.createTextNode("—")])
        ]));
      });
    }
  }

  function abrirEmpresa(id, origin) {
    Promise.all([
      id ? sb.from("empresas").select("*").eq("id", id).single() : Promise.resolve({ data: null }),
      id ? sb.from("empresa_interacoes").select("tipo,descricao,criado_em").eq("empresa_id", id).order("criado_em", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
      id ? sb.from("vagas").select("id,codigo,titulo,status").eq("empresa_id", id).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      var e = res[0].data, inter = res[1].data || [], vagas = res[2].data || [];
      abrirPainel(e ? EMP_ETAPA[e.etapa] : "Nova empresa", e ? e.nome : "Cadastrar empresa", e ? [e.segmento, e.cidade ? e.cidade + (e.uf ? "/" + e.uf : "") : ""].filter(Boolean).join(" · ") : "Cliente ou prospecção", function (body) {
        if (e) {
          // contato rápido
          var links = el("div", { class: "btn-row tight" });
          var wa = foneWa(e.contato_telefone);
          if (wa) links.appendChild(el("a", { class: "btn btn-whats btn-sm", href: "https://wa.me/" + wa, target: "_blank", rel: "noopener noreferrer", text: "WhatsApp" }));
          if (e.contato_email) links.appendChild(el("a", { class: "btn btn-secondary btn-sm", href: "mailto:" + e.contato_email, text: "E-mail" }));
          if (can("editar")) links.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Agendar reunião", onclick: function (ev) { abrirCompromisso(null, { empresa_id: e.id, tipo: "reuniao" }, ev.currentTarget); } }));
          body.appendChild(section("Resumo", [dl([["Contato", [e.contato_nome, e.contato_cargo].filter(Boolean).join(" · ")], ["Próximo passo", e.proximo_passo], ["Próximo contato", e.proximo_contato ? fmtData(e.proximo_contato) : null],
            ["Valor estimado", e.valor_estimado ? brl.format(e.valor_estimado) : null], ["Serviços", (e.servicos || []).map(function (s) { return SERVICO[s] || s; }).join(", ")]]), links.children.length ? links : null]));
          if (can("admin")) body.appendChild(secaoFinEmpresa(e));
          body.appendChild(secaoEmpInter(e, inter));
          var vl = el("ul", { class: "plain" });
          if (!vagas.length) vl.appendChild(el("li", { class: "muted small", text: "Nenhuma vaga vinculada." }));
          vagas.forEach(function (v) { vl.appendChild(el("li", null, [el("button", { type: "button", class: "btn-link", text: v.codigo + " · " + v.titulo, onclick: function () { abrirVaga(v.id); } }), " ", el("span", { class: "pill pill-vaga-" + v.status, text: VAGA_STATUS[v.status] })])); });
          body.appendChild(section("Vagas", [vl, can("editar") ? el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Criar vaga para esta empresa", onclick: function () { abrirVaga(null, e.id); } }) : null]));
        }
        var f = buildForm([
          { k: "nome", label: "Nome da empresa", required: true, max: 160, full: true },
          { k: "etapa", label: "Etapa", type: "select", required: true, options: EMP_ETAPAS, def: "prospeccao" },
          { k: "origem", label: "Como chegou", type: "select", options: ORIGENS },
          { k: "segmento", label: "Segmento", max: 80 },
          { k: "porte", label: "Porte", type: "select", options: PORTES },
          { k: "cnpj", label: "CNPJ", max: 20, inputmode: "numeric" },
          { k: "cidade", label: "Cidade", max: 80 },
          { k: "uf", label: "UF", type: "select", options: UFS.map(function (u) { return [u, u]; }) },
          { k: "contato_nome", label: "Pessoa de contato", max: 120 },
          { k: "contato_cargo", label: "Cargo do contato", max: 80 },
          { k: "contato_email", label: "E-mail do contato", type: "email", max: 160 },
          { k: "contato_telefone", label: "Telefone / WhatsApp", type: "tel", max: 20 },
          { k: "servicos", label: "Serviços oferecidos ou contratados", type: "checks", options: SERVICOS, full: true },
          { k: "valor_estimado", label: "Valor estimado (R$)", type: "number", step: "0.01", min: 0, inputmode: "decimal" },
          { k: "proximo_contato", label: "Próximo contato", type: "date" },
          { k: "proximo_passo", label: "Próximo passo", max: 300, full: true, hint: "Ex.: enviar proposta de R&S, ligar para agendar reunião." },
          { k: "observacoes", label: "Observações", type: "textarea", max: 3000, full: true }
        ], e, "em");
        var err = el("p", { class: "error-msg", role: "alert" });
        var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: e ? "Salvar alterações" : "Cadastrar empresa" });
        var form = el("form", { class: "admin-form", novalidate: true }, [f.node, err, can("editar") ? btn : null]);
        form.addEventListener("submit", function (ev) {
          ev.preventDefault(); err.textContent = "";
          var falta = f.faltando(); if (falta.length) { err.textContent = "Preencha: " + falta.join(", ") + "."; return; }
          var val = f.values();
          if (val.contato_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.contato_email)) { err.textContent = "E-mail do contato inválido."; return; }
          btn.disabled = true;
          var q = e ? sb.from("empresas").update(val).eq("id", e.id).select("id").single() : sb.from("empresas").insert(val).select("id").single();
          q.then(function (r) {
            btn.disabled = false;
            if (r.error) { err.textContent = erroAmigavel(r.error); return; }
            msg(e ? "Empresa atualizada." : "Empresa cadastrada.", "ok"); listarEmpresas(); abrirEmpresa(r.data.id);
          });
        });
        body.appendChild(section(e ? "Dados da empresa" : "Dados da empresa", [form]));
        if (e && can("admin")) {
          var del = el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Excluir empresa" });
          confirmarDuasVezes(del, "Clique de novo para excluir", function () {
            sb.from("empresas").delete().eq("id", e.id).then(function (r) { if (r.error) { msg(erroAmigavel(r.error), "err"); return; } msg("Empresa excluída.", "ok"); fecharDrawer(); listarEmpresas(); });
          });
          body.appendChild(el("div", { class: "danger-zone" }, [el("p", { class: "small", text: "Prefira mudar a etapa para “Inativo” ou “Perdida” para manter o histórico." }), del]));
        }
      }, origin);
    });
  }

  function secaoEmpInter(e, inter) {
    var lista = el("ol", { class: "timeline" });
    if (!inter.length) lista.appendChild(el("li", { class: "muted small", text: "Nenhum contato registrado." }));
    inter.forEach(function (i) { lista.appendChild(el("li", null, [el("strong", { text: EMP_INT[i.tipo] || i.tipo }), el("span", { class: "muted small", text: " · " + fmtDataHora(i.criado_em) }), el("p", { text: i.descricao })])); });
    var nodes = [lista];
    if (can("editar")) {
      var tipo = el("select", { id: "ei-tipo" }); fillSelect2(tipo, opts(EMP_INT));
      var desc = el("textarea", { id: "ei-desc", maxlength: "2000", rows: "3" });
      var prox = el("input", { type: "date", id: "ei-prox" });
      var err = el("p", { class: "error-msg", role: "alert" });
      var form = el("form", { class: "admin-form", novalidate: true }, [
        el("div", { class: "fields" }, [
          el("div", { class: "field" }, [el("label", { for: "ei-tipo", text: "Tipo" }), tipo]),
          el("div", { class: "field" }, [el("label", { for: "ei-prox", text: "Agendar próximo contato" }), prox]),
          el("div", { class: "field full" }, [el("label", { for: "ei-desc", text: "O que foi conversado" }), desc])
        ]), err, el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Registrar contato" })
      ]);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (!desc.value.trim()) { err.textContent = "Descreva o contato."; return; }
        sb.from("empresa_interacoes").insert({ empresa_id: e.id, tipo: tipo.value, descricao: desc.value.trim(), autor_id: me.id }).then(function (r) {
          if (r.error) { err.textContent = erroAmigavel(r.error); return; }
          var depois = prox.value ? sb.from("empresas").update({ proximo_contato: prox.value }).eq("id", e.id) : Promise.resolve({});
          depois.then(function () { msg("Contato registrado.", "ok"); listarEmpresas(); abrirEmpresa(e.id); });
        });
      });
      nodes.push(el("details", null, [el("summary", { class: "btn btn-secondary btn-sm", text: "Registrar contato" }), form]));
    }
    return section("Histórico de contatos", nodes);
  }

  /* ============================================================ AVALIAÇÃO POR LINK E LAUDO */
  var AVAL_COLS = "id,token,testes,status,expira_em,aberto_em,respondido_em,criado_em,candidatura_id,eneagrama_pontos,eneagrama_tipo,perfil_aguia,perfil_gato,perfil_lobo,perfil_tubarao,perfil_predominante,bigfive_o,bigfive_c,bigfive_e,bigfive_a,bigfive_n,disc_d,disc_i,disc_s,disc_c";
  var TX = window.PRH_AVAL_TEXTOS || { perfil: {}, cerebral: {}, eneagrama: {}, temas: {}, instrumentos: [] };
  var TESTES = { perfil: "Preferência cerebral e perfil comportamental", eneagrama: "Eneagrama", disc: "DISC exploratório", bigfive: "Big Five exploratório" };
  var TESTES_MIN = { perfil: 5, eneagrama: 8, disc: 3, bigfive: 5 };
  var CONCLUSOES = [["em_andamento", "Avaliação em andamento"], ["indicado", "Indicado(a) para a vaga"], ["indicado_ressalvas", "Indicado(a) com ressalvas"], ["nao_indicado", "Não indicado(a) neste momento"]];
  var LETRAS = ["I", "C", "O", "A"], CHAVE_LETRA = { aguia: "I", gato: "C", lobo: "O", tubarao: "A" };

  /* ---------- DISC e Big Five exploratórios (médias de 1 a 5) e entrevista STAR
     Os textos ficam em avaliacao-textos.js. As leituras seguem o guia de interpretação da Permanência:
     descrevem tendências autorrelatadas e hipóteses a confirmar, nunca traços fixos ou aptidão. */
  var DISC_L = ["D", "I", "S", "C"], B5_L = ["O", "C", "E", "A", "N"];
  // Convenção interna (não é regra científica): dimensões a até 0,4 de média (2 pontos de soma) do topo são lidas em conjunto.
  var DISC_PROXIMO = 0.4;
  // Diferença máxima entre a maior e a menor média do Big Five para dizer que "nenhuma dimensão se destaca" (convenção interna).
  var B5_PROXIMO = 0.5;
  function fmtM(x, casas) { return x.toFixed(casas).replace(".", ","); }
  function minusc(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function faixaDisc(m) { return m >= 4 ? "relatados como frequentes" : m >= 3 ? "relatados com frequência variável" : "relatados como menos frequentes"; }
  function starTemConteudo(rec) {
    return !!(rec && ((rec.competencias || []).some(function (x) { return x.nota; }) || rec.pontos_fortes || rec.pontos_aprofundar || rec.sintese_requisitos));
  }
  function leituraDisc(Dd) {
    var topo = Dd.media[Dd.ordem[0]];
    var vals = DISC_L.map(function (k) { return Dd.media[k]; });
    var L = {
      conj: Dd.ordem.filter(function (k) { return topo - Dd.media[k] <= DISC_PROXIMO + 1e-9; }),
      todasAltas: vals.every(function (m) { return m >= 4; }),
      todasInter: vals.every(function (m) { return m >= 3 && m < 4; }),
      baixas: DISC_L.filter(function (k) { return Dd.media[k] < 3; })
    };
    L.destaque = !L.todasAltas && !L.todasInter ? L.conj : [];
    return L;
  }
  // Texto do DISC: { paragrafos, perguntas, fortes, desenvolver }. comResumo = repete as médias no início (usado na síntese).
  function textosDisc(Dd, comResumo) {
    var T = TX.disc || {}, C = TX.discCombinacoes || {}, L = leituraDisc(Dd), out = [], perguntas = [], fortes = [], desenv = [];
    function nm(k) { return T[k].nome + " (" + T[k].foco + ")"; }
    var p = comResumo ? "DISC exploratório (médias de 1 a 5): " + DISC_L.map(function (k) { return T[k].nome + " " + fmtM(Dd.media[k], 1); }).join(" · ") + ". " : "";
    if (L.todasAltas) {
      p += "Todas as dimensões ficaram entre 4,0 e 5,0. Isso não indica, por si só, um perfil completo: pode haver autopercepção positiva generalizada, e cada dimensão precisa ser validada com episódios concretos e feedback de trabalho.";
    } else if (L.todasInter) {
      p += "Todas as dimensões ficaram entre 3,0 e 3,9, o que sugere comportamentos de frequência variável e dependentes do contexto, sem uma tendência predominante a destacar.";
    } else if (L.conj.length === 1) {
      var d = T[L.conj[0]];
      p += "A tendência mais relatada foi " + nm(L.conj[0]) + ", com média " + fmtM(Dd.media[L.conj[0]], 1) + ". Leia-a como a tendência mais relatada no questionário, e não como identidade fixa. " + d.leitura;
    } else if (L.conj.length === 2) {
      var chave = DISC_L.filter(function (k) { return L.conj.indexOf(k) >= 0; }).join(""), cb = C[chave];
      p += "As dimensões " + nm(L.conj[0]) + " e " + nm(L.conj[1]) + " ficaram próximas no topo (diferença de até 0,4 na média), então a leitura é de um conjunto de tendências." +
        (cb ? " " + cb.titulo + ": " + cb.hipotese + " Tensão possível a verificar: " + cb.tensao : "");
      if (cb) perguntas.push(cb.explorar);
    } else {
      p += "Três ou mais dimensões ficaram próximas do topo (" + L.conj.map(function (k) { return T[k].nome; }).join(", ") + "). Descreva um conjunto de tendências, sem eleger uma predominância.";
    }
    out.push(p);
    if (L.destaque.length) {
      out.push("Sob pressão, vale verificar se a pessoa tende a " + L.destaque.slice(0, 2).map(function (k) { return T[k].pressao; }).join("; ou a ") + ". Esta é uma hipótese a confirmar com exemplos recentes, e não uma previsão de reação individual.");
    }
    if (L.baixas.length && !L.todasInter) {
      out.push("Média abaixo de 3,0 em " + L.baixas.map(function (k) { return T[k].nome + " (" + fmtM(Dd.media[k], 1) + ")"; }).join(", ") + ": comportamentos relatados como menos frequentes. " + T[L.baixas[0]].menor + " Compare com exemplos de desempenho, experiência e condições de trabalho antes de qualquer conclusão.");
    }
    L.destaque.slice(0, 2).forEach(function (k, i) {
      var t = T[k];
      (i === 0 ? t.perguntas : t.perguntas.slice(0, 1)).forEach(function (q) { perguntas.push(q); });
      fortes = fortes.concat(t.uteis.slice(0, 2));
      desenv = desenv.concat(t.verificar.slice(0, 2).map(function (x) { return "A verificar: " + minusc(x); }));
    });
    return { paragrafos: out, perguntas: perguntas.slice(0, 5), fortes: fortes, desenvolver: desenv };
  }
  function textosB5(Bb, comResumo) {
    var T = TX.bigfive || {}, out = [], perguntas = [];
    var hi = Bb.ordem[0], lo = Bb.ordem[Bb.ordem.length - 1];
    var p = comResumo ? "Big Five exploratório (médias de 1 a 5, sem classificação em baixo, médio ou alto): " + B5_L.map(function (k) { return T[k].nome + " " + fmtM(Bb.media[k], 2); }).join(" · ") + ". " : "";
    if (Bb.media[hi] - Bb.media[lo] <= B5_PROXIMO + 1e-9) {
      p += "As médias ficaram próximas entre si, sem uma dimensão que se destaque.";
    } else {
      p += "A maior média foi em " + T[hi].nome + " (" + fmtM(Bb.media[hi], 2) + "), que reúne afirmações sobre " + T[hi].cobre + ", e a menor em " + T[lo].nome + " (" + fmtM(Bb.media[lo], 2) + "), sobre " + T[lo].cobre + ".";
      perguntas.push(T[hi].explorar, T[lo].explorar);
    }
    p += " São respostas autorrelatadas: confirme com exemplos concretos antes de qualquer conclusão.";
    out.push(p);
    return { paragrafos: out, perguntas: perguntas };
  }
  function textosStar(rec) {
    var T = (TX.star || {}), grupos = { "4": [], "3": [], "2": [], "1": [], "NE": [] };
    (rec.competencias || []).forEach(function (x) {
      var comp = (T.competencias || []).filter(function (k) { return k.id === x.id; })[0];
      if (x.nota && grupos[x.nota] && comp) grupos[x.nota].push(comp.nome);
    });
    var partes = ["4", "3", "2", "1", "NE"].filter(function (n) { return grupos[n].length; }).map(function (n) {
      return T.notas[n][0] + " (" + n + "): " + grupos[n].join(", ");
    });
    return partes.length ? "Entrevista por competências (STAR, notas de 1 a 4): " + partes.join("; ") + ". “Não evidenciado” indica falta de evidência na entrevista e não equivale à nota 1." : "";
  }

  function linkAvaliacao(a) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "avaliacao.html#t=" + a.token; }
  function vencida(a) { return a.status === "pendente" && new Date(a.expira_em) < new Date(); }
  function nomeProcesso(cands, candidaturaId) {
    if (!candidaturaId) return null;
    var k = (cands || []).filter(function (x) { return x.id === candidaturaId; })[0];
    return k && k.vagas ? (k.vagas.codigo + " · " + k.vagas.titulo) : "Vaga";
  }
  function mensagemConvite(c, a, cands) {
    var k = (cands || []).filter(function (x) { return x.id === a.candidatura_id; })[0];
    var vaga = k && k.vagas ? " para a vaga " + k.vagas.titulo : "";
    var min = a.testes.reduce(function (s, t) { return s + (TESTES_MIN[t] || 5); }, 0);
    if (c._orient) return "Olá, " + primeiroNome(nomeExib(c)) + "! Aqui é " + primeiroNome(me && me.nome) + ", da Permanência RH.\n\n" +
      "Para a nossa orientação de carreira, peço que você responda estes questionários neste link:\n" + linkAvaliacao(a) + "\n\n" +
      "Leva cerca de " + min + " minutos. Responda com calma, em um momento tranquilo, pelo celular ou pelo computador. Não existe resposta certa ou errada. O link é pessoal e vale até " + fmtData(a.expira_em) + ".\n\n" +
      "Depois conversamos sobre o resultado. Qualquer dúvida, é só me chamar por aqui.";
    return "Olá, " + primeiroNome(nomeExib(c)) + "! Aqui é " + primeiroNome(me && me.nome) + ", da Permanência RH.\n\n" +
      "Como próxima etapa do processo seletivo" + vaga + ", peço que você responda a avaliação comportamental neste link:\n" + linkAvaliacao(a) + "\n\n" +
      "Leva cerca de " + min + " minutos. Responda com calma, em um momento tranquilo, pelo celular ou pelo computador. O link é pessoal e vale até " + fmtData(a.expira_em) + ".\n\n" +
      "Qualquer dúvida, é só me chamar por aqui.";
  }

  /* ---------- resultados: escolhe a avaliação mais recente (de preferência do mesmo processo) */
  function resultados(c, aval, candidaturaId, stars) {
    var feitas = (aval || []).filter(function (a) { return a.status === "concluida"; });
    function escolher(teste) {
      var com = feitas.filter(function (a) { return a.testes.indexOf(teste) >= 0; });
      var mesmo = com.filter(function (a) { return (a.candidatura_id || null) === (candidaturaId || null); });
      return (mesmo.length ? mesmo : com)[0] || null; // já vem em ordem decrescente de data
    }
    var r = { perfil: null, enea: null, disc: null, b5: null, star: null };
    var p = escolher("perfil");
    if (p) r.perfil = { I: p.perfil_aguia, C: p.perfil_gato, O: p.perfil_lobo, A: p.perfil_tubarao, data: p.respondido_em, origem: "link" };
    else if (c.perfil_predominante) r.perfil = { I: c.perfil_aguia, C: c.perfil_gato, O: c.perfil_lobo, A: c.perfil_tubarao, data: c.perfil_respondido_em, origem: "site" };
    var e = escolher("eneagrama");
    if (e && e.eneagrama_pontos) r.enea = { pontos: e.eneagrama_pontos.map(Number), data: e.respondido_em };
    var dd = escolher("disc");
    if (dd && dd.disc_d != null) r.disc = { soma: { D: Number(dd.disc_d), I: Number(dd.disc_i), S: Number(dd.disc_s), C: Number(dd.disc_c) }, data: dd.respondido_em };
    var bb = escolher("bigfive");
    if (bb && bb.bigfive_o != null) r.b5 = { soma: { O: Number(bb.bigfive_o), C: Number(bb.bigfive_c), E: Number(bb.bigfive_e), A: Number(bb.bigfive_a), N: Number(bb.bigfive_n) }, data: bb.respondido_em };
    if (r.disc) {
      var Dd = r.disc; Dd.media = {};
      DISC_L.forEach(function (k) { Dd.media[k] = Dd.soma[k] / 5; });
      Dd.ordem = DISC_L.slice().sort(function (a, b) { return Dd.media[b] - Dd.media[a] || DISC_L.indexOf(a) - DISC_L.indexOf(b); });
    }
    if (r.b5) {
      var Bb = r.b5; Bb.media = {};
      B5_L.forEach(function (k) { Bb.media[k] = Bb.soma[k] / 6; });
      Bb.ordem = B5_L.slice().sort(function (a, b) { return Bb.media[b] - Bb.media[a] || B5_L.indexOf(a) - B5_L.indexOf(b); });
    }
    if (stars) {
      var rec = stars.filter(function (x) { return (x.candidatura_id || null) === (candidaturaId || null); })[0];
      if (rec && starTemConteudo(rec)) r.star = rec;
    }
    if (r.perfil) {
      var P = r.perfil;
      LETRAS.forEach(function (k) { P[k] = Number(P[k]) || 0; });
      P.ordem = LETRAS.slice().sort(function (a, b) { return P[b] - P[a] || LETRAS.indexOf(a) - LETRAS.indexOf(b); });
      P.esq = P.O + P.A; P.dir = P.I + P.C; P.ant = P.I + P.O; P.pos = P.C + P.A;
    }
    if (r.enea) {
      var E = r.enea;
      E.ordem = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function (a, b) { return E.pontos[b - 1] - E.pontos[a - 1] || a - b; });
      E.max = Math.max.apply(null, E.pontos) || 1;
    }
    return r;
  }

  function barrasNodes(itens) {
    var max = Math.max.apply(null, itens.map(function (i) { return i.n; })) || 1;
    return el("ul", { class: "res-bars lv-bars" }, itens.map(function (i) {
      return el("li", { class: i.top ? "is-top" : "" }, [
        el("span", { class: "res-bar-label", text: i.label }),
        el("span", { class: "res-bar-track", "aria-hidden": "true" }, [el("span", { style: "width:" + Math.round(i.n / (i.escala || max) * 100) + "%" })]),
        el("span", { class: "res-bar-val", text: i.val })
      ]);
    }));
  }
  function eixo(esqLabel, dirLabel, esq, dir) {
    var pos = Math.round(dir / ((esq + dir) || 1) * 100);
    return el("div", { class: "axis" }, [
      el("div", { class: "axis-labels" }, [el("span", { text: esqLabel + " " + esq + "%" }), el("span", { text: dirLabel + " " + dir + "%" })]),
      el("div", { class: "axis-track", "aria-hidden": "true" }, [el("span", { class: "axis-dot", style: "left:" + pos + "%" })])
    ]);
  }
  function blocoPerfil(P) {
    return barrasNodes(P.ordem.map(function (k, i) { var t = TX.perfil[k] || {}; return { label: t.nome + " · " + t.papel, n: P[k], escala: 100, val: P[k] + "%", top: i === 0 }; }));
  }
  function blocoCerebral(P) {
    return el("div", { class: "axes" }, [eixo("Esquerdo (razão)", "Direito (emoção)", P.esq, P.dir), eixo("Anterior (planejar)", "Posterior (agir)", P.ant, P.pos)]);
  }
  function blocoDisc(Dd) {
    var L = leituraDisc(Dd);
    return barrasNodes(Dd.ordem.map(function (k) { return { label: k + " · " + TX.disc[k].nome, n: Dd.media[k], escala: 5, val: fmtM(Dd.media[k], 1), top: L.destaque.indexOf(k) >= 0 }; }));
  }
  function blocoB5(Bb) {
    return barrasNodes(B5_L.map(function (k) { return { label: k + " · " + TX.bigfive[k].nome, n: Bb.media[k], escala: 5, val: fmtM(Bb.media[k], 2) }; }));
  }
  function tabelaSimples(cabecalho, linhas) {
    return el("table", { class: "lv-table" }, [
      el("thead", null, [el("tr", null, cabecalho.map(function (t) { return el("th", { text: t }); }))]),
      el("tbody", null, linhas.map(function (l) { return el("tr", null, l.map(function (t) { return el("td", { text: t }); })); }))
    ]);
  }
  function listaSimples(arr) { return el("ul", null, arr.map(function (x) { return el("li", { text: x }); })); }
  // Blocos completos, usados no painel ("Ver resultado") e no laudo
  function nodesDisc(Dd) {
    var T = TX.disc, tx = textosDisc(Dd, false), nodes = [blocoDisc(Dd)];
    nodes.push(tabelaSimples(["Dimensão", "Média", "Leitura descritiva"], DISC_L.map(function (k) { return [k + " — " + T[k].nome + " (" + T[k].foco + ")", fmtM(Dd.media[k], 1), "Comportamentos " + faixaDisc(Dd.media[k])]; })));
    tx.paragrafos.forEach(function (t) { nodes.push(el("p", { class: "lv-texto", text: t })); });
    if (tx.perguntas.length) nodes.push(el("h4", { text: "A confirmar na entrevista ou na devolutiva" }), listaSimples(tx.perguntas));
    nodes.push(el("p", { class: "small muted", text: TX.discAviso }));
    return nodes;
  }
  function nodesB5(Bb) {
    var T = TX.bigfive, tx = textosB5(Bb, false), nodes = [blocoB5(Bb)];
    nodes.push(tabelaSimples(["Dimensão", "Média (1 a 5)", "O que as afirmações cobrem"], B5_L.map(function (k) { return [k + " — " + T[k].nome, fmtM(Bb.media[k], 2), T[k].cobre.charAt(0).toUpperCase() + T[k].cobre.slice(1)]; })));
    tx.paragrafos.forEach(function (t) { nodes.push(el("p", { class: "lv-texto", text: t })); });
    if (tx.perguntas.length) nodes.push(el("h4", { text: "A confirmar na entrevista ou na devolutiva" }), listaSimples(tx.perguntas));
    nodes.push(el("p", { class: "small muted", text: TX.bigfiveAviso }));
    return nodes;
  }
  function blocoEnea(E) {
    return barrasNodes(E.ordem.map(function (t, i) { return { label: "Tipo " + t + " · " + ((TX.eneagrama[t] || {}).nome || ""), n: E.pontos[t - 1], escala: E.max, val: String(E.pontos[t - 1]), top: i === 0 }; }));
  }

  /* ---------- análise automática (sugestão de texto para o laudo; sempre revisada por quem assina) */
  function analise(c, R, modo) {
    var orient = modo === "orient";
    var nome = primeiroNome(nomeExib(c)), partes = [], fortes = [], desenv = [], temas = [];
    if (R.perfil) {
      var P = R.perfil, t1 = TX.perfil[P.ordem[0]], t2 = TX.perfil[P.ordem[1]];
      var empate = P[P.ordem[0]] === P[P.ordem[1]], perto = P[P.ordem[0]] - P[P.ordem[1]] <= 8;
      partes.push("Perfil comportamental: " + (empate ? "há equilíbrio entre os perfis " + t1.nome + " (" + t1.papel.toLowerCase() + ") e " + t2.nome + " (" + t2.papel.toLowerCase() + "), com " + P[P.ordem[0]] + "% cada. "
        : "predomina o perfil " + t1.nome + " (" + t1.papel.toLowerCase() + ", " + P[P.ordem[0]] + "%), seguido de " + t2.nome + " (" + P[P.ordem[1]] + "%). ") +
        t1.comportamento + (perto && !empate ? " Os traços de " + t2.nome + " também aparecem com força: " + t2.comportamento.charAt(0).toLowerCase() + t2.comportamento.slice(1) : ""));
      var lado = P.esq === P.dir ? null : P.esq > P.dir ? "esquerdo" : "direito";
      var regiao = P.ant === P.pos ? null : P.ant > P.pos ? "anterior" : "posterior";
      var cb = TX.cerebral;
      partes.push("Preferência cerebral: " +
        (lado ? "predomina o lado " + lado + " (" + Math.max(P.esq, P.dir) + "%), associado a " + cb[lado].tracos.slice(0, 4).join(", ").toLowerCase() + ". " : "os lados esquerdo e direito estão equilibrados (" + P.esq + "% e " + P.dir + "%), o que sugere transitar bem entre razão e emoção. ") +
        (regiao ? "Na outra dimensão, a região " + regiao + " (" + Math.max(P.ant, P.pos) + "%) indica preferência por " + (regiao === "anterior" ? "planejar e idealizar antes de agir" : "agir e se relacionar, aprendendo na prática") + "."
          : "Planejamento e ação aparecem em equilíbrio."));
      fortes = fortes.concat(t1.fortes); desenv = desenv.concat(t1.atencao);
      if (perto) { fortes.push(t2.fortes[0]); }
      temas.push(t1.tema);
    }
    if (R.enea) {
      var E = R.enea, e1 = TX.eneagrama[E.ordem[0]], e2 = TX.eneagrama[E.ordem[1]], e3 = TX.eneagrama[E.ordem[2]];
      var emp = E.pontos[E.ordem[0] - 1] === E.pontos[E.ordem[1] - 1];
      partes.push("Eneagrama: " + (emp ? "os tipos " + E.ordem[0] + " (" + e1.nome + ") e " + E.ordem[1] + " (" + e2.nome + ") empatam na maior pontuação (" + E.pontos[E.ordem[0] - 1] + "). "
        : "o tipo com maior pontuação é o " + E.ordem[0] + " — " + e1.nome + " (" + E.pontos[E.ordem[0] - 1] + " itens), seguido dos tipos " + E.ordem[1] + " (" + e2.nome + ") e " + E.ordem[2] + " (" + e3.nome + "). ") +
        e1.essencia + " No trabalho: " + e1.trabalho.charAt(0).toLowerCase() + e1.trabalho.slice(1));
      fortes = fortes.concat(e1.fortes.slice(0, 2)); desenv = desenv.concat(e1.atencao.slice(0, 2));
      temas.push(e1.tema, e2.tema);
    }
    var perguntasConfirmar = [];
    if (R.disc) {
      var xd = textosDisc(R.disc, true);
      partes = partes.concat(xd.paragrafos);
      fortes = fortes.concat(xd.fortes); desenv = desenv.concat(xd.desenvolver);
      perguntasConfirmar = perguntasConfirmar.concat(xd.perguntas);
    }
    if (R.b5) {
      var xb = textosB5(R.b5, true);
      partes = partes.concat(xb.paragrafos);
      perguntasConfirmar = perguntasConfirmar.concat(xb.perguntas);
    }
    if (R.star) { var xs = textosStar(R.star); if (xs) partes.push(xs); }
    if (R.perfil && R.enea) {
      var tp = TX.perfil[R.perfil.ordem[0]].tema;
      if (temas.slice(1).indexOf(tp) >= 0) partes.push("Os instrumentos convergem: tanto o perfil comportamental quanto o Eneagrama apontam para " + TX.temas[tp] + ". Recomenda-se confirmar esse padrão com exemplos concretos na entrevista.");
      else partes.push("Os instrumentos mostram facetas complementares: o perfil comportamental destaca " + TX.temas[tp] + ", enquanto o Eneagrama destaca " + TX.temas[temas[1]] + ". Vale investigar na entrevista em quais situações cada lado aparece.");
    }
    if (perguntasConfirmar.length) partes.push((orient ? "Para conversar na devolutiva:\n" : "A confirmar na entrevista ou na devolutiva:\n") + perguntasConfirmar.slice(0, 5).map(function (q) { return "• " + q; }).join("\n"));
    var unico = function (arr) { var v = {}; return arr.filter(function (x) { var k = x.toLowerCase(); if (v[k]) return false; v[k] = 1; return true; }); };
    return {
      sintese: partes.length ? partes.join("\n\n") + "\n\n" + (orient ? "Os resultados descrevem preferências e tendências de " + nome + " neste momento. Eles não dizem quem a pessoa é nem quais carreiras servem para ela: são ponto de partida para a conversa, junto com a história profissional, os valores e o contexto de vida." : R.perfil || R.enea || R.disc || R.b5
        ? "Os resultados descrevem preferências e tendências de " + nome + " e foram considerados em conjunto com a entrevista e as demais etapas."
        : "As notas da entrevista por competências foram consideradas em conjunto com as demais etapas do processo.") : "",
      fortes: unico(fortes).map(function (x) { return "• " + x; }).join("\n"),
      desenvolver: unico(desenv).map(function (x) { return "• " + x; }).join("\n")
    };
  }

  /* ---------- seção: links de avaliação */
  // Atualiza a ficha aberta depois de uma alteração (candidato ou pessoa em orientação)
  function refrescar(c) { if (c._orient) abrirCliente(c.id); else abrir(c.id, lastFocus); }
  function secaoAvaliacoes(c, cands, aval) {
    var nodes = [el("p", { class: "hint", text: c._orient ? "Os testes (DISC, Big Five, Eneagrama e Preferência cerebral/perfil) só são respondidos pelo link que você envia. Cada link é pessoal, tem prazo e só aceita um envio. A pessoa não vê o resultado na hora: ele é conversado na devolutiva e, se você quiser, liberado numa página própria dentro do relatório. DISC e Big Five são instrumentos exploratórios, sem validação psicométrica: use como ponto de partida de conversa, nunca como veredito sobre a pessoa." : "Os testes (DISC, Big Five, Eneagrama e Preferência cerebral/perfil) só são respondidos pelo link que você envia. Cada link é pessoal, tem prazo e só aceita um envio. O candidato não vê o resultado: ele vai para o laudo. DISC e Big Five são instrumentos exploratórios, sem validação psicométrica: use como apoio à entrevista, nunca como critério isolado." })];
    if (aval === null) {
      nodes.push(el("p", { class: "error-msg", text: "Recurso ainda não ativado: rode o arquivo supabase/sql/006-avaliacoes-e-laudos.sql no SQL Editor do Supabase." }));
      return section("Avaliação comportamental", nodes);
    }
    var lista = el("ul", { class: "aval-list" });
    if (!aval.length) lista.appendChild(el("li", { class: "muted small", text: "Nenhum link enviado ainda." }));
    aval.forEach(function (a) {
      var proc = nomeProcesso(cands, a.candidatura_id);
      var estado = a.status === "concluida" ? ["pill-ok", "Respondida em " + fmtData(a.respondido_em)]
        : a.status === "cancelada" ? ["", "Cancelada"]
        : vencida(a) ? ["pill-no", "Expirou em " + fmtData(a.expira_em)]
        : ["pill-cadastro_recebido", (a.aberto_em ? "Aberta pelo candidato · " : "Aguardando · ") + "vale até " + fmtData(a.expira_em)];
      var li = el("li", null, [
        el("div", null, [el("strong", { text: a.testes.map(function (t) { return TESTES[t]; }).join(" + ") }), " ", el("span", { class: "pill " + estado[0], text: estado[1] })]),
        el("div", { class: "small muted", text: "Enviada em " + fmtData(a.criado_em) + (c._orient ? " · orientação de carreira" : proc ? " · " + proc : " · sem vaga (banco de talentos)") })
      ]);
      var acoes = el("div", { class: "inline aval-acoes" }), aviso = el("span", { class: "small muted", role: "status" });
      if (a.status === "pendente" && !vencida(a)) {
        acoes.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar mensagem com o link", onclick: function () { copiar(mensagemConvite(c, a, cands), aviso); } }));
        acoes.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar só o link", onclick: function () { copiar(linkAvaliacao(a), aviso); } }));
        var wa = foneWa(c.telefone);
        if (wa) acoes.appendChild(el("a", { class: "btn btn-primary btn-sm", target: "_blank", rel: "noopener noreferrer", href: "https://wa.me/" + wa, text: "Enviar pelo WhatsApp",
          onclick: function (ev) { ev.currentTarget.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(mensagemConvite(c, a, cands)); } }));
        acoes.appendChild(el("a", { class: "btn btn-secondary btn-sm", href: "mailto:" + (c.email || ""), text: "E-mail",
          onclick: function (ev) { ev.currentTarget.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("Permanência RH: avaliação comportamental") + "&body=" + encodeURIComponent(mensagemConvite(c, a, cands)); } }));
      }
      if (a.status === "pendente") {
        acoes.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: vencida(a) ? "Reabrir por 7 dias" : "Prorrogar 7 dias", onclick: function () {
          var d = new Date(Math.max(Date.now(), new Date(a.expira_em).getTime())); d.setDate(d.getDate() + 7);
          sb.from("avaliacoes").update({ expira_em: d.toISOString() }).eq("id", a.id).select("id").then(function (r) {
            if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Seu papel não permite esta ação.", "err"); return; }
            msg("Prazo do link atualizado para " + fmtData(d.toISOString()) + ".", "ok"); refrescar(c);
          });
        } }));
        var canc = el("button", { type: "button", class: "btn-link small", text: "Cancelar link" });
        confirmarDuasVezes(canc, "Clique de novo para cancelar", function () {
          sb.from("avaliacoes").update({ status: "cancelada" }).eq("id", a.id).then(function (r) {
            if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
            msg("Link cancelado. Ele deixa de funcionar na hora.", "ok"); refrescar(c);
          });
        });
        acoes.appendChild(canc);
      }
      if (a.status === "concluida") {
        var R = resultados(c, [a], a.candidatura_id), det = [];
        if (R.perfil && a.testes.indexOf("perfil") >= 0) det.push(el("h4", { text: "Perfil comportamental" }), blocoPerfil(R.perfil), el("h4", { text: "Preferência cerebral" }), blocoCerebral(R.perfil));
        if (R.enea) det.push(el("h4", { text: "Eneagrama (itens por tipo)" }), blocoEnea(R.enea));
        if (R.disc && a.testes.indexOf("disc") >= 0) det.push.apply(det, [el("h4", { text: "DISC exploratório (média de 1 a 5)" })].concat(nodesDisc(R.disc)));
        if (R.b5 && a.testes.indexOf("bigfive") >= 0) det.push.apply(det, [el("h4", { text: "Big Five exploratório (média de 1 a 5)" })].concat(nodesB5(R.b5)));
        acoes.appendChild(el("details", { class: "aval-res" }, [el("summary", { class: "btn btn-secondary btn-sm", text: "Ver resultado" }), el("div", { class: "aval-res-body" }, det)]));
      }
      acoes.appendChild(aviso);
      li.appendChild(acoes);
      lista.appendChild(li);
    });
    nodes.push(lista);

    // Novo link
    // Pacote padrão curto (DISC + Big Five, cerca de 8 minutos). Eneagrama e Preferência cerebral ficam sob demanda.
    var TESTES_FORM = [["disc", "DISC exploratório (20 perguntas)", true], ["bigfive", "Big Five exploratório (30 perguntas)", true],
      ["eneagrama", "Eneagrama (36 perguntas)", false], ["perfil", "Preferência cerebral e perfil comportamental (25 perguntas)", false]];
    var cbs = TESTES_FORM.map(function (t) { var cb = el("input", { type: "checkbox", id: "av-t-" + t[0], value: t[0] }); cb.checked = t[2]; return cb; });
    var proc = el("select", { id: "av-proc" }, [el("option", { value: "", text: "Sem vaga (banco de talentos)" })]);
    cands.forEach(function (k, i) { var o = el("option", { value: String(k.id), text: (k.vagas ? k.vagas.codigo + " · " + k.vagas.titulo : "Vaga") + " · " + (ETAPAS_CAND[k.etapa] || k.etapa) }); if (i === 0) o.selected = true; proc.appendChild(o); });
    var prazo = el("select", { id: "av-prazo" }, [["3", "3 dias"], ["7", "7 dias"], ["15", "15 dias"]].map(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === "7") op.selected = true; return op; }));
    var err = el("p", { class: "error-msg", role: "alert" });
    var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Gerar link" });
    var form = el("form", { class: "admin-form", novalidate: true }, [
      el("fieldset", { class: "field full" }, [el("legend", { class: "label-like", text: "Testes deste link" })].concat(TESTES_FORM.map(function (t, i) {
        return el("label", { class: "check-inline", for: "av-t-" + t[0] }, [cbs[i], " " + t[1]]);
      }))),
      el("div", { class: "fields" }, [
        c._orient ? null : el("div", { class: "field" }, [el("label", { for: "av-proc", text: "Processo seletivo" }), proc]),
        el("div", { class: "field" }, [el("label", { for: "av-prazo", text: "Prazo para responder" }), prazo])
      ]), err, el("div", { class: "btn-row" }, [btn])
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = "";
      var testes = cbs.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (!testes.length) { err.textContent = "Escolha pelo menos um teste."; return; }
      var d = new Date(); d.setDate(d.getDate() + Number(prazo.value)); d.setHours(23, 59, 0, 0);
      btn.disabled = true;
      sb.from("avaliacoes").insert(Object.assign(c._orient ? { cliente_id: c.id } : { candidato_id: c.id, candidatura_id: proc.value ? Number(proc.value) : null }, { testes: testes, expira_em: d.toISOString() })).select("id").single().then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = erroAmigavel(r.error); return; }
        msg("Link gerado. Use “Copiar mensagem com o link” ou “Enviar pelo WhatsApp”.", "ok");
        refrescar(c);
      });
    });
    nodes.push(el("details", { open: aval.length ? null : true }, [el("summary", { class: "btn btn-secondary btn-sm", text: "Enviar novo link de avaliação" }), form]));
    return section("Avaliação comportamental", nodes);
  }

  /* ---------- seção: entrevista por competências (STAR) */
  function secaoStar(c, cands, stars) {
    var T = TX.star || { competencias: [], notas: {} };
    var box = el("div", { class: "laudo-box" });
    var sec = section("Entrevista por competências (STAR)", [el("p", { class: "hint", text: c._orient ? "Use o método STAR (Situação, Tarefa, Ação, Resultado) para a pessoa contar experiências reais e você enxergar evidências de como ela age. A nota vai de 1 a 4 ou NE (não evidenciado), sempre com justificativa. Em orientação, a nota serve para apontar o que está forte e o que merece desenvolvimento, e não para aprovar ou reprovar ninguém. As anotações completas ficam aqui, de uso interno." : "Registre a entrevista pelo método STAR (Situação, Tarefa, Ação, Resultado), uma competência por vez. A nota vai de 1 a 4 ou NE (não evidenciado), sempre com justificativa baseada em evidências. No laudo entram só a nota e a justificativa; as anotações completas ficam aqui, de uso interno." }), box]);
    if (stars === null) { box.appendChild(el("p", { class: "error-msg", text: "Recurso ainda não ativado: rode o arquivo supabase/sql/010-bigfive-disc-star.sql no SQL Editor do Supabase." })); return sec; }
    var sel = el("select", { id: "st-proc", "aria-label": "Processo seletivo da entrevista" });
    if (!c._orient) {
      cands.forEach(function (k) { sel.appendChild(el("option", { value: String(k.id), text: (k.vagas ? k.vagas.codigo + " · " + k.vagas.titulo : "Vaga") })); });
      sel.appendChild(el("option", { value: "", text: "Sem vaga (banco de talentos)" }));
    }
    var area = el("div");
    function render() {
      area.innerHTML = "";
      var cid = sel.value ? Number(sel.value) : null;
      var rec = stars.filter(function (x) { return (x.candidatura_id || null) === cid; })[0] || null;
      area.appendChild(formStar(c, stars, rec, cid));
    }
    sel.addEventListener("change", render);
    if (!c._orient) box.appendChild(el("div", { class: "field" }, [el("label", { for: "st-proc", text: "Processo seletivo" }), sel]));
    box.appendChild(area);
    render();
    return sec;
  }

  function formStar(c, stars, rec, cid) {
    var T = TX.star, salvos = {};
    (rec && rec.competencias || []).forEach(function (x) { salvos[x.id] = x; });
    var cab = buildForm([
      { k: "entrevistador", label: "Entrevistador(a)", max: 160, def: me && me.nome },
      { k: "etapa", label: "Etapa", max: 80, hint: "Ex.: entrevista inicial, finalista." },
      { k: "data_entrevista", label: "Data da entrevista", type: "date" }
    ], rec || { entrevistador: me && me.nome }, "st");

    var blocos = T.competencias.map(function (k) {
      var v = salvos[k.id] || {};
      function ta(rot, chave, rows) {
        var id = "stc-" + k.id + "-" + chave, t = el("textarea", { id: id, maxlength: "800", rows: String(rows || 2) });
        if (v[chave]) t.value = v[chave];
        if (!can("editar")) t.disabled = true;
        return { campo: el("div", { class: "field full" }, [el("label", { for: id, text: rot }), t]), t: t };
      }
      var f = { id: k.id, nome: k.nome, S: ta("S — Situação/contexto", "s"), Tt: ta("T — Tarefa/responsabilidade", "t"), A: ta("A — Ação individual", "a"), R: ta("R — Resultado/evidências", "r"),
        Ev: ta("Evidências, dados e pontos a aprofundar", "evidencias"), J: ta("Justificativa baseada em evidências", "justificativa") };
      f.nota = el("select", { id: "stc-" + k.id + "-nota" }, [el("option", { value: "", text: "Sem nota" })].concat(["1", "2", "3", "4", "NE"].map(function (n) { return el("option", { value: n, text: n + " · " + T.notas[n][0] }); })));
      f.nota.value = v.nota || "";
      if (!can("editar")) f.nota.disabled = true;
      var rotulo = function () { return k.nome + (f.nota.value ? " · nota " + f.nota.value : ""); };
      f.sum = el("summary", { text: rotulo() });
      f.nota.addEventListener("change", function () { f.sum.textContent = rotulo(); });
      f.node = el("details", { class: "star-comp" }, [f.sum,
        el("p", { class: "hint", text: "Pergunta: " + k.pergunta }),
        el("div", { class: "fields" }, [f.S.campo, f.Tt.campo, f.A.campo, f.R.campo, f.Ev.campo,
          el("div", { class: "field" }, [el("label", { for: "stc-" + k.id + "-nota", text: "Nota (1 a 4 ou NE)" }), f.nota]), f.J.campo])]);
      return f;
    });
    function coletar() {
      return blocos.map(function (b) {
        return { id: b.id, s: b.S.t.value.trim(), t: b.Tt.t.value.trim(), a: b.A.t.value.trim(), r: b.R.t.value.trim(), evidencias: b.Ev.t.value.trim(), nota: b.nota.value, justificativa: b.J.t.value.trim() };
      }).filter(function (o) { return o.s || o.t || o.a || o.r || o.evidencias || o.justificativa || o.nota; });
    }
    var fim = buildForm([
      { k: "pontos_fortes", label: "Pontos fortes evidenciados", type: "textarea", max: 3000, rows: 4 },
      { k: "pontos_aprofundar", label: "Pontos a aprofundar", type: "textarea", max: 3000, rows: 4 },
      { k: "sintese_requisitos", label: c._orient ? "Síntese: o que está forte e o que merece desenvolvimento" : "Síntese vinculada aos requisitos da vaga", type: "textarea", max: 4000, rows: 5, full: true }
    ], rec, "sf");

    var rubrica = el("details", { class: "star-rubrica" }, [el("summary", { text: "Como conduzir e rubrica das notas" }), el("p", { class: "small", text: T.como }),
      el("ul", null, ["1", "2", "3", "4", "NE"].map(function (n) { return el("li", null, [el("strong", { text: n + " · " + T.notas[n][0] + ": " }), T.notas[n][1]]); }))]);

    var info = el("span", { class: "small muted", role: "status", text: rec ? " Salvo em " + fmtDataHora(rec.atualizado_em) : "" });
    var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Salvar entrevista" });
    var form = el("form", { class: "admin-form", novalidate: true }, [rubrica, cab.node,
      el("div", { class: "star-comps" }, blocos.map(function (b) { return b.node; })), fim.node, el("div", { class: "btn-row" }, [btn, info])]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var comps = coletar();
      var semJust = comps.filter(function (o) { return /^[1-4]$/.test(o.nota) && !o.justificativa; }).map(function (o) { return (T.competencias.filter(function (k) { return k.id === o.id; })[0] || {}).nome; });
      if (semJust.length) { msg("Preencha a justificativa baseada em evidências de: " + semJust.join(", ") + ".", "err"); return; }
      btn.disabled = true;
      var v = Object.assign(cab.values(), fim.values(), { competencias: comps });
      var q = rec ? sb.from("entrevistas_star").update(v).eq("id", rec.id) : sb.from("entrevistas_star").insert(Object.assign(c._orient ? { cliente_id: c.id } : { candidato_id: c.id, candidatura_id: cid }, v));
      q.select("*").single().then(function (r) {
        btn.disabled = false;
        if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
        if (rec) { stars[stars.indexOf(rec)] = r.data; } else stars.push(r.data);
        rec = r.data;
        info.textContent = " Salvo em " + fmtDataHora(r.data.atualizado_em);
        msg("Entrevista salva.", "ok");
      });
    });
    return form;
  }

  /* ---------- seção: laudo */
  function secaoLaudo(c, cands, aval, laudos, stars) {
    var box = el("div", { class: "laudo-box" });
    var sec = section("Laudo", [el("p", { class: "hint", text: "Um laudo por processo seletivo. Os resultados dos testes entram automaticamente; o botão “Preencher com base nos testes” sugere a síntese e os pontos fortes e a desenvolver para você revisar." }), box]);
    if (laudos === null) { box.appendChild(el("p", { class: "error-msg", text: "Recurso ainda não ativado: rode o SQL 006 no Supabase." })); return sec; }
    var sel = el("select", { id: "ld-proc", "aria-label": "Processo seletivo do laudo" });
    cands.forEach(function (k) { sel.appendChild(el("option", { value: String(k.id), text: (k.vagas ? k.vagas.codigo + " · " + k.vagas.titulo : "Vaga") })); });
    sel.appendChild(el("option", { value: "", text: "Sem vaga (banco de talentos)" }));
    var area = el("div");
    function render() {
      area.innerHTML = "";
      var cid = sel.value ? Number(sel.value) : null;
      var laudo = laudos.filter(function (l) { return (l.candidatura_id || null) === cid; })[0] || null;
      area.appendChild(formLaudo(c, cands, aval, laudos, laudo, cid, stars));
    }
    sel.addEventListener("change", render);
    box.appendChild(el("div", { class: "field" }, [el("label", { for: "ld-proc", text: "Processo seletivo" }), sel]));
    box.appendChild(area);
    render();
    return sec;
  }

  function formLaudo(c, cands, aval, laudos, laudo, cid, stars) {
    var R = resultados(c, aval, cid, stars);
    var proc = nomeProcesso(cands, cid);
    var resumo = [];
    if (R.perfil) resumo.push("Perfil: " + TX.perfil[R.perfil.ordem[0]].nome + " " + R.perfil[R.perfil.ordem[0]] + "%" + (R.perfil.origem === "site" ? " (teste do site)" : ""));
    if (R.enea) resumo.push("Eneagrama: tipo " + R.enea.ordem[0] + " · " + TX.eneagrama[R.enea.ordem[0]].nome);
    if (R.disc) resumo.push("DISC exploratório: " + leituraDisc(R.disc).conj.map(function (k) { return k + " " + fmtM(R.disc.media[k], 1); }).join(" e "));
    if (R.b5) resumo.push("Big Five exploratório respondido");
    if (R.star) resumo.push("Entrevista STAR registrada");
    var info = el("p", { class: "small", text: resumo.length ? "Resultados disponíveis — " + resumo.join(" · ") : "Ainda não há testes respondidos para este candidato. Você pode preencher o laudo com as outras etapas." });

    var f = buildForm([
      { k: "finalidade", label: "Finalidade da avaliação", type: "textarea", max: 1000, rows: 2, full: true,
        hint: "Se ficar vazio, o laudo usa: “Subsidiar a decisão no processo seletivo" + (proc ? " para a vaga " + proc.split(" · ").slice(1).join(" · ") : "") + "”." },
      { k: "sintese", label: "Síntese integrada dos resultados", type: "textarea", max: 8000, rows: 9, full: true },
      { k: "pontos_fortes", label: "Pontos fortes", type: "textarea", max: 3000, rows: 5 },
      { k: "pontos_desenvolver", label: "Pontos a desenvolver", type: "textarea", max: 3000, rows: 5 },
      { k: "conclusao", label: "Conclusão", type: "select", options: CONCLUSOES, placeholder: "Selecione" },
      { k: "responsavel", label: "Assinatura (nome e registro)", max: 160, def: me && me.nome, hint: "Aparece só no laudo impresso." },
      { k: "parecer", label: "Parecer final", type: "textarea", max: 4000, rows: 5, full: true }
    ], laudo || { responsavel: me && me.nome }, "ld");

    // Outros instrumentos (Palográfico, AC, G36, entrevistas...)
    var dlId = "ld-inst-sugestoes";
    var datalist = el("datalist", { id: dlId }, (TX.instrumentos || []).map(function (t) { return el("option", { value: t }); }));
    var linhas = el("div", { class: "inst-rows" });
    function linha(v) {
      v = v || {};
      var n = linhas.children.length + 1;
      var campos = {
        instrumento: el("input", { type: "text", list: dlId, maxlength: "80", "aria-label": "Instrumento " + n, placeholder: "Instrumento ou etapa" }),
        etapa: el("select", { "aria-label": "Etapa " + n }, [el("option", { value: "", text: "Etapa" })].concat(["Triagem", "Entrevista", "Finalista", "Outra"].map(function (o) { return el("option", { value: o, text: o }); }))),
        data: el("input", { type: "date", "aria-label": "Data " + n }),
        resultado: el("input", { type: "text", class: "inst-res", maxlength: "160", "aria-label": "Resultado " + n, placeholder: "Resultado (ex.: percentil 70, médio superior)" }),
        obs: el("textarea", { maxlength: "600", rows: "2", "aria-label": "Interpretação " + n, placeholder: "Interpretação / observações" })
      };
      Object.keys(campos).forEach(function (k) { if (v[k]) campos[k].value = v[k]; });
      var rm = el("button", { type: "button", class: "btn-link small", text: "Remover", onclick: function () { row.remove(); } });
      var row = el("div", { class: "inst-row" }, [campos.instrumento, campos.etapa, campos.data, campos.resultado, campos.obs, rm]);
      row._campos = campos;
      linhas.appendChild(row);
    }
    (laudo && laudo.outros_instrumentos || []).forEach(linha);
    function instrumentos() {
      return [].slice.call(linhas.children).map(function (r) {
        var o = {}; Object.keys(r._campos).forEach(function (k) { o[k] = r._campos[k].value.trim(); }); return o;
      }).filter(function (o) { return o.instrumento || o.resultado || o.obs; });
    }
    var outros = el("div", { class: "field full" }, [
      el("p", { class: "label-like", text: "Outros instrumentos e etapas (aplicados fora do site)" }), datalist, linhas,
      el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Adicionar instrumento", onclick: function () { linha(); linhas.lastChild._campos.instrumento.focus(); } })
    ]);
    f.node.insertBefore(outros, f.node.children[1]);

    var btnSug = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Preencher com base nos testes" });
    var preencher = function () {
      var a = analise(c, resultados(c, aval, cid, stars));
      if (!a.sintese) { msg("Ainda não há testes respondidos para gerar a sugestão.", "err"); return; }
      f.inputs.sintese.value = a.sintese; f.inputs.pontos_fortes.value = a.fortes; f.inputs.pontos_desenvolver.value = a.desenvolver;
      msg("Texto sugerido preenchido. Revise e ajuste antes de salvar.", "ok");
    };
    if (laudo && (laudo.sintese || laudo.pontos_fortes)) confirmarDuasVezes(btnSug, "Clique de novo: substitui a síntese e os pontos", preencher);
    else btnSug.addEventListener("click", preencher);

    var info2 = el("span", { class: "small muted", role: "status", text: laudo ? " Salvo em " + fmtDataHora(laudo.atualizado_em) : "" });
    var btnSalvar = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Salvar laudo" });
    var btnVer = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Visualizar e imprimir", onclick: function () {
      var v = f.values(); v.outros_instrumentos = instrumentos();
      abrirLaudo(c, cands, cid, v, resultados(c, aval, cid, stars));
    } });
    var form = el("form", { class: "admin-form", novalidate: true }, [info, f.node, el("div", { class: "btn-row" }, [btnSug, btnSalvar, btnVer, info2])]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); btnSalvar.disabled = true;
      var v = f.values(); v.outros_instrumentos = instrumentos();
      var q = laudo ? sb.from("laudos").update(v).eq("id", laudo.id) : sb.from("laudos").insert(Object.assign({ candidato_id: c.id, candidatura_id: cid }, v));
      q.select("*").single().then(function (r) {
        btnSalvar.disabled = false;
        if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
        if (laudo) { var i = laudos.indexOf(laudo); laudos[i] = r.data; } else laudos.push(r.data);
        laudo = r.data;
        info2.textContent = " Salvo em " + fmtDataHora(r.data.atualizado_em);
        msg("Laudo salvo.", "ok");
      });
    });
    return form;
  }

  /* ---------- visualização para impressão / PDF */
  function abrirLaudo(c, cands, cid, v, R) {
    var antigo = $("laudo-view"); if (antigo) antigo.remove();
    var k = (cands || []).filter(function (x) { return x.id === cid; })[0];
    var vaga = k && k.vagas ? k.vagas.titulo + " (" + k.vagas.codigo + ")" : null;
    var hoje = new Date().toISOString();
    sb.rpc("registrar_acesso_laudo", { p_candidato: c.id });

    function h(t) { return el("h2", { text: t }); }
    function lista(arr) { return el("ul", null, arr.map(function (x) { return el("li", { text: x }); })); }
    function texto(t) { return el("p", { class: "lv-texto", text: t }); }
    var n = 0; function titulo(t) { n++; return h(n + ". " + t); }

    var art = el("article", { class: "laudo" });
    art.appendChild(el("header", { class: "lv-head" }, [
      el("div", null, [el("p", { class: "lv-marca", text: "Permanência · Consultoria em RH" }), el("h1", { text: "Laudo de avaliação comportamental" })]),
      el("p", { class: "lv-conf", text: "Confidencial · " + fmtData(hoje) })
    ]));

    art.appendChild(titulo("Identificação"));
    art.appendChild(dl([
      ["Nome", c.nome_social ? c.nome_social + " (nome civil: " + c.nome + ")" : c.nome], ["Código", c.codigo], ["Processo seletivo", vaga || "Banco de Talentos (sem vaga específica)"],
      ["Cargo pretendido", c.cargo_desejado], ["Cidade", c.cidade + "/" + c.uf], ["Escolaridade", c.escolaridade], ["Experiência total", c.experiencia], ["Experiência no cargo", c.experiencia_cargo]
    ]));

    art.appendChild(titulo("Finalidade"));
    art.appendChild(texto(v.finalidade || ("Subsidiar a decisão no processo seletivo" + (vaga ? " para a vaga " + k.vagas.titulo : "") + ", descrevendo o perfil comportamental de " + nomeExib(c) + " a partir dos instrumentos aplicados.")));

    var proc = [];
    if (R.perfil) proc.push((R.perfil.origem === "site" ? "Questionário de perfil comportamental do site (25 itens)" : "Questionário de preferência cerebral e perfil comportamental (25 itens), por link individual") + " — " + fmtData(R.perfil.data));
    if (R.enea) proc.push("Eneagrama de personalidade (36 itens), por link individual — " + fmtData(R.enea.data));
    if (R.disc) proc.push("DISC exploratório (20 afirmações, escala de 1 a 5), por link individual — " + fmtData(R.disc.data));
    if (R.b5) proc.push("Big Five exploratório (30 afirmações, escala de 1 a 5), por link individual — " + fmtData(R.b5.data));
    if (R.star) proc.push(["Entrevista por competências (STAR)", R.star.etapa, R.star.data_entrevista ? fmtData(R.star.data_entrevista) : null].filter(Boolean).join(" — "));
    (v.outros_instrumentos || []).forEach(function (o) { proc.push([o.instrumento || "Instrumento", o.etapa, o.data ? fmtData(o.data) : null].filter(Boolean).join(" — ")); });
    art.appendChild(titulo("Procedimentos"));
    art.appendChild(proc.length ? lista(proc) : texto("Nenhum instrumento registrado."));

    if (R.perfil || R.enea || R.disc || R.b5 || R.star || (v.outros_instrumentos || []).length) {
      art.appendChild(titulo("Resultados"));
      if (R.perfil) {
        var P = R.perfil, p1 = TX.perfil[P.ordem[0]], p2 = TX.perfil[P.ordem[1]];
        art.appendChild(el("h3", { text: "Perfil comportamental" }));
        art.appendChild(blocoPerfil(P));
        art.appendChild(texto(P[P.ordem[0]] === P[P.ordem[1]]
          ? "Empate entre " + p1.nome + " — " + p1.papel + " e " + p2.nome + " — " + p2.papel + " (" + P[P.ordem[0]] + "% cada). A descrição abaixo é do perfil " + p1.nome + "; leia-a junto com a síntese."
          : "Predominante: " + p1.nome + " — " + p1.papel + " (“" + p1.lema + "”). Secundário: " + p2.nome + " — " + p2.papel + "."));
        art.appendChild(el("div", { class: "lv-cols" }, [
          el("div", null, [el("h4", { text: "Comportamento" }), texto(p1.comportamento), el("h4", { text: "Valores" }), texto(p1.valores)]),
          el("div", null, [el("h4", { text: "Motivações" }), lista(p1.motivacoes)])
        ]));
        art.appendChild(el("h3", { text: "Preferência cerebral" }));
        art.appendChild(blocoCerebral(P));
        var lado = P.esq >= P.dir ? "esquerdo" : "direito", reg = P.ant >= P.pos ? "anterior" : "posterior", cb = TX.cerebral;
        art.appendChild(texto(cb[lado].nome + " (" + cb[lado].sub + "): " + cb[lado].tracos.join(", ").toLowerCase() + ". " + cb[reg].nome + " (" + cb[reg].sub + "): " + cb[reg].tracos.join("; ").toLowerCase() + "."));
      }
      if (R.enea) {
        var E = R.enea, t1 = E.ordem[0], e1 = TX.eneagrama[t1];
        art.appendChild(el("h3", { text: "Eneagrama" }));
        art.appendChild(blocoEnea(E));
        art.appendChild(texto(E.pontos[t1 - 1] === E.pontos[E.ordem[1] - 1]
          ? "Maior pontuação empatada entre os tipos " + t1 + " — " + e1.nome + " e " + E.ordem[1] + " — " + TX.eneagrama[E.ordem[1]].nome + " (" + E.pontos[t1 - 1] + " itens cada). A descrição abaixo é do tipo " + t1 + "; o empate deve ser explorado na entrevista."
          : "Tipo predominante: " + t1 + " — " + e1.nome + " (" + E.pontos[t1 - 1] + " itens). Tipos seguintes: " + E.ordem[1] + " — " + TX.eneagrama[E.ordem[1]].nome + " e " + E.ordem[2] + " — " + TX.eneagrama[E.ordem[2]].nome + "."));
        art.appendChild(el("div", { class: "lv-cols" }, [
          el("div", null, [el("h4", { text: "Essência" }), texto(e1.essencia), el("h4", { text: "No trabalho" }), texto(e1.trabalho), el("h4", { text: "Como extrair o melhor" }), texto(e1.gestao)]),
          el("div", null, [el("h4", { text: "Tende a se destacar em" }), lista(e1.fortes), el("h4", { text: "Pontos de atenção" }), lista(e1.atencao)])
        ]));
      }
      if (R.disc) {
        art.appendChild(el("h3", { text: "Estilo de comportamento (DISC exploratório)" }));
        nodesDisc(R.disc).forEach(function (n) { art.appendChild(n); });
      }
      if (R.b5) {
        art.appendChild(el("h3", { text: "Big Five exploratório" }));
        nodesB5(R.b5).forEach(function (n) { art.appendChild(n); });
      }
      if (R.star) {
        var ST = TX.star, rs = R.star, salvosStar = {};
        (rs.competencias || []).forEach(function (x) { salvosStar[x.id] = x; });
        art.appendChild(el("h3", { text: "Entrevista por competências (STAR)" }));
        var cabStar = [rs.entrevistador ? "Entrevistador(a): " + rs.entrevistador : null, rs.etapa ? "Etapa: " + rs.etapa : null, rs.data_entrevista ? "Data: " + fmtData(rs.data_entrevista) : null].filter(Boolean);
        if (cabStar.length) art.appendChild(texto(cabStar.join(" · ")));
        var linhasStar = ST.competencias.filter(function (k) { return salvosStar[k.id] && salvosStar[k.id].nota; }).map(function (k) {
          var x = salvosStar[k.id];
          return [k.nome, x.nota + " · " + ST.notas[x.nota][0], x.justificativa || "—"];
        });
        if (linhasStar.length) art.appendChild(tabelaSimples(["Competência", "Nota", "Justificativa baseada em evidências"], linhasStar));
        if (rs.pontos_fortes) art.appendChild(el("h4", { text: "Pontos fortes evidenciados" })), art.appendChild(texto(rs.pontos_fortes));
        if (rs.pontos_aprofundar) art.appendChild(el("h4", { text: "Pontos a aprofundar" })), art.appendChild(texto(rs.pontos_aprofundar));
        if (rs.sintese_requisitos) art.appendChild(el("h4", { text: "Síntese vinculada aos requisitos da vaga" })), art.appendChild(texto(rs.sintese_requisitos));
        art.appendChild(el("p", { class: "small muted", text: "Notas de 1 a 4 conforme a rubrica: 1 evidência insuficiente, 2 parcial, 3 consistente, 4 forte. NE (não evidenciado) indica falta de evidência na entrevista e não equivale à nota 1." }));
      }
      if ((v.outros_instrumentos || []).length) {
        art.appendChild(el("h3", { text: "Outros instrumentos e etapas" }));
        var tb = el("tbody");
        v.outros_instrumentos.forEach(function (o) {
          tb.appendChild(el("tr", null, [el("td", { text: o.instrumento || "—" }), el("td", { text: [o.etapa, o.data ? fmtData(o.data) : null].filter(Boolean).join(" · ") || "—" }), el("td", { text: o.resultado || "—" }), el("td", { text: o.obs || "" })]));
        });
        art.appendChild(el("table", { class: "lv-table" }, [el("thead", null, [el("tr", null, ["Instrumento", "Etapa / data", "Resultado", "Interpretação"].map(function (t) { return el("th", { text: t }); }))]), tb]));
      }
    }

    if (v.sintese) { art.appendChild(titulo("Síntese integrada")); art.appendChild(texto(v.sintese)); }
    if (v.pontos_fortes || v.pontos_desenvolver) {
      art.appendChild(titulo("Pontos fortes e a desenvolver"));
      art.appendChild(el("div", { class: "lv-cols" }, [
        el("div", null, [el("h4", { text: "Pontos fortes" }), texto(v.pontos_fortes || "—")]),
        el("div", null, [el("h4", { text: "Pontos a desenvolver" }), texto(v.pontos_desenvolver || "—")])
      ]));
    }
    art.appendChild(titulo("Conclusão"));
    var conc = CONCLUSOES.filter(function (x) { return x[0] === v.conclusao; })[0];
    if (conc) art.appendChild(el("p", { class: "lv-conclusao", text: conc[1] }));
    if (v.parecer) art.appendChild(texto(v.parecer));
    if (!conc && !v.parecer) art.appendChild(texto("—"));

    art.appendChild(el("p", { class: "lv-nota", text: "Os questionários de autorrelato (perfil comportamental, preferência cerebral, Eneagrama, DISC e Big Five) descrevem preferências e tendências de comportamento. São ferramentas de apoio e foram interpretados em conjunto com a entrevista e as demais etapas; nenhuma conclusão se baseia em um único instrumento. O DISC e o Big Five são instrumentos autorais de caráter exploratório, sem validação psicométrica nem normas; não são teste psicológico e não permitem diagnóstico. Documento confidencial, destinado exclusivamente ao processo indicado. As informações devem ser guardadas com sigilo e não podem ser repassadas a terceiros." }));
    art.appendChild(el("div", { class: "lv-assinatura" }, [el("span", { class: "lv-linha" }), el("p", { text: v.responsavel || (me && me.nome) || "" }), el("p", { class: "small", text: "Permanência · Consultoria em RH · " + fmtData(hoje) })]));

    var fechar = function () { view.remove(); document.body.classList.remove("laudo-aberto"); document.removeEventListener("keydown", esc, true); if (btnFechar._volta) btnFechar._volta.focus(); };
    var esc = function (e) { if (e.key === "Escape") { e.stopPropagation(); fechar(); } };
    var btnFechar = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Fechar", onclick: fechar });
    btnFechar._volta = document.activeElement;
    var view = el("div", { id: "laudo-view", class: "laudo-view", role: "dialog", "aria-modal": "true", "aria-label": "Laudo de " + nomeExib(c) }, [
      el("div", { class: "lv-toolbar" }, [
        el("span", { class: "small", text: "Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão." }),
        el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Imprimir / salvar PDF", onclick: function () { window.print(); } }), btnFechar
      ]), art
    ]);
    document.body.appendChild(view);
    document.body.classList.add("laudo-aberto");
    document.addEventListener("keydown", esc, true);
    btnFechar.focus();
  }


  /* ============================================================ DOCUMENTOS E MIGRAÇÃO */
  var DOC_TIPOS = [["curriculo", "Currículo"], ["linkedin", "LinkedIn"], ["relatorio", "Relatório"], ["pdi", "PDI / plano"], ["plano_carreira", "Plano de carreira"], ["contrato", "Contrato"], ["outro", "Outro"]];
  var DOC_TIPO = {}; DOC_TIPOS.forEach(function (t) { DOC_TIPO[t[0]] = t[1]; });
  var DOC_EXT = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain" };
  var DOC_MAX = 10 * 1024 * 1024;
  function tamanhoFmt(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function nomeSeguro(n) {
    var s = String(n || "arquivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "");
    return (s.length > 80 ? s.slice(-80) : s) || "arquivo";
  }
  function extDe(n) { var m = /\.([A-Za-z0-9]+)$/.exec(n || ""); return m ? m[1].toLowerCase() : ""; }

  /** Remove do armazenamento todos os arquivos de uma pessoa (antes de excluir o cadastro). Sem o SQL 012, não há o que apagar. */
  function apagarArquivos(coluna, id) {
    return sb.from("documentos_pessoa").select("caminho").eq(coluna, id).then(function (r) {
      if (r.error) return semSql012(r.error) ? {} : r;
      var paths = (r.data || []).map(function (x) { return x.caminho; });
      return paths.length ? sb.storage.from("documentos").remove(paths) : {};
    });
  }
  function semSql012(e) { return e && /documentos_pessoa|42P01|PGRST205/.test(String(e.code || "") + " " + String(e.message || "")); }

  /** owner: { coluna: "candidato_id" | "cliente_id", pasta: "candidatos" | "clientes", id }  ·  docs: lista ou null (SQL 012 não rodado) */
  function secaoDocumentos(owner, docs, refresh) {
    var nodes = [el("p", { class: "hint", text: "Guarde aqui os documentos desta pessoa: o que geramos para ela (currículo, LinkedIn, relatório, PDI, plano de carreira) e o que ela nos enviou. Os arquivos ficam em armazenamento privado, até 10 MB cada (PDF, Word, Excel, PowerPoint, imagem ou texto). Quem abre um documento fica registrado, e o link aberto vale por 60 segundos." })];
    if (docs === null) { nodes.push(el("p", { class: "error-msg", text: "Recurso ainda não ativado: rode o arquivo supabase/sql/012-migracao-e-documentos.sql no SQL Editor do Supabase." })); return section("Documentos", nodes); }
    var lista = el("ul", { class: "aval-list" });
    if (!docs.length) lista.appendChild(el("li", { class: "muted small", text: "Nenhum documento guardado ainda." }));
    docs.forEach(function (d) {
      var aviso = el("span", { class: "small muted", role: "status" });
      var abrirBtn = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Abrir" });
      abrirBtn.addEventListener("click", function () {
        abrirBtn.disabled = true;
        sb.storage.from("documentos").createSignedUrl(d.caminho, 60).then(function (r) {
          abrirBtn.disabled = false;
          if (r.error) { msg("Não foi possível abrir: o arquivo não existe ou você não tem permissão.", "err"); return; }
          sb.rpc("registrar_acesso_documento", { p_documento: d.id });
          var a = el("a", { href: r.data.signedUrl, target: "_blank", rel: "noopener noreferrer" });
          document.body.appendChild(a); a.click(); a.remove();
        });
      });
      var acoes = el("div", { class: "inline aval-acoes" }, [abrirBtn]);
      if (can("editar")) {
        var rm = el("button", { type: "button", class: "btn-link small", text: "Excluir" });
        confirmarDuasVezes(rm, "Clique de novo para excluir", function () {
          sb.storage.from("documentos").remove([d.caminho]).then(function (r1) {
            if (r1.error) { msg("Não foi possível apagar o arquivo. Nada foi excluído.", "err"); return; }
            sb.from("documentos_pessoa").delete().eq("id", d.id).then(function (r2) {
              if (r2.error) { msg(erroAmigavel(r2.error), "err"); return; }
              msg("Documento excluído.", "ok"); refresh();
            });
          });
        });
        acoes.appendChild(rm);
      }
      acoes.appendChild(aviso);
      lista.appendChild(el("li", null, [
        el("div", null, [el("strong", { text: d.titulo }), " ", el("span", { class: "pill", text: DOC_TIPO[d.tipo] || d.tipo })]),
        el("div", { class: "small muted", text: d.arquivo_nome + " · " + tamanhoFmt(d.tamanho || 0) + " · enviado em " + fmtData(d.criado_em) }), acoes
      ]));
    });
    nodes.push(lista);
    if (can("editar")) {
      var tipo = el("select", { id: "dc-tipo" }, DOC_TIPOS.map(function (t) { return el("option", { value: t[0], text: t[1] }); }));
      var titulo = el("input", { type: "text", id: "dc-titulo", maxlength: "160", placeholder: "Se ficar vazio, usa o nome do arquivo" });
      var arq = el("input", { type: "file", id: "dc-arquivo", accept: Object.keys(DOC_EXT).map(function (x) { return "." + x; }).join(",") });
      var err = el("p", { class: "error-msg", role: "alert" });
      var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Enviar documento" });
      var form = el("form", { class: "admin-form", novalidate: true }, [
        el("div", { class: "fields" }, [
          el("div", { class: "field" }, [el("label", { for: "dc-tipo", text: "Tipo" }), tipo]),
          el("div", { class: "field" }, [el("label", { for: "dc-titulo", text: "Título" }), titulo]),
          el("div", { class: "field full" }, [el("label", { for: "dc-arquivo", text: "Arquivo" }), arq])
        ]), err, el("div", { class: "btn-row" }, [btn])
      ]);
      form.addEventListener("submit", function (e) {
        e.preventDefault(); err.textContent = "";
        var f = arq.files && arq.files[0];
        if (!f) { err.textContent = "Escolha um arquivo."; return; }
        var mime = DOC_EXT[extDe(f.name)];
        if (!mime) { err.textContent = "Formato não aceito. Use PDF, Word, Excel, PowerPoint, imagem (PNG/JPG) ou texto."; return; }
        if (f.size > DOC_MAX) { err.textContent = "O arquivo tem " + tamanhoFmt(f.size) + ". O limite é 10 MB."; return; }
        if (f.size < 1) { err.textContent = "O arquivo está vazio."; return; }
        var caminho = owner.pasta + "/" + owner.id + "/" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + "-" + nomeSeguro(f.name);
        btn.disabled = true; btn.textContent = "Enviando…";
        sb.storage.from("documentos").upload(caminho, f, { contentType: mime, upsert: false }).then(function (r1) {
          if (r1.error) { btn.disabled = false; btn.textContent = "Enviar documento"; err.textContent = "Não foi possível enviar o arquivo. Confira a conexão e o formato e tente de novo."; return; }
          var linha = { tipo: tipo.value, titulo: (titulo.value.trim() || f.name.replace(/\.[^.]+$/, "")).slice(0, 160), arquivo_nome: f.name.slice(0, 200), caminho: caminho, mime: mime, tamanho: f.size };
          linha[owner.coluna] = owner.id;
          sb.from("documentos_pessoa").insert(linha).select("id").single().then(function (r2) {
            btn.disabled = false; btn.textContent = "Enviar documento";
            if (r2.error) { sb.storage.from("documentos").remove([caminho]); err.textContent = erroAmigavel(r2.error); return; }
            msg("Documento guardado.", "ok"); refresh();
          });
        });
      });
      nodes.push(el("details", { open: docs.length ? null : true }, [el("summary", { class: "btn btn-secondary btn-sm", text: "Enviar novo documento" }), form]));
    }
    return section("Documentos", nodes);
  }

  /** Na ficha do candidato: migrar para a Orientação quando a pessoa contrata a assessoria de carreira. */
  function secaoCarreira(c, cli) {
    var nodes = [];
    if (cli === null) { nodes.push(el("p", { class: "error-msg", text: "Recurso ainda não ativado: rode o arquivo supabase/sql/012-migracao-e-documentos.sql no SQL Editor do Supabase." })); return section("Assessoria de carreira", nodes); }
    if (cli) {
      nodes.push(el("p", { class: "small", text: "Esta pessoa já está em Orientação (" + cli.codigo + "). Os testes, as entrevistas, o relatório e os documentos da assessoria ficam lá." }));
      nodes.push(el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Abrir na Orientação", onclick: function () { abrirCliente(cli.id); } }));
    } else {
      nodes.push(el("p", { class: "hint", text: "Quando a pessoa contratar a assessoria de carreira, migre o cadastro para a Orientação. Copia os dados de contato e o perfil profissional e cria o vínculo; o cadastro no Banco de Talentos continua como está. Testes, laudo e entrevistas feitos na seleção não são copiados: na assessoria a pessoa responde de novo, com a autorização dela." }));
      if (can("editar")) {
        var b = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Migrar para Orientação" });
        confirmarDuasVezes(b, "Clique de novo para migrar", function () {
          b.disabled = true;
          sb.rpc("migrar_candidato_para_orientacao", { p_candidato: c.id }).then(function (r) {
            if (r.error) { b.disabled = false; msg(semSql012(r.error) || /migrar_candidato/.test(r.error.message || "") ? "Rode antes o arquivo supabase/sql/012-migracao-e-documentos.sql no Supabase." : erroAmigavel(r.error), "err"); return; }
            msg("Pessoa criada em Orientação. Confirme a contratação e a autorização na ficha dela.", "ok");
            abrirCliente(r.data);
            if (!$("tab-orientacao").hidden) listarOri();
          });
        });
        nodes.push(b);
      }
    }
    return section("Assessoria de carreira", nodes);
  }

  /* ============================================================ ORIENTAÇÃO DE PROFISSIONAIS */
  var ORI_STATUS = { em_atendimento: "Em atendimento", pausado: "Pausado", concluido: "Concluído" };
  var oriCache = [];
  function semSql011(e) { return e && /orientacao_|42P01|PGRST205|PGRST200/.test(String(e.code || "") + " " + String(e.message || "")); }

  function listarOri() {
    var tb = $("ori-tbody"); tb.innerHTML = "";
    tb.appendChild(el("tr", null, [el("td", { colspan: "5", class: "muted", text: "Carregando…" })]));
    sb.from("orientacao_clientes").select("id,codigo,nome,nome_social,ocupacao_atual,area,status,criado_em").order("criado_em", { ascending: false }).limit(500).then(function (r) {
      if (r.error) {
        tb.innerHTML = "";
        tb.appendChild(el("tr", null, [el("td", { colspan: "5", class: "error-msg", text: semSql011(r.error) ? "Recurso ainda não ativado: rode o arquivo supabase/sql/011-orientacao-profissional.sql no SQL Editor do Supabase." : erroAmigavel(r.error) })]));
        return;
      }
      oriCache = r.data || []; renderOri();
    });
  }
  function renderOri() {
    var tb = $("ori-tbody"), q = $("of-busca").value.trim().toLowerCase(), st = $("of-status").value;
    var lista = oriCache.filter(function (c) {
      if (st && c.status !== st) return false;
      if (!q) return true;
      return [c.nome, c.nome_social, c.codigo, c.ocupacao_atual, c.area].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = "";
    if (!lista.length) { tb.appendChild(el("tr", null, [el("td", { colspan: "5", class: "muted", text: oriCache.length ? "Ninguém com estes filtros." : "Nenhuma pessoa cadastrada ainda. Use “Nova pessoa”." })])); return; }
    lista.forEach(function (c) {
      var btn = el("button", { type: "button", class: "btn-link", text: nomeExib(c), onclick: function () { abrirCliente(c.id, btn); } });
      tb.appendChild(el("tr", null, [
        el("td", { class: "mono", text: c.codigo }), el("td", null, [btn]),
        el("td", { text: [c.ocupacao_atual, c.area].filter(Boolean).join(" · ") || "—" }),
        el("td", null, [el("span", { class: "pill " + (c.status === "concluido" ? "pill-ok" : c.status === "pausado" ? "" : "pill-cadastro_recebido"), text: ORI_STATUS[c.status] || c.status })]),
        el("td", { text: fmtData(c.criado_em) })
      ]));
    });
  }

  function abrirCliente(id, origin) {
    if ($("drawer").hidden) lastFocus = origin || document.activeElement;
    if (!id) {
      abrirPainel("Nova pessoa", "Orientação de carreira", "Cadastro", function (body) {
        body.appendChild(el("p", { class: "hint", text: "Depois de salvar o cadastro aparecem os testes, as entrevistas e o relatório." }));
        body.appendChild(section("Dados da pessoa", [formCliente(null)]));
      }, lastFocus);
      return;
    }
    Promise.all([
      sb.from("orientacao_clientes").select("*").eq("id", id).single(),
      sb.from("avaliacoes").select(AVAL_COLS).eq("cliente_id", id).order("criado_em", { ascending: false }),
      sb.from("entrevistas_star").select("*").eq("cliente_id", id),
      sb.from("orientacao_roteiros").select("*").eq("cliente_id", id).maybeSingle(),
      sb.from("orientacao_relatorios").select("*").eq("cliente_id", id).maybeSingle(),
      sb.from("documentos_pessoa").select("*").eq("cliente_id", id).order("criado_em", { ascending: false })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      var c = res[0].data;
      c._orient = true; c._refresh = function () { abrirCliente(c.id); };
      sb.rpc("registrar_acesso_orientacao", { p_cliente: c.id, p_acao: "ver_ficha" });
      var docsCli = res[5].error ? null : (res[5].data || []);
      var origemP = c.candidato_origem ? sb.from("candidatos").select("id,codigo,nome_social,nome").eq("id", c.candidato_origem).maybeSingle() : Promise.resolve({ data: null });
      var S = { aval: res[1].error ? [] : (res[1].data || []), stars: res[2].error ? [] : (res[2].data || []), roteiro: res[3].data || null, rel: res[4].data || null };
      origemP.then(function (oq) {
      var orig = oq && oq.data ? oq.data : null;
      abrirPainel(c.codigo, nomeExib(c), [c.ocupacao_atual, c.area].filter(Boolean).join(" · ") || "Orientação de carreira", function (body) {
        body.appendChild(section("Dados da pessoa", [formCliente(c)]));
        if (orig) body.appendChild(section("Origem", [el("p", { class: "small", text: "Veio do Banco de Talentos (" + orig.codigo + " · " + nomeExib(orig) + "). O cadastro de origem continua lá; os testes e as entrevistas da seleção não foram copiados." }),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Abrir cadastro do Banco de Talentos", onclick: function () { abrir(orig.id); } })]));
        else if (c.candidato_origem) body.appendChild(section("Origem", [el("p", { class: "small muted", text: "Veio do Banco de Talentos, cujo cadastro foi excluído." })]));
        body.appendChild(secaoAvaliacoes(c, [], S.aval));
        body.appendChild(section("Entrevista: escolha o roteiro de carreira, o STAR ou os dois", [el("p", { class: "hint", text: "Em cada atendimento você escolhe o que usar. O roteiro de carreira explora trajetória, valores, interesses e contexto; o STAR avalia evidências de como a pessoa age em situações reais." })]));
        body.appendChild(secaoRoteiro(c, S));
        body.appendChild(secaoStar(c, [], S.stars));
        body.appendChild(secaoRelatorio(c, S));
        body.appendChild(secaoDocumentos({ coluna: "cliente_id", pasta: "clientes", id: c.id }, docsCli, function () { abrirCliente(c.id); }));
        if (can("admin")) {
          var del = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Excluir esta pessoa e todos os dados" });
          confirmarDuasVezes(del, "Clique de novo para excluir de vez", function () {
            apagarArquivos("cliente_id", c.id).then(function (r0) {
              if (r0.error) { msg("Não foi possível apagar os documentos. Nada foi excluído.", "err"); return; }
              sb.from("orientacao_clientes").delete().eq("id", c.id).select("id").then(function (r) {
                if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Não foi possível excluir.", "err"); return; }
                msg("Cadastro excluído, com testes, entrevistas, relatório e documentos.", "ok"); fecharDrawer(); listarOri();
              });
            });
          });
          body.appendChild(section("Exclusão", [el("p", { class: "hint", text: "Apaga de forma definitiva o cadastro, os links, os resultados dos testes, as entrevistas, o relatório e os documentos desta pessoa. Use quando ela pedir a exclusão ou ao fim do prazo combinado de guarda." }), del]));
        }
      }, lastFocus);
      });
    });
  }

  function formCliente(c) {
    var f = buildForm([
      { k: "nome", label: "Nome completo", required: true, max: 160 },
      { k: "nome_social", label: "Nome social (se houver)", max: 160 },
      { k: "email", label: "E-mail", type: "email", max: 200 },
      { k: "telefone", label: "Telefone / WhatsApp", max: 30, inputmode: "tel" },
      { k: "cidade", label: "Cidade", max: 120 },
      { k: "uf", label: "UF", type: "select", options: UFS.map(function (u) { return [u, u]; }), placeholder: "—" },
      { k: "ocupacao_atual", label: "Ocupação ou situação atual", max: 160, hint: "Ex.: analista administrativa; em transição; estudante de Psicologia." },
      { k: "area", label: "Área de atuação ou interesse", type: "select", options: AREAS.map(function (a) { return [a, a]; }), placeholder: "—" },
      { k: "escolaridade", label: "Escolaridade", max: 120 },
      { k: "status", label: "Situação do atendimento", type: "select", options: opts(ORI_STATUS), required: true },
      { k: "objetivo", label: "Objetivo da pessoa com a orientação", type: "textarea", max: 3000, rows: 3, full: true },
      { k: "observacoes", label: "Observações internas", type: "textarea", max: 3000, rows: 3, full: true, hint: "Uso interno. Não vai para o relatório." },
      { k: "autorizacao_forma", label: "Como a pessoa autorizou o atendimento e o uso dos dados", required: true, max: 200, full: true, hint: "Ex.: contrato assinado em 27/10; autorização por WhatsApp. Registre só a forma, não o conteúdo da conversa." },
      { k: "autorizacao_em", label: "Data da autorização", type: "date", required: true, def: hojeISO() }
    ], c ? c : { status: "em_atendimento" }, "oc");
    var err = el("p", { class: "error-msg", role: "alert" });
    var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: c ? "Salvar dados" : "Cadastrar pessoa" });
    var form = el("form", { class: "admin-form", novalidate: true }, [f.node, err, can("editar") ? el("div", { class: "btn-row" }, [btn]) : null]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = "";
      var falta = f.faltando();
      if (falta.length) { err.textContent = "Preencha: " + falta.join(", ") + "."; return; }
      var v = f.values(); v.status = v.status || "em_atendimento";
      btn.disabled = true;
      var q = c ? sb.from("orientacao_clientes").update(v).eq("id", c.id) : sb.from("orientacao_clientes").insert(v);
      q.select("id").single().then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = semSql011(r.error) ? "Rode antes o arquivo supabase/sql/011-orientacao-profissional.sql no Supabase." : erroAmigavel(r.error); return; }
        msg(c ? "Dados salvos." : "Pessoa cadastrada. Agora é possível enviar os testes e registrar as entrevistas.", "ok");
        listarOri();
        if (!c) abrirCliente(r.data.id); else abrirCliente(c.id);
      });
    });
    return form;
  }

  /* ---------- roteiro de entrevista de carreira */
  function secaoRoteiro(c, S) {
    var T = TX.carreira || { blocos: [], como: "" };
    var salvos = {};
    ((S.roteiro && S.roteiro.blocos) || []).forEach(function (x) { salvos[x.id] = x.notas; });
    var cab = buildForm([
      { k: "entrevistador", label: "Entrevistador(a)", max: 160, def: me && me.nome },
      { k: "data_sessao", label: "Data do atendimento", type: "date" }
    ], S.roteiro || { entrevistador: me && me.nome }, "ro");
    var blocos = T.blocos.map(function (b) {
      var ta = el("textarea", { id: "ro-" + b.id, maxlength: "2000", rows: "4", "aria-label": "Anotações: " + b.nome });
      if (salvos[b.id]) ta.value = salvos[b.id];
      if (!can("editar")) ta.disabled = true;
      var node = el("details", { class: "star-comp", open: salvos[b.id] ? true : null }, [el("summary", { text: b.nome + (salvos[b.id] ? " · com anotações" : "") }),
        el("ul", { class: "small muted" }, b.perguntas.map(function (p) { return el("li", { text: p }); })), el("div", { class: "field full" }, [el("label", { for: "ro-" + b.id, text: "Anotações" }), ta])]);
      return { id: b.id, ta: ta, node: node };
    });
    var fim = buildForm([{ k: "sintese", label: "Síntese da conversa", type: "textarea", max: 4000, rows: 5, full: true, hint: "Hipóteses sobre valores, interesses e caminhos. Vai ser usada por você para montar o relatório; não é copiada sozinha." }], S.roteiro, "rs");
    var info = el("span", { class: "small muted", role: "status", text: S.roteiro ? " Salvo em " + fmtDataHora(S.roteiro.atualizado_em) : "" });
    var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Salvar roteiro" });
    var form = el("form", { class: "admin-form", novalidate: true }, [
      el("details", { class: "star-rubrica" }, [el("summary", { text: "Como usar o roteiro" }), el("p", { class: "small", text: T.como })]),
      cab.node, el("div", { class: "star-comps" }, blocos.map(function (b) { return b.node; })), fim.node, can("editar") ? el("div", { class: "btn-row" }, [btn, info]) : null]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); btn.disabled = true;
      var v = Object.assign(cab.values(), fim.values(), { blocos: blocos.map(function (b) { return { id: b.id, notas: b.ta.value.trim() }; }).filter(function (x) { return x.notas; }) });
      var q = S.roteiro ? sb.from("orientacao_roteiros").update(v).eq("id", S.roteiro.id) : sb.from("orientacao_roteiros").insert(Object.assign({ cliente_id: c.id }, v));
      q.select("*").single().then(function (r) {
        btn.disabled = false;
        if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
        S.roteiro = r.data; info.textContent = " Salvo em " + fmtDataHora(r.data.atualizado_em); msg("Roteiro salvo.", "ok");
      });
    });
    return section("Roteiro de entrevista de carreira", [el("p", { class: "hint", text: "Anotações de uso interno. Elas aparecem só na versão interna do relatório." }), form]);
  }

  /* ---------- relatório da pessoa */
  function linkResultado(rel) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "resultado.html#t=" + rel.token; }

  function dadosRelatorio(c, v, R, incluir) {
    return Object.assign({}, v, { nome: nomeExib(c), data: new Date().toISOString(),
      disc: incluir && R.disc ? R.disc.soma : null, bigfive: incluir && R.b5 ? R.b5.soma : null });
  }
  function blocosInternos(c, S, R) {
    var T = TX.carreira || { blocos: [] }, ST = TX.star || { competencias: [], notas: {} }, out = [];
    function h(t) { return el("h2", { text: t }); }
    function tx(t) { return el("p", { class: "lv-texto", text: t }); }
    out.push(el("p", { class: "ori-interno", text: "Versão interna, completa. Contém anotações e leituras de uso exclusivo da equipe. Não entregue esta versão à pessoa." }));
    var r = S.roteiro;
    if (r && ((r.blocos || []).length || r.sintese)) {
      out.push(h("Anotações do roteiro de carreira"));
      var cab = [r.entrevistador ? "Entrevistador(a): " + r.entrevistador : null, r.data_sessao ? "Data: " + fmtData(r.data_sessao) : null].filter(Boolean);
      if (cab.length) out.push(tx(cab.join(" · ")));
      (r.blocos || []).forEach(function (x) {
        var b = T.blocos.filter(function (k) { return k.id === x.id; })[0];
        if (b) { out.push(el("h3", { text: b.nome })); out.push(tx(x.notas)); }
      });
      if (r.sintese) { out.push(el("h3", { text: "Síntese da conversa" })); out.push(tx(r.sintese)); }
    }
    if (R.star) {
      var rs = R.star, sv = {};
      (rs.competencias || []).forEach(function (x) { sv[x.id] = x; });
      out.push(h("Entrevista por competências (STAR)"));
      var linhas = ST.competencias.filter(function (k) { return sv[k.id] && sv[k.id].nota; }).map(function (k) { var x = sv[k.id]; return [k.nome, x.nota + " · " + ST.notas[x.nota][0], x.justificativa || "—"]; });
      if (linhas.length) out.push(tabelaSimples(["Competência", "Nota", "Justificativa"], linhas));
      if (rs.pontos_fortes) { out.push(el("h3", { text: "Pontos fortes evidenciados" })); out.push(tx(rs.pontos_fortes)); }
      if (rs.pontos_aprofundar) { out.push(el("h3", { text: "Pontos a aprofundar" })); out.push(tx(rs.pontos_aprofundar)); }
      if (rs.sintese_requisitos) { out.push(el("h3", { text: "Síntese" })); out.push(tx(rs.sintese_requisitos)); }
    }
    if (R.perfil || R.enea || R.disc || R.b5) out.push(h("Resultados dos testes, com leituras de apoio"));
    if (R.perfil) out.push(el("h3", { text: "Perfil comportamental e preferência cerebral" }), blocoPerfil(R.perfil), blocoCerebral(R.perfil));
    if (R.enea) out.push(el("h3", { text: "Eneagrama (itens por tipo)" }), blocoEnea(R.enea));
    if (R.disc) { out.push(el("h3", { text: "DISC exploratório" })); nodesDisc(R.disc).forEach(function (n) { out.push(n); }); }
    if (R.b5) { out.push(el("h3", { text: "Big Five exploratório" })); nodesB5(R.b5).forEach(function (n) { out.push(n); }); }
    return out;
  }

  /** Janela de documento (mesma estrutura do laudo, para a impressão funcionar igual). */
  function abrirDocumento(art, rotulo) {
    var antigo = $("laudo-view"); if (antigo) antigo.remove();
    var volta = document.activeElement;
    var fechar = function () { view.remove(); document.body.classList.remove("laudo-aberto"); document.removeEventListener("keydown", esc, true); if (volta && volta.focus) volta.focus(); };
    var esc = function (e) { if (e.key === "Escape") { e.stopPropagation(); fechar(); } };
    var btnFechar = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Fechar", onclick: fechar });
    var view = el("div", { id: "laudo-view", class: "laudo-view", role: "dialog", "aria-modal": "true", "aria-label": rotulo }, [
      el("div", { class: "lv-toolbar" }, [
        el("span", { class: "small", text: "Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão." }),
        el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Imprimir / salvar PDF", onclick: function () { window.print(); } }), btnFechar
      ]), art
    ]);
    document.body.appendChild(view);
    document.body.classList.add("laudo-aberto");
    document.addEventListener("keydown", esc, true);
    btnFechar.focus();
  }

  function secaoRelatorio(c, S) {
    var box = el("div", { class: "laudo-box" });
    var sec = section("Relatório da pessoa (com plano de 90 dias)", [el("p", { class: "hint", text: "Escreva para a pessoa: linguagem simples, sem jargão e sem rótulos fechados. O botão “Preencher com base nos testes” sugere a síntese, os pontos fortes e os pontos a desenvolver para você revisar. Você escolhe se entrega em PDF, por uma página com link, ou os dois." }), box]);
    var rel = S.rel;
    var f = buildForm([
      { k: "objetivo", label: "O que a pessoa busca", type: "textarea", max: 1000, rows: 3, full: true, def: c.objetivo || "" },
      { k: "sintese", label: "O que observamos juntos (síntese)", type: "textarea", max: 8000, rows: 9, full: true },
      { k: "pontos_fortes", label: "Pontos fortes", type: "textarea", max: 3000, rows: 5 },
      { k: "pontos_desenvolver", label: "Pontos a desenvolver", type: "textarea", max: 3000, rows: 5 },
      { k: "areas_exploracao", label: "Caminhos para explorar", type: "textarea", max: 3000, rows: 5, full: true, hint: "Áreas, cargos ou formações para investigar, com o porquê. São hipóteses, não indicações definitivas." },
      { k: "plano_30", label: "Plano: primeiros 30 dias", type: "textarea", max: 2000, rows: 5, hint: "Ações pequenas, concretas e com prazo." },
      { k: "plano_60", label: "Plano: de 31 a 60 dias", type: "textarea", max: 2000, rows: 5 },
      { k: "plano_90", label: "Plano: de 61 a 90 dias", type: "textarea", max: 2000, rows: 5 },
      { k: "proximos_passos", label: "Próximos passos e combinados", type: "textarea", max: 2000, rows: 3, full: true, hint: "Ex.: próximo encontro, o que a pessoa vai trazer, como acompanhar o plano." },
      { k: "responsavel", label: "Assinatura (nome e registro)", max: 160, def: me && me.nome, hint: "Aparece só no PDF." }
    ], rel || { responsavel: me && me.nome, objetivo: c.objetivo || "" }, "or");
    var cb = el("input", { type: "checkbox", id: "or-testes" });
    cb.checked = rel ? rel.incluir_testes !== false : true;
    if (!can("editar")) cb.disabled = true;
    f.node.appendChild(el("div", { class: "field full" }, [el("label", { class: "check-inline", for: "or-testes" }, [cb, " Mostrar as barras do DISC e do Big Five no relatório e na página da pessoa"])]));

    var btnSug = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Preencher com base nos testes" });
    var preencher = function () {
      var a = analise(c, resultados(c, S.aval, null, S.stars), "orient");
      if (!a.sintese) { msg("Ainda não há testes nem entrevista STAR para gerar a sugestão.", "err"); return; }
      f.inputs.sintese.value = a.sintese; f.inputs.pontos_fortes.value = a.fortes; f.inputs.pontos_desenvolver.value = a.desenvolver;
      msg("Texto sugerido preenchido. Revise, simplifique e ajuste à conversa antes de salvar.", "ok");
    };
    if (rel && (rel.sintese || rel.pontos_fortes)) confirmarDuasVezes(btnSug, "Clique de novo: substitui a síntese e os pontos", preencher);
    else btnSug.addEventListener("click", preencher);

    var info = el("span", { class: "small muted", role: "status", text: rel ? " Salvo em " + fmtDataHora(rel.atualizado_em) : "" });
    var btnSalvar = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Salvar relatório" });
    function montarDados() { var v = f.values(); return { v: v, R: resultados(c, S.aval, null, S.stars) }; }
    var btnPdf = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Ver relatório da pessoa (PDF)", onclick: function () {
      var m = montarDados(); sb.rpc("registrar_acesso_orientacao", { p_cliente: c.id, p_acao: "ver_relatorio" });
      abrirDocumento(PRH_ORI.render(dadosRelatorio(c, m.v, m.R, cb.checked), { assinatura: true }), "Relatório de " + nomeExib(c));
    } });
    var btnInt = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Ver versão interna (completa)", onclick: function () {
      var m = montarDados(); sb.rpc("registrar_acesso_orientacao", { p_cliente: c.id, p_acao: "ver_relatorio" });
      var art = PRH_ORI.render(dadosRelatorio(c, m.v, m.R, cb.checked), { assinatura: true });
      var extra = el("div", { class: "ori-interno-bloco" }, blocosInternos(c, S, m.R));
      art.appendChild(extra);
      abrirDocumento(art, "Versão interna: " + nomeExib(c));
    } });
    var form = el("form", { class: "admin-form", novalidate: true }, [f.node, el("div", { class: "btn-row" }, [btnSug, can("editar") ? btnSalvar : null, btnPdf, btnInt, info])]);
    form.addEventListener("submit", function (e) {
      e.preventDefault(); btnSalvar.disabled = true;
      var v = f.values(); v.incluir_testes = cb.checked;
      var q = rel ? sb.from("orientacao_relatorios").update(v).eq("id", rel.id) : sb.from("orientacao_relatorios").insert(Object.assign({ cliente_id: c.id }, v));
      q.select("*").single().then(function (r) {
        btnSalvar.disabled = false;
        if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
        rel = S.rel = r.data;
        info.textContent = " Salvo em " + fmtDataHora(r.data.atualizado_em);
        msg(rel.liberado_em ? "Relatório salvo. A página da pessoa já mostra esta versão." : "Relatório salvo.", "ok");
        liberacao();
      });
    });

    // Página de resultado (link para a pessoa)
    var lib = el("div", { class: "laudo-box" });
    function liberacao() {
      lib.innerHTML = "";
      lib.appendChild(el("h4", { text: "Página de resultado para a pessoa" }));
      if (!rel) { lib.appendChild(el("p", { class: "small muted", text: "Salve o relatório para poder liberar a página." })); return; }
      var ativo = rel.token && rel.liberado_em && new Date(rel.expira_em) > new Date();
      var vencido = rel.token && rel.liberado_em && !ativo;
      lib.appendChild(el("p", { class: "small", text: ativo ? "Liberada até " + fmtData(rel.expira_em) + ". " + (rel.aberto_em ? "A pessoa abriu em " + fmtDataHora(rel.aberto_em) + "." : "Ainda não foi aberta.") + " A página sempre mostra a última versão salva."
        : vencido ? "O prazo da página terminou em " + fmtData(rel.expira_em) + ". Gere um novo link se quiser reabrir." : "Não liberada. Enquanto isso, a pessoa não tem acesso online ao relatório." }));
      if (!can("editar")) return;
      var aviso = el("span", { class: "small muted", role: "status" });
      var prazo = el("select", { "aria-label": "Prazo da página" }, [["7", "7 dias"], ["15", "15 dias"], ["30", "30 dias"], ["60", "60 dias"]].map(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === "30") op.selected = true; return op; }));
      var acoes = el("div", { class: "inline aval-acoes" });
      var gerar = el("button", { type: "button", class: "btn btn-primary btn-sm", text: ativo ? "Gerar novo link (invalida o anterior)" : "Liberar página de resultado" });
      gerar.addEventListener("click", function () {
        gerar.disabled = true;
        sb.rpc("orientacao_liberar", { p_cliente: c.id, p_dias: Number(prazo.value) }).then(function (r) {
          if (r.error) { gerar.disabled = false; msg(/salve_o_relatorio/.test(r.error.message || "") ? "Salve o relatório antes de liberar." : erroAmigavel(r.error), "err"); return; }
          sb.from("orientacao_relatorios").select("*").eq("cliente_id", c.id).single().then(function (q) {
            if (!q.error) rel = S.rel = q.data;
            msg("Página liberada. Copie o link ou a mensagem para enviar.", "ok"); liberacao();
          });
        });
      });
      acoes.appendChild(el("label", { class: "small", for: "or-prazo" }, ["Prazo: "])); prazo.id = "or-prazo"; acoes.appendChild(prazo); acoes.appendChild(gerar);
      lib.appendChild(acoes);
      if (ativo) {
        var msgTxt = "Olá, " + primeiroNome(nomeExib(c)) + "! Aqui é " + primeiroNome(me && me.nome) + ", da Permanência RH.\n\nO seu relatório de orientação de carreira está pronto. Você pode ver e salvar em PDF neste link:\n" + linkResultado(rel) + "\n\nEle fica disponível até " + fmtData(rel.expira_em) + ". Vamos conversar sobre ele no nosso próximo encontro. Qualquer dúvida, é só me chamar.";
        var a2 = el("div", { class: "inline aval-acoes" }, [
          el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar mensagem com o link", onclick: function () { copiar(msgTxt, aviso); } }),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar só o link", onclick: function () { copiar(linkResultado(rel), aviso); } })
        ]);
        var wa = foneWa(c.telefone);
        if (wa) a2.appendChild(el("a", { class: "btn btn-primary btn-sm", target: "_blank", rel: "noopener noreferrer", href: "https://wa.me/" + wa + "?text=" + encodeURIComponent(msgTxt), text: "Enviar pelo WhatsApp" }));
        var rev = el("button", { type: "button", class: "btn-link small", text: "Fechar a página agora" });
        confirmarDuasVezes(rev, "Clique de novo para fechar", function () {
          sb.rpc("orientacao_revogar", { p_cliente: c.id }).then(function (r) {
            if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
            rel = S.rel = Object.assign({}, rel, { token: null, liberado_em: null, expira_em: null });
            msg("Página fechada. O link deixou de funcionar.", "ok"); liberacao();
          });
        });
        a2.appendChild(rev); a2.appendChild(aviso);
        lib.appendChild(a2);
      } else lib.appendChild(aviso);
    }
    liberacao();
    box.appendChild(form); box.appendChild(lib);
    return sec;
  }

  /* ============================================================ AGENDA */
  var COMP_TIPOS = [["entrevista", "Entrevista"], ["reuniao", "Reunião"], ["devolutiva", "Devolutiva"], ["aplicacao_teste", "Aplicação de testes"], ["outro", "Outro"]];
  var COMP_TIPO = {}; COMP_TIPOS.forEach(function (t) { COMP_TIPO[t[0]] = t[1]; });
  var COMP_STATUS = [["agendado", "Agendado"], ["realizado", "Realizado"], ["faltou", "Não compareceu"], ["cancelado", "Cancelado"]];
  var COMP_ST = {}; COMP_STATUS.forEach(function (t) { COMP_ST[t[0]] = t[1]; });
  var MODALIDADES = [["presencial", "Presencial"], ["online", "Online (vídeo)"], ["telefone", "Telefone"]];
  var LEMBRETES = [["2880", "2 dias antes"], ["1440", "1 dia antes"], ["120", "2 horas antes"], ["60", "1 hora antes"], ["30", "30 minutos antes"], ["15", "15 minutos antes"], ["5", "5 minutos antes"]];
  var DURACOES = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 hora"], ["90", "1h30"], ["120", "2 horas"], ["180", "3 horas"], ["240", "4 horas"]];
  var COMP_SEL = "*, candidatos(nome,nome_social,codigo,telefone,email), empresas(nome,contato_nome,contato_telefone,contato_email), vagas(codigo,titulo)";
  var agSemana = inicioSemana(new Date());

  function inicioSemana(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }
  function addDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function isoLocal(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function diaLongo(d) { return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }); }
  function utcIcs(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function icsEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function icsLinha(k, v) { var l = k + ":" + icsEsc(v), out = []; while (l.length > 70) { out.push(l.slice(0, 70)); l = l.slice(70); } out.push(l); return out.join("\r\n ") + "\r\n"; }
  function descComp(c) {
    return [COMP_TIPO[c.tipo] + " · " + ({ online: "online", telefone: "por telefone" }[c.modalidade] || "presencial"),
      c.candidatos ? "Candidato: " + nomeExib(c.candidatos) + (c.candidatos.telefone ? " · " + c.candidatos.telefone : "") : null,
      c.vagas ? "Vaga: " + c.vagas.titulo : null, c.empresas ? "Empresa: " + c.empresas.nome : null, c.observacoes].filter(Boolean).join("\n");
  }
  function icsEvento(c) {
    var s = "BEGIN:VEVENT\r\n" + "UID:" + c.id + "@permanenciarh.com.br\r\n" + "DTSTAMP:" + utcIcs(new Date()) + "\r\n" +
      "DTSTART:" + utcIcs(new Date(c.inicio)) + "\r\n" + "DTEND:" + utcIcs(new Date(c.fim)) + "\r\n" +
      icsLinha("SUMMARY", c.titulo) + (c.local ? icsLinha("LOCATION", c.local) : "") + icsLinha("DESCRIPTION", descComp(c)) +
      "STATUS:" + (c.status === "cancelado" ? "CANCELLED" : "CONFIRMED") + "\r\n";
    if (c.status === "agendado") (c.lembretes || []).forEach(function (m) { s += "BEGIN:VALARM\r\nACTION:DISPLAY\r\n" + icsLinha("DESCRIPTION", c.titulo) + "TRIGGER:-PT" + m + "M\r\nEND:VALARM\r\n"; });
    return s + "END:VEVENT\r\n";
  }
  function baixarIcs(lista, nome) {
    var txt = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Permanencia RH//Painel//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n" + lista.map(icsEvento).join("") + "END:VCALENDAR\r\n";
    var url = URL.createObjectURL(new Blob([txt], { type: "text/calendar;charset=utf-8" }));
    var a = el("a", { href: url, download: nome }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function linkGoogle(c) {
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(c.titulo) +
      "&dates=" + utcIcs(new Date(c.inicio)) + "/" + utcIcs(new Date(c.fim)) + "&details=" + encodeURIComponent(descComp(c)) + (c.local ? "&location=" + encodeURIComponent(c.local) : "");
  }
  function msgConfirmacao(c) {
    var d = new Date(c.inicio), quando = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) + ", às " + hhmm(d);
    var onde = c.modalidade === "online" ? (c.local ? "O link para entrar é: " + c.local : "Vou te mandar o link um pouco antes.")
      : c.modalidade === "telefone" ? "Vou te ligar neste número." : (c.local ? "Endereço: " + c.local : "");
    var eu = primeiroNome(me && me.nome);
    if (c.candidatos) {
      var o = { entrevista: "sua entrevista", devolutiva: "nossa conversa de devolutiva", aplicacao_teste: "a aplicação dos testes", reuniao: "nossa conversa", outro: "nosso compromisso" }[c.tipo];
      return "Olá, " + primeiroNome(nomeExib(c.candidatos)) + "! Aqui é " + eu + ", da Permanência RH.\n\nConfirmando " + o + (c.vagas ? " para a vaga " + c.vagas.titulo : "") + " na " + quando + ". " + onde +
        "\n\nSe tiver algum imprevisto, me avise por aqui. Até lá!";
    }
    var nome = c.empresas && c.empresas.contato_nome ? primeiroNome(c.empresas.contato_nome) : "";
    return "Olá" + (nome ? ", " + nome : "") + "! Aqui é " + eu + ", da Permanência RH.\n\nConfirmando nossa " + (c.tipo === "reuniao" ? "reunião" : (COMP_TIPO[c.tipo] || "conversa").toLowerCase()) + " na " + quando + ". " + onde + "\n\nAté lá!";
  }
  function acoesComp(c) {
    var box = el("div", { class: "inline comp-acoes" });
    box.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Adicionar ao celular", title: "Baixa o arquivo .ics (iPhone, Android, Outlook) já com os lembretes", onclick: function () { baixarIcs([c], "compromisso-" + isoLocal(new Date(c.inicio)) + ".ics"); } }));
    box.appendChild(el("a", { class: "btn btn-secondary btn-sm", href: linkGoogle(c), target: "_blank", rel: "noopener noreferrer", text: "Google Agenda" }));
    var tel = c.candidatos ? c.candidatos.telefone : c.empresas ? c.empresas.contato_telefone : null, wa = foneWa(tel);
    if (wa && c.status === "agendado") box.appendChild(el("a", { class: "btn btn-whats btn-sm", href: "https://wa.me/" + wa, target: "_blank", rel: "noopener noreferrer", text: "Confirmar pelo WhatsApp",
      onclick: function (ev) { ev.currentTarget.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(msgConfirmacao(c)); } }));
    return box;
  }

  function listarAgenda() {
    var ini = agSemana, fim = addDias(agSemana, 7);
    $("ag-periodo").textContent = ini.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " a " + addDias(fim, -1).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    var box = $("ag-dias"); box.innerHTML = ""; box.appendChild(el("p", { class: "muted", text: "Carregando…" }));
    var q = sb.from("compromissos").select(COMP_SEL).gte("inicio", ini.toISOString()).lt("inicio", fim.toISOString()).order("inicio");
    if ($("ag-tipo").value) q = q.eq("tipo", $("ag-tipo").value);
    if (!$("ag-cancelados").checked) q = q.neq("status", "cancelado");
    q.then(function (r) {
      box.innerHTML = "";
      if (r.error) { box.appendChild(el("p", { class: "error-msg", text: /compromissos/.test(r.error.message || "") ? "Agenda ainda não ativada: rode o arquivo supabase/sql/007-agenda-e-financeiro.sql no Supabase." : erroAmigavel(r.error) })); return; }
      agCache = r.data || [];
      var hoje = isoLocal(new Date());
      for (var i = 0; i < 7; i++) {
        var dia = addDias(ini, i), key = isoLocal(dia);
        var itens = agCache.filter(function (c) { return isoLocal(new Date(c.inicio)) === key; });
        var cab = el("div", { class: "ag-dia-cab" }, [el("h3", { text: diaLongo(dia) + (key === hoje ? " · hoje" : "") }),
          el("button", { type: "button", class: "btn-link small", text: "+ adicionar", "aria-label": "Novo compromisso em " + diaLongo(dia), onclick: (function (k) { return function (e) { abrirCompromisso(null, { data: k }, e.currentTarget); }; })(key) })]);
        var ul = el("ul", { class: "ag-itens" });
        if (!itens.length) ul.appendChild(el("li", { class: "muted small ag-livre", text: "Livre" }));
        itens.forEach(function (c) { ul.appendChild(itemComp(c)); });
        box.appendChild(el("section", { class: "ag-dia" + (key === hoje ? " is-hoje" : "") + (key < hoje ? " is-passado" : "") }, [cab, ul]));
      }
    });
  }
  var agCache = [];
  function itemComp(c) {
    var ini = new Date(c.inicio), fim = new Date(c.fim);
    var vinc = [];
    if (c.candidatos) vinc.push(el("button", { type: "button", class: "btn-link", text: nomeExib(c.candidatos), onclick: function (e) { abrir(c.candidato_id, e.currentTarget); } }));
    if (c.vagas) vinc.push(el("span", { class: "muted", text: " · " + c.vagas.codigo }));
    if (c.empresas) vinc.push(el("button", { type: "button", class: "btn-link", text: (c.candidatos ? " · " : "") + c.empresas.nome, onclick: function (e) { abrirEmpresa(c.empresa_id, e.currentTarget); } }));
    var local = c.local ? (/^https?:\/\//i.test(c.local) ? safeLink(c.local, "Entrar na chamada") : el("span", { text: c.local })) : null;
    var st = el("select", { "aria-label": "Situação de " + c.titulo, class: "ag-status" });
    COMP_STATUS.forEach(function (s) { var o = el("option", { value: s[0], text: s[1] }); if (s[0] === c.status) o.selected = true; st.appendChild(o); });
    st.addEventListener("change", function () {
      sb.from("compromissos").update({ status: st.value }).eq("id", c.id).select("id").then(function (r) {
        if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Seu papel não permite alterar.", "err"); st.value = c.status; return; }
        c.status = st.value; msg("Situação atualizada.", "ok"); listarAgenda();
      });
    });
    return el("li", { class: "ag-item ag-" + c.tipo + " st-" + c.status }, [
      el("div", { class: "ag-hora" }, [el("strong", { text: hhmm(ini) }), el("span", { class: "muted small", text: hhmm(fim) })]),
      el("div", { class: "ag-corpo" }, [
        el("div", null, [el("span", { class: "pill pill-ag", text: COMP_TIPO[c.tipo] }), " ",
          el("button", { type: "button", class: "btn-link ag-titulo", text: c.titulo, onclick: function (e) { abrirCompromisso(c.id, null, e.currentTarget); } })]),
        vinc.length ? el("div", { class: "small" }, vinc) : null,
        el("div", { class: "small muted" }, [({ online: "Online", telefone: "Telefone" }[c.modalidade] || "Presencial"), local ? " · " : "", local]),
        el("div", { class: "inline" }, [st, acoesComp(c)])
      ])
    ]);
  }

  /** Abre o formulário de compromisso. preset: {data, candidato:{id,nome,codigo}, empresa_id, vaga_id, tipo} */
  function abrirCompromisso(id, preset, origin) {
    preset = preset || {};
    Promise.all([
      id ? sb.from("compromissos").select(COMP_SEL).eq("id", id).single() : Promise.resolve({ data: null }),
      sb.from("empresas").select("id,nome").order("nome").limit(1000),
      sb.from("vagas").select("id,codigo,titulo,status").in("status", ["aberta", "pausada", "rascunho"]).order("criado_em", { ascending: false }).limit(200)
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      var c = res[0].data, emps = res[1].data || [], vagas = res[2].data || [];
      if (c && c.vaga_id && !vagas.some(function (v) { return v.id === c.vaga_id; }) && c.vagas) vagas.unshift({ id: c.vaga_id, codigo: c.vagas.codigo, titulo: c.vagas.titulo });
      var ini = c ? new Date(c.inicio) : null;
      var base = c ? { tipo: c.tipo, titulo: c.titulo, data: isoLocal(ini), hora: hhmm(ini), duracao: String(Math.round((new Date(c.fim) - ini) / 60000)), modalidade: c.modalidade, local: c.local,
          empresa_id: c.empresa_id, vaga_id: c.vaga_id, lembretes: (c.lembretes || []).map(String), status: c.status, observacoes: c.observacoes }
        : { tipo: preset.tipo || (preset.empresa_id && !preset.candidato ? "reuniao" : "entrevista"), data: preset.data || isoLocal(new Date()), hora: "09:00", duracao: "60", modalidade: "presencial",
          empresa_id: preset.empresa_id || null, vaga_id: preset.vaga_id || null, lembretes: ["1440", "60"], status: "agendado" };
      if (!DURACOES.some(function (d) { return d[0] === base.duracao; })) DURACOES.push([base.duracao, base.duracao + " min"]);
      var cand = c && c.candidatos ? { id: c.candidato_id, nome: nomeExib(c.candidatos), codigo: c.candidatos.codigo } : preset.candidato || null;

      abrirPainel(c ? COMP_TIPO[c.tipo] : "Novo compromisso", c ? c.titulo : "Agendar", c ? diaLongo(ini) + " · " + hhmm(ini) : "Entrevista, reunião, devolutiva ou aplicação de testes", function (body) {
        if (c) body.appendChild(section("Lembretes no celular", [acoesComp(c), el("p", { class: "hint", text: "“Adicionar ao celular” baixa o compromisso com os lembretes escolhidos. Para tudo entrar sozinho na agenda do celular, use “Receber no celular” na aba Agenda." })]));
        var f = buildForm([
          { k: "tipo", label: "Tipo", type: "select", required: true, options: COMP_TIPOS },
          { k: "status", label: "Situação", type: "select", required: true, options: COMP_STATUS },
          { k: "titulo", label: "Título", required: true, max: 160, full: true, hint: "Preenchido sozinho a partir do tipo e de quem participa. Pode editar." },
          { k: "data", label: "Data", type: "date", required: true },
          { k: "hora", label: "Horário", type: "time", required: true },
          { k: "duracao", label: "Duração", type: "select", required: true, options: DURACOES },
          { k: "modalidade", label: "Modalidade", type: "select", required: true, options: MODALIDADES },
          { k: "local", label: "Endereço, link da chamada ou telefone", max: 300, full: true },
          { k: "empresa_id", label: "Empresa", type: "select", options: emps.map(function (e) { return [e.id, e.nome]; }), placeholder: "Nenhuma" },
          { k: "vaga_id", label: "Vaga", type: "select", options: vagas.map(function (v) { return [v.id, v.codigo + " · " + v.titulo]; }), placeholder: "Nenhuma" },
          { k: "lembretes", label: "Lembretes no celular", type: "checks", options: LEMBRETES, full: true },
          { k: "observacoes", label: "Observações (aparecem no celular)", type: "textarea", max: 2000, full: true }
        ], base, "cp");

        // candidato: pelo código do banco (ou já vindo da ficha)
        var candInfo = el("span", { class: "small", role: "status", text: cand ? cand.nome + " (" + cand.codigo + ")" : "Nenhum" });
        var candCod = el("input", { type: "text", id: "cp-cand", placeholder: "PRH-0000-XXXXXX", autocomplete: "off", value: cand ? cand.codigo : null });
        var candErr = el("span", { class: "error-msg" });
        function buscarCand() {
          var cod = candCod.value.trim().toUpperCase();
          candErr.textContent = "";
          if (!cod) { cand = null; candInfo.textContent = "Nenhum"; sugerirTitulo(); return; }
          if (cand && cand.codigo === cod) return;
          sb.from("candidatos").select("id,nome,nome_social,codigo,telefone").eq("codigo", cod).is("excluido_em", null).maybeSingle().then(function (r) {
            if (r.data) r.data.nome = nomeExib(r.data);
            if (!r.data) { cand = null; candInfo.textContent = "Nenhum"; candErr.textContent = "Código não encontrado."; return; }
            cand = r.data; candInfo.textContent = cand.nome + " (" + cand.codigo + ")"; sugerirTitulo();
          });
        }
        candCod.addEventListener("change", buscarCand);
        f.node.insertBefore(el("div", { class: "field full" }, [el("label", { for: "cp-cand", text: "Candidato (código do banco)" }), el("div", { class: "inline" }, [candCod, candInfo]), candErr]), f.inputs.empresa_id.closest(".field"));
        if (!c) f.inputs.status.closest(".field").hidden = true;

        var tituloManual = !!c;
        f.inputs.titulo.addEventListener("input", function () { tituloManual = true; });
        function sugerirTitulo() {
          if (tituloManual) return;
          var tipo = COMP_TIPO[f.inputs.tipo.value], emp = emps.filter(function (e) { return e.id === f.inputs.empresa_id.value; })[0];
          var vg = vagas.filter(function (v) { return v.id === f.inputs.vaga_id.value; })[0];
          var quem = cand ? cand.nome.split(/\s+/).slice(0, 2).join(" ") : emp ? emp.nome : "";
          f.inputs.titulo.value = tipo + (quem ? ": " + quem : "") + (vg && cand ? " · " + vg.titulo : "");
        }
        ["tipo", "empresa_id", "vaga_id"].forEach(function (k) { f.inputs[k].addEventListener("change", sugerirTitulo); });
        if (!c) sugerirTitulo();

        var err = el("p", { class: "error-msg", role: "alert" });
        var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: c ? "Salvar alterações" : "Agendar" });
        var aviso = false;
        var form = el("form", { class: "admin-form", novalidate: true }, [f.node, err, el("div", { class: "btn-row" }, [btn])]);
        form.addEventListener("submit", function (e) {
          e.preventDefault(); err.textContent = "";
          var falta = f.faltando(); if (falta.length) { err.textContent = "Preencha: " + falta.join(", ") + "."; return; }
          if (candCod.value.trim() && !cand) { err.textContent = "Confira o código do candidato."; return; }
          var v = f.values();
          var inicio = new Date(v.data + "T" + v.hora), fim = new Date(inicio.getTime() + Number(v.duracao) * 60000);
          if (isNaN(inicio)) { err.textContent = "Data ou horário inválido."; return; }
          var dados = { tipo: v.tipo, titulo: v.titulo, inicio: inicio.toISOString(), fim: fim.toISOString(), modalidade: v.modalidade, local: v.local, empresa_id: v.empresa_id, vaga_id: v.vaga_id,
            candidato_id: cand ? cand.id : null, lembretes: (v.lembretes || []).map(Number), observacoes: v.observacoes, status: c ? v.status : "agendado" };
          btn.disabled = true;
          // conflito de horário (avisa uma vez)
          var conf = sb.from("compromissos").select("titulo,inicio").neq("status", "cancelado").lt("inicio", dados.fim).gt("fim", dados.inicio);
          if (c) conf = conf.neq("id", c.id);
          conf.then(function (rc) {
            if (!aviso && rc.data && rc.data.length) {
              aviso = true; btn.disabled = false;
              err.textContent = "Atenção: já existe “" + rc.data[0].titulo + "” às " + hhmm(new Date(rc.data[0].inicio)) + " nesse horário. Clique de novo para agendar mesmo assim.";
              return;
            }
            var q = c ? sb.from("compromissos").update(dados).eq("id", c.id) : sb.from("compromissos").insert(dados);
            q.select("id").single().then(function (r) {
              btn.disabled = false;
              if (r.error) { err.textContent = erroAmigavel(r.error); return; }
              msg(c ? "Compromisso atualizado." : "Compromisso agendado. Use os botões acima para levar ao celular.", "ok");
              agSemana = inicioSemana(inicio);
              if (!$("tab-agenda").hidden) listarAgenda();
              abrirCompromisso(r.data.id);
            });
          });
        });
        body.appendChild(section(c ? "Editar" : "Dados do compromisso", [form]));
        if (c) {
          var del = el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Excluir compromisso" });
          confirmarDuasVezes(del, "Clique de novo para excluir", function () {
            sb.from("compromissos").delete().eq("id", c.id).then(function (r) {
              if (r.error) { msg(erroAmigavel(r.error), "err"); return; }
              msg("Compromisso excluído. Se ele estava na agenda do celular por arquivo, apague lá também.", "ok"); fecharDrawer(); if (!$("tab-agenda").hidden) listarAgenda();
            });
          });
          body.appendChild(el("div", { class: "danger-zone" }, [el("p", { class: "small", text: "Prefira marcar como “Cancelado”: assim ele some também da agenda assinada no celular." }), del]));
        }
      }, origin);
    });
  }

  /** Lista de compromissos na ficha do candidato */
  function secaoAgendaCandidato(c, comps, cands) {
    var nodes = [];
    if (comps === null) return section("Agenda", [el("p", { class: "muted small", text: "Agenda ainda não ativada (SQL 007)." })]);
    var ul = el("ul", { class: "plain" });
    if (!comps.length) ul.appendChild(el("li", { class: "muted small", text: "Nenhum compromisso." }));
    comps.forEach(function (k) {
      var d = new Date(k.inicio);
      ul.appendChild(el("li", null, [el("button", { type: "button", class: "btn-link", text: fmtData(k.inicio) + " " + hhmm(d) + " · " + k.titulo, onclick: function (e) { abrirCompromisso(k.id, null, e.currentTarget); } }),
        " ", el("span", { class: "pill", text: COMP_ST[k.status] })]));
    });
    nodes.push(ul);
    var k0 = (cands || [])[0];
    nodes.push(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Agendar entrevista", onclick: function (e) {
      abrirCompromisso(null, { candidato: { id: c.id, nome: nomeExib(c), codigo: c.codigo }, vaga_id: k0 ? k0.vaga_id : null, tipo: "entrevista" }, e.currentTarget);
    } }));
    return section("Agenda", nodes);
  }

  function abrirAssinatura(origin) {
    abrirPainel("Agenda", "Receber no celular", "Os compromissos aparecem sozinhos na agenda do seu celular", function (body) {
      var box = el("div", { class: "laudo-box" });
      body.appendChild(section("Seu link de assinatura", [
        el("p", { class: "small", text: "Este link é pessoal e dá acesso aos nomes e horários da agenda. Não compartilhe. Se ele vazar, gere um novo: o antigo para de funcionar na hora." }), box]));
      function mostrar(renovar) {
        box.innerHTML = ""; box.appendChild(el("p", { class: "muted small", text: "Gerando…" }));
        sb.rpc("agenda_feed_token", { p_renovar: !!renovar }).then(function (r) {
          box.innerHTML = "";
          if (r.error) { box.appendChild(el("p", { class: "error-msg", text: /agenda_feed/.test(r.error.message || "") ? "Rode o SQL 007 no Supabase para ativar." : erroAmigavel(r.error) })); return; }
          var https = String(C.supabaseUrl).replace(/\/$/, "") + "/rest/v1/rpc/agenda_ics?t=" + r.data + "&apikey=" + C.supabaseAnonKey;
          var webcal = https.replace(/^https:/, "webcal:");
          var st = el("span", { class: "small muted", role: "status" });
          box.appendChild(el("div", { class: "inline" }, [
            el("a", { class: "btn btn-primary btn-sm", href: webcal, text: "Assinar no iPhone / Mac" }),
            el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Copiar link", onclick: function () { copiar(https, st); } }), st]));
          var nova = el("button", { type: "button", class: "btn-link small", text: "Gerar novo link (o atual para de funcionar)" });
          confirmarDuasVezes(nova, "Clique de novo para trocar o link", function () { mostrar(true); });
          box.appendChild(nova);
        });
      }
      body.appendChild(section("Como assinar", [el("ol", { class: "passos" }, [
        el("li", null, [el("strong", { text: "iPhone: " }), "abra este painel no iPhone e toque em “Assinar no iPhone / Mac”, depois em Assinar. Ou: Ajustes › Calendário › Contas › Adicionar conta › Outra › Adicionar calendário assinado e cole o link."]),
        el("li", null, [el("strong", { text: "Android / Google Agenda: " }), "no computador, abra calendar.google.com › Outras agendas › “+” › Do URL, cole o link e adicione. Ela aparece no app do celular em seguida; ative as notificações dela no app."]),
        el("li", null, [el("strong", { text: "Outlook: " }), "Adicionar calendário › Assinar da Web e cole o link."])
      ]), el("p", { class: "hint", text: "Os lembretes de cada compromisso (1 dia antes, 1 hora antes…) vêm junto. O iPhone atualiza a agenda assinada sozinho (em Ajustes › Calendário › Contas › Buscar, escolha “A cada 15 minutos”). O Google Agenda pode levar algumas horas para mostrar mudanças; para algo marcado em cima da hora, use também “Adicionar ao celular” no compromisso." })]));
      mostrar(false);
    }, origin);
  }

  /* ============================================================ FINANCEIRO */
  var CAT_ENTRADA = ["Recrutamento e seleção", "Avaliação comportamental", "Consultoria de RH", "Treinamento e desenvolvimento", "Pesquisa de clima", "Serviços de carreira (pessoa física)", "Outras receitas"];
  var CAT_SAIDA = ["Impostos e taxas", "Contador", "Ferramentas e assinaturas", "Testes e materiais psicológicos", "Marketing e anúncios", "Deslocamento", "Material e impressão", "Cursos e eventos", "Pró-labore / retirada", "Outras despesas"];
  var FORMAS = [["pix", "Pix"], ["transferencia", "Transferência"], ["boleto", "Boleto"], ["cartao", "Cartão"], ["dinheiro", "Dinheiro"], ["outro", "Outro"]];
  var finMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1), finCache = [];
  var brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  function ym(s) { return String(s || "").slice(0, 7); }
  function mesISO(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function situacao(l) { return l.pago_em ? "pago" : l.vencimento < hojeISO() ? "vencido" : "aberto"; }
  function rotuloSit(l) { var s = situacao(l); return s === "pago" ? (l.tipo === "entrada" ? "Recebido " : "Pago ") + fmtData(l.pago_em) : s === "vencido" ? "Vencido" : "Em aberto"; }
  function somaV(arr) { return arr.reduce(function (a, l) { return a + Number(l.valor); }, 0); }
  function addMeses(iso, n) {
    var p = iso.split("-").map(Number), d = new Date(p[0], p[1] - 1 + n, 1), ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(p[2], ult)); return isoLocal(d);
  }

  function listarFin() {
    $("fin-tbody").innerHTML = ""; $("fin-tbody").appendChild(el("tr", null, [el("td", { colspan: "7", class: "muted", text: "Carregando…" })]));
    sb.from("lancamentos").select("*, empresas(nome), candidatos(nome,codigo)").order("vencimento").limit(5000).then(function (r) {
      if (r.error) {
        $("fin-tbody").innerHTML = "";
        $("fin-tbody").appendChild(el("tr", null, [el("td", { colspan: "7", class: "error-msg", text: /lancamentos/.test(r.error.message || "") ? "Financeiro ainda não ativado: rode o arquivo supabase/sql/007-agenda-e-financeiro.sql no Supabase." : erroAmigavel(r.error) })]));
        return;
      }
      finCache = r.data || []; renderFin();
    });
  }
  function filtradosFin() {
    var m = mesISO(finMes), tipo = $("fin-tipo").value, st = $("fin-status").value;
    return finCache.filter(function (l) {
      if (tipo && l.tipo !== tipo) return false;
      if (st === "vencido") return situacao(l) === "vencido";
      if (st === "pago") return ym(l.pago_em) === m;
      if (st === "aberto") return !l.pago_em && ym(l.vencimento) === m;
      return ym(l.vencimento) === m || ym(l.pago_em) === m;
    });
  }
  function renderFin() {
    var m = mesISO(finMes);
    $("fin-periodo").textContent = finMes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    var pagos = finCache.filter(function (l) { return l.pago_em; });
    var ent = function (arr) { return arr.filter(function (l) { return l.tipo === "entrada"; }); }, sai = function (arr) { return arr.filter(function (l) { return l.tipo === "saida"; }); };
    var caixa = somaV(ent(pagos)) - somaV(sai(pagos));
    var pagosMes = pagos.filter(function (l) { return ym(l.pago_em) === m; });
    var abertosMes = finCache.filter(function (l) { return !l.pago_em && ym(l.vencimento) === m; });
    var vencidos = finCache.filter(function (l) { return situacao(l) === "vencido"; });
    var k = $("fin-kpis"); k.innerHTML = "";
    k.appendChild(kpi("Saldo em caixa", brl2.format(caixa), "tudo o que entrou menos o que saiu", { alerta: caixa < 0 }));
    k.appendChild(kpi("Recebido no mês", brl2.format(somaV(ent(pagosMes))), ent(pagosMes).length + " recebimento(s)"));
    k.appendChild(kpi("Pago no mês", brl2.format(somaV(sai(pagosMes))), sai(pagosMes).length + " pagamento(s)"));
    var res = somaV(ent(pagosMes)) - somaV(sai(pagosMes));
    k.appendChild(kpi("Resultado do mês", brl2.format(res), res >= 0 ? "sobrou no mês" : "faltou no mês", { alerta: res < 0 }));
    k.appendChild(kpi("A receber no mês", brl2.format(somaV(ent(abertosMes))), ent(abertosMes).length + " em aberto"));
    k.appendChild(kpi("A pagar no mês", brl2.format(somaV(sai(abertosMes))), sai(abertosMes).length + " em aberto"));
    var kv = kpi("Vencidos", brl2.format(somaV(vencidos)), ent(vencidos).length + " a receber · " + sai(vencidos).length + " a pagar", { alerta: vencidos.length > 0 });
    if (vencidos.length) { kv = el("button", { type: "button", class: kv.className, onclick: function () { $("fin-status").value = "vencido"; renderFin(); } }, [].slice.call(kv.childNodes)); }
    k.appendChild(kv);

    // gráfico: 6 meses até o mês escolhido (realizado)
    var g = $("fin-graficos"); g.innerHTML = "";
    var meses = [];
    for (var i = 5; i >= 0; i--) { var d = new Date(finMes.getFullYear(), finMes.getMonth() - i, 1), key = mesISO(d), pm = pagos.filter(function (l) { return ym(l.pago_em) === key; });
      meses.push({ key: key, label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), e: somaV(ent(pm)), s: somaV(sai(pm)) }); }
    var max = Math.max.apply(null, meses.map(function (x) { return Math.max(x.e, x.s); })) || 1;
    var cols = el("div", { class: "cols cols-duplas", role: "img", "aria-label": "Entradas e saídas pagas por mês: " + meses.map(function (x) { return x.label + " entradas " + brl.format(x.e) + ", saídas " + brl.format(x.s); }).join("; ") });
    meses.forEach(function (x) {
      cols.appendChild(el("div", { class: "col" + (x.key === m ? " is-atual" : "") }, [
        el("div", { class: "col-par" }, [el("span", { class: "col-bar bar-ent", style: "height:" + Math.max(2, Math.round(x.e / max * 100)) + "%" }), el("span", { class: "col-bar bar-sai", style: "height:" + Math.max(2, Math.round(x.s / max * 100)) + "%" })]),
        el("span", { class: "col-lab", text: x.label }), el("span", { class: "col-saldo" + (x.e - x.s < 0 ? " neg" : ""), text: brl.format(x.e - x.s) })
      ]));
    });
    g.appendChild(cartao("Entradas x saídas (realizado)", [el("p", { class: "legenda small" }, [el("span", { class: "lg lg-ent" }), " Entradas  ", el("span", { class: "lg lg-sai" }), " Saídas  · número = resultado do mês"]), cols], "span-2"));
    var doMes = finCache.filter(function (l) { return ym(l.vencimento) === m || ym(l.pago_em) === m; });
    function porCat(arr) { var o = {}; arr.forEach(function (l) { o[l.categoria] = (o[l.categoria] || 0) + Number(l.valor); }); return Object.keys(o).map(function (k2) { return { label: k2, n: o[k2], extra: "" }; }).sort(function (a, b) { return b.n - a.n; }); }
    g.appendChild(cartao("Saídas do mês por categoria", [barras(porCat(sai(doMes)), { vazio: "Nenhuma saída neste mês.", fmt: brl2.format })]));
    g.appendChild(cartao("Entradas do mês por categoria", [barras(porCat(ent(doMes)).map(function (x) { x.cor = "#3c6e71"; return x; }), { vazio: "Nenhuma entrada neste mês.", fmt: brl2.format })]));

    // tabela
    var lista = filtradosFin(), tb = $("fin-tbody"), tf = $("fin-tfoot"); tb.innerHTML = ""; tf.innerHTML = "";
    if (!lista.length) tb.appendChild(el("tr", null, [el("td", { colspan: "7", class: "muted", text: finCache.length ? "Nada neste filtro." : "Nenhum lançamento ainda. Clique em “Novo lançamento”." })]));
    lista.forEach(function (l) {
      var s = situacao(l), b = el("button", { type: "button", class: "btn-link", text: l.descricao + (l.parcela ? " (" + l.parcela + ")" : ""), onclick: function (e) { abrirLancamento(l.id, null, e.currentTarget); } });
      var acao = null;
      if (!l.pago_em) acao = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: l.tipo === "entrada" ? "Recebi hoje" : "Paguei hoje", onclick: function () {
        sb.from("lancamentos").update({ pago_em: hojeISO() }).eq("id", l.id).then(function (r) { if (r.error) { msg(erroAmigavel(r.error), "err"); return; } msg("Baixa registrada.", "ok"); listarFin(); });
      } });
      tb.appendChild(el("tr", { class: "fin-" + l.tipo + " sit-" + s }, [
        el("td", { text: fmtData(l.vencimento) }), el("td", null, [b, l.observacoes ? el("div", { class: "small muted", text: l.observacoes.slice(0, 80) }) : null]), el("td", { text: l.categoria }),
        el("td", { text: l.empresas ? l.empresas.nome : l.candidatos ? l.candidatos.nome : "—" }),
        el("td", { class: "num valor-" + l.tipo, text: (l.tipo === "entrada" ? "+ " : "− ") + brl2.format(l.valor) }),
        el("td", null, [el("span", { class: "pill pill-fin-" + s, text: rotuloSit(l) })]), el("td", null, [acao])
      ]));
    });
    if (lista.length) {
      var tot = somaV(ent(lista)) - somaV(sai(lista));
      tf.appendChild(el("tr", null, [el("td", { colspan: "4", text: "Saldo da lista (" + lista.length + " lançamentos: entradas menos saídas)" }), el("td", { class: "num", text: brl2.format(tot) }), el("td", { colspan: "2" })]));
    }
  }

  function abrirLancamento(id, preset, origin) {
    preset = preset || {};
    Promise.all([
      id ? sb.from("lancamentos").select("*, candidatos(nome,codigo)").eq("id", id).single() : Promise.resolve({ data: null }),
      sb.from("empresas").select("id,nome").order("nome").limit(1000)
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      var l = res[0].data, emps = res[1].data || [];
      var base = l ? Object.assign({}, l, { ja_pago: l.pago_em ? ["sim"] : [] }) : { tipo: preset.tipo || "entrada", vencimento: hojeISO(), empresa_id: preset.empresa_id || null, repetir: "nao", vezes: 2, ja_pago: [], pago_em: hojeISO() };
      var cand = l && l.candidatos ? { id: l.candidato_id, nome: l.candidatos.nome, codigo: l.candidatos.codigo } : null;
      abrirPainel(l ? (l.tipo === "entrada" ? "Entrada" : "Saída") : "Novo lançamento", l ? l.descricao : "Registrar entrada ou saída", l ? rotuloSit(l) + " · " + brl2.format(l.valor) : "Recebimentos, despesas, parcelas e contas fixas", function (body) {
        var spec = [
          { k: "tipo", label: "Tipo", type: "select", required: true, options: [["entrada", "Entrada (recebimento)"], ["saida", "Saída (despesa)"]] },
          { k: "valor", label: "Valor (R$)", type: "number", required: true, step: "0.01", min: 0, inputmode: "decimal" },
          { k: "descricao", label: "Descrição", required: true, max: 200, full: true, hint: "Ex.: R&S Supervisor de Logística — Empresa X; Assinatura do Canva." },
          { k: "categoria", label: "Categoria", required: true, max: 60 },
          { k: "vencimento", label: "Vencimento", type: "date", required: true },
          { k: "ja_pago", label: "Situação", type: "checks", options: [["sim", "Já foi pago / recebido"]] },
          { k: "pago_em", label: "Data do pagamento", type: "date" },
          { k: "forma", label: "Forma", type: "select", options: FORMAS, placeholder: "—" },
          { k: "empresa_id", label: "Cliente / empresa", type: "select", options: emps.map(function (e) { return [e.id, e.nome]; }), placeholder: "Nenhuma" }
        ];
        if (!l) spec.push({ k: "repetir", label: "Repetição", type: "select", required: true, options: [["nao", "Não repetir"], ["parcelar", "Parcelar (divide o valor)"], ["mensal", "Repetir todo mês (mesmo valor)"]] },
          { k: "vezes", label: "Quantas vezes", type: "number", min: 2, step: "1", inputmode: "numeric", hint: "Parcelas ou meses (2 a 60)." });
        spec.push({ k: "observacoes", label: "Observações", type: "textarea", max: 1000, full: true });
        var f = buildForm(spec, base, "fn");

        var dl = el("datalist", { id: "fn-cats" }); f.inputs.categoria.setAttribute("list", "fn-cats"); f.node.appendChild(dl);
        function cats() { dl.innerHTML = ""; (f.inputs.tipo.value === "saida" ? CAT_SAIDA : CAT_ENTRADA).forEach(function (t) { dl.appendChild(el("option", { value: t })); }); }
        f.inputs.tipo.addEventListener("change", cats); cats();
        var cbPago = f.inputs.ja_pago.querySelector("input");
        function togglePago() { f.inputs.pago_em.closest(".field").hidden = !cbPago.checked; }
        cbPago.addEventListener("change", togglePago); togglePago();
        if (!l) { var togRep = function () { f.inputs.vezes.closest(".field").hidden = f.inputs.repetir.value === "nao"; }; f.inputs.repetir.addEventListener("change", togRep); togRep(); }

        var candCod = el("input", { type: "text", id: "fn-cand", placeholder: "PRH-0000-XXXXXX (serviço de carreira)", autocomplete: "off", value: cand ? cand.codigo : null });
        var candInfo = el("span", { class: "small", text: cand ? cand.nome : "" });
        candCod.addEventListener("change", function () {
          var cod = candCod.value.trim().toUpperCase(); if (!cod) { cand = null; candInfo.textContent = ""; return; }
          sb.from("candidatos").select("id,nome,codigo").eq("codigo", cod).maybeSingle().then(function (r) { cand = r.data || null; candInfo.textContent = cand ? cand.nome : "Código não encontrado"; });
        });
        f.node.insertBefore(el("div", { class: "field full" }, [el("label", { for: "fn-cand", text: "Pessoa do banco (opcional)" }), el("div", { class: "inline" }, [candCod, candInfo])]), f.inputs.observacoes.closest(".field"));

        var err = el("p", { class: "error-msg", role: "alert" });
        var btn = el("button", { type: "submit", class: "btn btn-primary btn-sm", text: l ? "Salvar alterações" : "Lançar" });
        var form = el("form", { class: "admin-form", novalidate: true }, [f.node, err, el("div", { class: "btn-row" }, [btn])]);
        form.addEventListener("submit", function (e) {
          e.preventDefault(); err.textContent = "";
          var falta = f.faltando(); if (falta.length) { err.textContent = "Preencha: " + falta.join(", ") + "."; return; }
          var v = f.values();
          if (!(v.valor > 0)) { err.textContent = "Informe um valor maior que zero."; return; }
          if (candCod.value.trim() && !cand) { err.textContent = "Confira o código da pessoa."; return; }
          var pago = (v.ja_pago || []).length > 0;
          if (pago && !v.pago_em) { err.textContent = "Informe a data do pagamento."; return; }
          var dados = { tipo: v.tipo, descricao: v.descricao, categoria: v.categoria, valor: Math.round(v.valor * 100) / 100, vencimento: v.vencimento, pago_em: pago ? v.pago_em : null,
            forma: v.forma, empresa_id: v.empresa_id, candidato_id: cand ? cand.id : null, observacoes: v.observacoes };
          var linhas = [dados];
          if (!l && v.repetir !== "nao") {
            var n = Math.round(v.vezes || 0);
            if (n < 2 || n > 60) { err.textContent = "Quantas vezes: de 2 a 60."; return; }
            var grupo = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
            var centavos = Math.round(dados.valor * 100), parte = Math.floor(centavos / n), resto = centavos - parte * n;
            linhas = [];
            for (var i = 0; i < n; i++) {
              var val = v.repetir === "parcelar" ? (parte + (i === 0 ? resto : 0)) / 100 : dados.valor;
              linhas.push(Object.assign({}, dados, { valor: val, vencimento: addMeses(dados.vencimento, i), pago_em: i === 0 ? dados.pago_em : null, grupo: grupo, parcela: (i + 1) + "/" + n }));
            }
          }
          btn.disabled = true;
          var q = l ? sb.from("lancamentos").update(dados).eq("id", l.id) : sb.from("lancamentos").insert(linhas);
          q.then(function (r) {
            btn.disabled = false;
            if (r.error) { err.textContent = erroAmigavel(r.error); return; }
            msg(l ? "Lançamento atualizado." : linhas.length > 1 ? linhas.length + " lançamentos criados." : "Lançamento registrado.", "ok");
            fecharDrawer(); finMes = new Date(Number(dados.vencimento.slice(0, 4)), Number(dados.vencimento.slice(5, 7)) - 1, 1);
            if (!$("tab-financeiro").hidden) listarFin();
          });
        });
        body.appendChild(section(l ? "Editar" : "Dados", [form]));
        if (l) {
          var del = el("button", { type: "button", class: "btn btn-danger btn-sm", text: "Excluir este lançamento" });
          confirmarDuasVezes(del, "Clique de novo para excluir", function () {
            sb.from("lancamentos").delete().eq("id", l.id).then(function (r) { if (r.error) { msg(erroAmigavel(r.error), "err"); return; } msg("Lançamento excluído.", "ok"); fecharDrawer(); listarFin(); });
          });
          var zona = [del];
          if (l.grupo) {
            var delG = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Excluir também as próximas parcelas em aberto" });
            confirmarDuasVezes(delG, "Clique de novo para excluir as próximas", function () {
              sb.from("lancamentos").delete().eq("grupo", l.grupo).gte("vencimento", l.vencimento).is("pago_em", null).then(function (r) { if (r.error) { msg(erroAmigavel(r.error), "err"); return; } msg("Parcelas em aberto excluídas.", "ok"); fecharDrawer(); listarFin(); });
            });
            zona.push(delG);
          }
          body.appendChild(el("div", { class: "danger-zone" }, zona));
        }
      }, origin);
    });
  }

  function exportarFin() {
    var lista = filtradosFin();
    var num = function (v) { return String(Number(v).toFixed(2)).replace(".", ","); };
    var cel = function (s) { s = String(s == null ? "" : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var linhas = [["Tipo", "Vencimento", "Descrição", "Parcela", "Categoria", "Cliente / pessoa", "Valor", "Situação", "Pago em", "Forma", "Observações"].join(";")];
    lista.forEach(function (l) {
      linhas.push([l.tipo === "entrada" ? "Entrada" : "Saída", fmtData(l.vencimento), l.descricao, l.parcela, l.categoria, l.empresas ? l.empresas.nome : l.candidatos ? l.candidatos.nome : "",
        (l.tipo === "saida" ? "-" : "") + num(l.valor), situacao(l), l.pago_em ? fmtData(l.pago_em) : "", (FORMAS.filter(function (x) { return x[0] === l.forma; })[0] || ["", ""])[1], l.observacoes].map(cel).join(";"));
    });
    var url = URL.createObjectURL(new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    var a = el("a", { href: url, download: "financeiro-" + mesISO(finMes) + ".csv" }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    sb.rpc("registrar_acesso", { p_acao: "exportar", p_candidato: null });
  }

  /** Resumo financeiro do cliente (ficha da empresa, só admin) */
  function secaoFinEmpresa(e) {
    var box = el("div", null, [el("p", { class: "muted small", text: "Carregando…" })]);
    sb.from("lancamentos").select("tipo,valor,pago_em,vencimento").eq("empresa_id", e.id).then(function (r) {
      box.innerHTML = "";
      if (r.error) { box.appendChild(el("p", { class: "muted small", text: "Financeiro ainda não ativado (SQL 007)." })); return; }
      var en = (r.data || []).filter(function (l) { return l.tipo === "entrada"; });
      var receb = somaV(en.filter(function (l) { return l.pago_em; })), aberto = en.filter(function (l) { return !l.pago_em; }), venc = aberto.filter(function (l) { return l.vencimento < hojeISO(); });
      box.appendChild(dl([["Recebido", brl2.format(receb)], ["A receber", brl2.format(somaV(aberto)) + (venc.length ? " (" + venc.length + " vencido)" : "")]]));
      box.appendChild(el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Lançar recebimento deste cliente", onclick: function (ev) { abrirLancamento(null, { tipo: "entrada", empresa_id: e.id }, ev.currentTarget); } }));
    });
    return section("Financeiro", [box]);
  }

  function bindAgendaFin() {
    fillSelect2($("ag-tipo"), COMP_TIPOS);
    $("ag-tipo").addEventListener("change", listarAgenda);
    $("ag-cancelados").addEventListener("change", listarAgenda);
    $("ag-prev").addEventListener("click", function () { agSemana = addDias(agSemana, -7); listarAgenda(); });
    $("ag-next").addEventListener("click", function () { agSemana = addDias(agSemana, 7); listarAgenda(); });
    $("ag-hoje").addEventListener("click", function () { agSemana = inicioSemana(new Date()); listarAgenda(); });
    $("btn-novo-comp").addEventListener("click", function (e) { abrirCompromisso(null, null, e.currentTarget); });
    $("ag-celular").addEventListener("click", function (e) { abrirAssinatura(e.currentTarget); });
    $("ag-semana-ics").addEventListener("click", function () {
      var l = agCache.filter(function (c) { return c.status !== "cancelado"; });
      if (!l.length) { msg("Não há compromissos nesta semana.", "err"); return; }
      baixarIcs(l, "agenda-" + isoLocal(agSemana) + ".ics");
    });
    $("fin-prev").addEventListener("click", function () { finMes = new Date(finMes.getFullYear(), finMes.getMonth() - 1, 1); renderFin(); });
    $("fin-next").addEventListener("click", function () { finMes = new Date(finMes.getFullYear(), finMes.getMonth() + 1, 1); renderFin(); });
    $("fin-hoje").addEventListener("click", function () { finMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1); $("fin-status").value = ""; renderFin(); });
    ["fin-tipo", "fin-status"].forEach(function (id) { $(id).addEventListener("change", renderFin); });
    $("btn-novo-lanc").addEventListener("click", function (e) { abrirLancamento(null, null, e.currentTarget); });
    $("fin-csv").addEventListener("click", exportarFin);
  }

  /** Cartões extras da visão geral: próximos compromissos (equipe) e financeiro do mês (admin) */
  function painelExtras() {
    if (!can("editar")) return;
    var g = $("dash-grid"), k = $("kpis");
    var agora = new Date(), ate = addDias(inicioSemana(agora), 14);
    sb.from("compromissos").select(COMP_SEL).neq("status", "cancelado").gte("fim", agora.toISOString()).lt("inicio", ate.toISOString()).order("inicio").limit(8).then(function (r) {
      if (r.error) return;
      var hoje = isoLocal(agora), nHoje = (r.data || []).filter(function (c) { return isoLocal(new Date(c.inicio)) === hoje; }).length;
      var badge = $("badge-agenda"); badge.hidden = !nHoje; badge.textContent = nHoje || "";
      var ul = el("ul", { class: "agenda" });
      if (!(r.data || []).length) ul.appendChild(el("li", { class: "muted small", text: "Nenhum compromisso marcado." }));
      (r.data || []).forEach(function (c) {
        var d = new Date(c.inicio), dia = isoLocal(d);
        ul.appendChild(el("li", null, [el("span", { class: "ag-data", text: (dia === hoje ? "Hoje" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })) + " · " + hhmm(d) }),
          el("button", { type: "button", class: "btn-link", text: c.titulo, onclick: function (e) { abrirCompromisso(c.id, null, e.currentTarget); } }),
          el("span", { class: "muted small", text: COMP_TIPO[c.tipo] + (c.local ? " · " + c.local : "") })]));
      });
      g.insertBefore(cartao("Próximos compromissos", [ul, el("button", { type: "button", class: "btn btn-secondary btn-sm card-acao", text: "Abrir agenda", onclick: function () { irPara("agenda"); } })]), g.firstChild);
    });
    if (!can("admin")) return;
    sb.from("lancamentos").select("tipo,valor,vencimento,pago_em").then(function (r) {
      if (r.error) return;
      var m = mesISO(new Date()), L = r.data || [];
      var receber = L.filter(function (l) { return l.tipo === "entrada" && !l.pago_em && ym(l.vencimento) <= m; });
      var venc = L.filter(function (l) { return !l.pago_em && l.vencimento < hojeISO(); });
      k.appendChild(kpi("A receber (até este mês)", brl.format(somaV(receber)), receber.length + " lançamento(s) em aberto", { tab: "financeiro" }));
      k.appendChild(kpi("Contas vencidas", venc.length, brl.format(somaV(venc)) + " entre receber e pagar", { tab: "financeiro", alerta: venc.length > 0 }));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
