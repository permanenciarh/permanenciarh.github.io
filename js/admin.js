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
  var FINALIDADES = { ciencia_aviso: "Ciência do Aviso de Privacidade", compartilhar_empresas: "Compartilhar perfil com empresas", receber_conteudos: "Receber conteúdos por e-mail", perfil_comportamental: "Incluir perfil comportamental" };
  var PERFIS = { aguia: "Águia · Idealizador", gato: "Gato · Comunicador", lobo: "Lobo · Organizador", tubarao: "Tubarão · Executor" };
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
        show("view-app");
        listar();
      });
    });
  }

  /* ------------------------------------------------------------ abas */
  function bindApp() {
    document.querySelectorAll(".admin-tabs .tab").forEach(function (t) {
      t.addEventListener("click", function () {
        var tab = t.getAttribute("data-tab");
        document.querySelectorAll(".admin-tabs .tab").forEach(function (o) { if (o === t) o.setAttribute("aria-current", "page"); else o.removeAttribute("aria-current"); });
        ["candidatos", "pedidos", "auditoria"].forEach(function (n) { $("tab-" + n).hidden = n !== tab; });
        if (tab === "pedidos") listarPedidos();
        if (tab === "auditoria") listarAuditoria();
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
  }

  /* ------------------------------------------------------------ lista de candidatos */
  function listar() {
    var q = sb.from("candidatos")
      .select("id,codigo,nome,cargo_desejado,area,cidade,uf,modalidade,status,criado_em", { count: "exact" })
      .order("criado_em", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    var busca = $("f-busca").value.trim().replace(/[%,()*]/g, " ").trim();
    if (busca) q = q.or("nome.ilike.%" + busca + "%,email.ilike.%" + busca + "%,codigo.ilike.%" + busca + "%");
    if ($("f-area").value) q = q.eq("area", $("f-area").value);
    if ($("f-uf").value) q = q.eq("uf", $("f-uf").value);
    var cidade = $("f-cidade").value.trim().replace(/[%,()*]/g, " ").trim();
    if (cidade) q = q.ilike("cidade", "%" + cidade + "%");
    if ($("f-modalidade").value) q = q.eq("modalidade", $("f-modalidade").value);
    if ($("f-exp").value) q = q.eq("experiencia", $("f-exp").value);
    if ($("f-tipo").value) q = q.contains("tipos_oportunidade", [$("f-tipo").value]);
    if ($("f-perfil").value === "sem") q = q.is("perfil_predominante", null);
    else if ($("f-perfil").value) q = q.eq("perfil_predominante", $("f-perfil").value);
    var st = $("f-status").value;
    if (st === "ativos") q = q.is("excluido_em", null); else if (st) q = q.eq("status", st);
    var hoje = new Date().toISOString().slice(0, 10);
    if ($("f-retencao").value === "vencida") q = q.lt("reter_ate", hoje).is("excluido_em", null);
    if ($("f-retencao").value === "30") { var d = new Date(); d.setDate(d.getDate() + 30); q = q.lte("reter_ate", d.toISOString().slice(0, 10)).is("excluido_em", null); }

    var tbody = $("cand-tbody");
    tbody.innerHTML = "";
    tbody.appendChild(el("tr", null, [el("td", { colspan: "8", class: "muted", text: "Carregando…" })]));
    q.then(function (r) {
      tbody.innerHTML = "";
      if (r.error) { tbody.appendChild(el("tr", null, [el("td", { colspan: "8", class: "error-msg", text: erroAmigavel(r.error) })])); return; }
      var total = r.count || 0;
      $("cand-count").textContent = total + (total === 1 ? " candidato encontrado" : " candidatos encontrados");
      if (!r.data.length) tbody.appendChild(el("tr", null, [el("td", { colspan: "8", class: "muted", text: "Nenhum candidato com estes filtros." })]));
      r.data.forEach(function (c) {
        var btn = el("button", { type: "button", class: "btn-link", text: c.nome, onclick: function () { abrir(c.id, btn); } });
        tbody.appendChild(el("tr", null, [
          el("td", { class: "mono", text: c.codigo }), el("td", null, [btn]), el("td", { text: c.cargo_desejado }),
          el("td", { text: c.area }), el("td", { text: c.cidade + "/" + c.uf }), el("td", { text: MODAL[c.modalidade] || c.modalidade }),
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
    lastFocus = origin || document.activeElement;
    Promise.all([
      sb.from("candidatos").select("*").eq("id", id).single(),
      sb.from("consentimentos").select("finalidade,concedido,registrado_em,versao_aviso,origem").eq("candidato_id", id).order("registrado_em", { ascending: false }),
      sb.from("interacoes").select("tipo,descricao,empresa,criado_em,autor_id").eq("candidato_id", id).order("criado_em", { ascending: false })
    ]).then(function (res) {
      if (res[0].error) { msg(erroAmigavel(res[0].error), "err"); return; }
      current = res[0].data;
      sb.rpc("registrar_acesso", { p_acao: "ver_perfil", p_candidato: id });
      renderDrawer(current, res[1].data || [], res[2].data || []);
      $("drawer").hidden = false; $("drawer-backdrop").hidden = false;
      document.body.style.overflow = "hidden";
      $("d-nome").focus();
    });
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

  function renderDrawer(c, cons, inter) {
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

    // Contato
    body.appendChild(section("Contato", [dl([
      ["E-mail", c.email], ["Telefone", c.telefone], ["LinkedIn", safeLink(c.linkedin_url, "Abrir perfil")], ["Cidade", c.cidade + "/" + c.uf]
    ])]));

    // Perfil
    body.appendChild(section("Perfil profissional", [dl([
      ["Área", c.area], ["Cargo desejado", c.cargo_desejado], ["Experiência", c.experiencia], ["Escolaridade", c.escolaridade],
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
    var ret = [dl([["Cadastrado em", fmtDataHora(c.criado_em)], ["Atualizado em", fmtDataHora(c.atualizado_em)], ["Manter até", fmtData(c.reter_ate) + (vencido && !excluido ? " (vencido)" : "")]])];
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
