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

  var AREAS = ["Administrativo","Atendimento ao cliente","Comercial e vendas","Comunicação e marketing","Contabilidade e finanças",
    "Educação","Engenharia","Jurídico","Logística e distribuição","Manutenção","Produção e indústria",
    "Recursos Humanos","Saúde","Segurança do trabalho","Serviços gerais","Tecnologia da informação","Outra área"];
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
  }

  var ABAS = ["painel", "candidatos", "acompanhamento", "vagas", "empresas", "pedidos", "auditoria"];
  function irPara(tab) {
    document.querySelectorAll(".admin-tabs .tab").forEach(function (o) { if (o.getAttribute("data-tab") === tab) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current"); });
    ABAS.forEach(function (n) { $("tab-" + n).hidden = n !== tab; });
    if (tab === "painel") carregarPainel();
    if (tab === "candidatos") listar();
    if (tab === "acompanhamento") listarAcomp();
    if (tab === "vagas") listarVagas();
    if (tab === "empresas") listarEmpresas();
    if (tab === "pedidos") listarPedidos();
    if (tab === "auditoria") listarAuditoria();
  }

  /* ------------------------------------------------------------ lista de candidatos */
  function listar() {
    var q = sb.from("candidatos")
      .select("id,codigo,nome,cargo_desejado,area,cidade,uf,modalidade,cnh_categoria,cnh_ear,status,criado_em", { count: "exact" })
      .order("criado_em", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    var busca = $("f-busca").value.trim().replace(/[%,()*]/g, " ").trim();
    var buscaCpf = busca.replace(/\D/g, "");
    if (busca && /^[\d.\-\s]+$/.test(busca) && buscaCpf.length >= 3) q = q.like("cpf", "%" + buscaCpf + "%");
    else if (busca) q = q.or("nome.ilike.%" + busca + "%,email.ilike.%" + busca + "%,codigo.ilike.%" + busca + "%");
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
        var btn = el("button", { type: "button", class: "btn-link", text: c.nome, onclick: function () { abrir(c.id, btn); } });
        tbody.appendChild(el("tr", null, [
          el("td", { class: "mono", text: c.codigo }), el("td", null, [btn]), el("td", { text: c.cargo_desejado }),
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
      can("admin") ? sb.from("ficha_interna").select("*").eq("candidato_id", id).maybeSingle() : Promise.resolve({ data: null })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      current = res[0].data;
      sb.rpc("registrar_acesso", { p_acao: "ver_perfil", p_candidato: id });
      renderDrawer(current, res[1].data || [], res[2].data || [], res[3].data || [], res[4].data);
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

  function renderDrawer(c, cons, inter, cands, ficha) {
    $("d-codigo").textContent = c.codigo;
    $("d-nome").textContent = c.nome;
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
      ["E-mail", c.email], ["Telefone", c.telefone], ["CPF", can("editar") ? fmtCpf(c.cpf) : (c.cpf ? "***." + c.cpf.slice(3, 6) + ".***-**" : null)], ["LinkedIn", safeLink(c.linkedin_url, "Abrir perfil")], ["Cidade", c.cidade + "/" + c.uf]
    ])]));

    // Perfil
    body.appendChild(section("Perfil profissional", [dl([
      ["Área", c.area], ["Cargo desejado", c.cargo_desejado], ["Experiência", c.experiencia], ["Escolaridade", c.escolaridade], ["CNH", fmtCnh(c)],
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
        var passo1 = c.curriculo_path ? sb.storage.from("curriculos").remove([c.curriculo_path]) : Promise.resolve({});
        passo1.then(function (r1) {
          if (r1.error) { btnEx.disabled = false; msg("Não foi possível apagar o currículo. Nada foi excluído.", "err"); return; }
          sb.rpc("anonimizar_candidato", { p_candidato: c.id }).then(function (r2) {
            if (r2.error) { btnEx.disabled = false; msg(erroAmigavel(r2.error), "err"); return; }
            msg("Dados excluídos (registro anonimizado).", "ok"); fecharDrawer(); listar();
          });
        });
      } });
      ret.push(el("div", { class: "danger-zone" }, [
        el("h4", { text: "Excluir dados" }),
        el("p", { class: "small", text: "Use para pedido de exclusão do titular ou fim do prazo de retenção. Apaga o currículo e anonimiza o cadastro. Não pode ser desfeito." }),
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
        el("span", { class: "hb-val", text: String(i.n) + (i.extra ? " · " + i.extra : "") })
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
    sb.from("candidatos").select("id,codigo,nome,email,telefone,cargo_desejado,ultimo_checkin,proximo_checkin", { count: "exact" })
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
      onclick: function (e) { e.currentTarget.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent(textoMensagem(c.nome)); }, href: "https://wa.me/" + wa }));
    envio.appendChild(el("a", { class: "btn btn-secondary btn-sm", text: "E-mail",
      onclick: function (e) { e.currentTarget.href = "mailto:" + c.email + "?subject=" + encodeURIComponent("Permanência RH: seu perfil no Banco de Talentos") + "&body=" + encodeURIComponent(textoMensagem(c.nome)); }, href: "mailto:" + c.email }));
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
    var nomeBtn = el("button", { type: "button", class: "btn-link", text: c.nome, onclick: function () { abrir(c.id, nomeBtn); } });
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
      id ? sb.from("candidaturas").select("id,etapa,criado_em,candidato_id,candidatos(codigo,nome,cargo_desejado,cidade,uf)").eq("vaga_id", id).order("criado_em", { ascending: false }) : Promise.resolve({ data: [] })
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
        var sel = el("select", { "aria-label": "Etapa de " + (p.nome || "candidato") });
        opts(ETAPAS_CAND).forEach(function (o) { var op = el("option", { value: o[0], text: o[1] }); if (o[0] === k.etapa) op.selected = true; sel.appendChild(op); });
        if (!can("editar")) sel.disabled = true;
        sel.addEventListener("change", function () {
          sb.from("candidaturas").update({ etapa: sel.value }).eq("id", k.id).select("id").then(function (r) {
            if (r.error || !r.data || !r.data.length) { msg(r.error ? erroAmigavel(r.error) : "Seu papel não permite alterar a etapa.", "err"); sel.value = k.etapa; return; }
            k.etapa = sel.value; msg("Etapa atualizada.", "ok");
          });
        });
        var nb = el("button", { type: "button", class: "btn-link", text: p.nome || "Candidato", onclick: function () { abrir(k.candidato_id, nb); } });
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
          body.appendChild(section("Resumo", [dl([["Contato", [e.contato_nome, e.contato_cargo].filter(Boolean).join(" · ")], ["Próximo passo", e.proximo_passo], ["Próximo contato", e.proximo_contato ? fmtData(e.proximo_contato) : null],
            ["Valor estimado", e.valor_estimado ? brl.format(e.valor_estimado) : null], ["Serviços", (e.servicos || []).map(function (s) { return SERVICO[s] || s; }).join(", ")]]), links.children.length ? links : null]));
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
