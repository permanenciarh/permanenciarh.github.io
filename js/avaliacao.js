/**
 * Permanência RH — avaliação comportamental por convite (avaliacao.html#t=TOKEN)
 *
 * - Só funciona com o link gerado no painel. O token vai depois do "#", então não aparece
 *   em registros de servidor nem é repassado a outros sites.
 * - As perguntas vêm do banco apenas quando o convite é válido.
 * - As respostas ficam só na memória da página até o envio. Nada é salvo no navegador.
 * - Testes: perfil (25), Eneagrama (36), DISC exploratório (20) e Big Five exploratório (30).
 * - A pontuação é calculada no banco. O candidato não vê o resultado nesta página:
 *   ele é usado pela equipe no laudo, junto com a entrevista e as outras etapas.
 */
(function () {
  "use strict";

  var C = window.PRH_CONFIG || {};
  var box = document.getElementById("aval");
  if (!box) return;

  var token = (location.hash.match(/(?:^#|&)t=([0-9a-f]{64})/) || [])[1] || null;
  var dados = null;            // resposta de avaliacao_abrir
  var partes = [];             // [{id, titulo, intro, itens:[{q, o:[{k,t}]}]}]
  var resp = {};               // { eneagrama: [], perfil: [], disc: [], bigfive: [] }
  var pos = { p: 0, i: 0 };    // parte e item atuais
  var aceite = false;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtData(s) { return s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""; }
  function wa() { return "https://wa.me/" + (C.whatsapp || "5534992871582"); }

  function rpc(nome, corpo) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, C.requestTimeoutMs || 25000) : null;
    return fetch(String(C.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/rpc/" + nome, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": C.supabaseAnonKey, "Authorization": "Bearer " + C.supabaseAnonKey },
      body: JSON.stringify(corpo),
      signal: ctrl ? ctrl.signal : undefined,
      referrerPolicy: "no-referrer",
      credentials: "omit"
    }).then(function (r) {
      if (t) clearTimeout(t);
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  function mostrar(nodes, foco) {
    box.innerHTML = "";
    var card = el("div", { class: "quiz-card" }, nodes);
    box.appendChild(card);
    var alvo = foco ? card.querySelector(foco) : null;
    if (alvo) alvo.focus({ preventScroll: true });
    var top = box.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  function aviso(titulo, texto) {
    document.getElementById("av-lead").textContent = "";
    mostrar([
      el("h2", { class: "quiz-stem", tabindex: "-1", text: titulo }),
      el("p", { text: texto }),
      el("div", { class: "btn-row" }, [el("a", { class: "btn btn-secondary", href: wa(), target: "_blank", rel: "noopener", text: "Falar com a Permanência no WhatsApp" })])
    ], "h2");
  }

  /* ------------------------------------------------------------ início */
  function iniciar() {
    if (!token) { aviso("Link incompleto", "Abra a avaliação pelo link exato que você recebeu. Se ele não funcionar, peça um novo pelo WhatsApp."); return; }
    if (!C.supabaseUrl || !C.supabaseAnonKey) { aviso("Avaliação indisponível", "O sistema está em manutenção. Tente de novo mais tarde."); return; }
    rpc("avaliacao_abrir_v2", { p_token: token }).then(function (d) {
      if (!d || d.estado === "invalido") { aviso("Link inválido", "Este link não existe mais ou foi substituído por um novo. Fale com a Permanência para receber o link atualizado."); return; }
      if (d.estado === "concluida") { aviso("Avaliação já enviada", "Recebemos suas respostas. Obrigado! Agora é só aguardar o retorno sobre as próximas etapas."); return; }
      if (d.estado === "expirada") { aviso("Link expirado", "O prazo para responder terminou em " + fmtData(d.expira_em) + ". Se ainda quiser participar, peça um novo link pelo WhatsApp."); return; }
      dados = d;
      montarPartes();
      telaInicial();
    }).catch(function () {
      aviso("Não foi possível carregar", "Verifique sua conexão com a internet e recarregue a página.");
    });
  }

  var ESCALA_INTRO = "Em cada afirmação, indique o quanto ela combina com a forma como você costuma agir, de 1 (discordo totalmente) a 5 (concordo totalmente).";
  var ESCALA_ROTULOS = ["Discordo totalmente", "Discordo parcialmente", "Nem concordo nem discordo", "Concordo parcialmente", "Concordo totalmente"];
  function escala(q) { return { q: q.q, o: ESCALA_ROTULOS.map(function (t, i) { return { k: String(i + 1), t: (i + 1) + " · " + t }; }) }; }

  function montarPartes() {
    partes = [];
    if (dados.perfil && dados.perfil.length) {
      partes.push({ id: "perfil", titulo: "Preferências e perfil comportamental", tempo: "cerca de 5 minutos",
        intro: "Em cada pergunta, escolha a alternativa que mais combina com você.", itens: dados.perfil });
    }
    if (dados.eneagrama && dados.eneagrama.length) {
      partes.push({ id: "eneagrama", titulo: "Eneagrama de personalidade", tempo: "cerca de 8 minutos",
        intro: "Em cada pergunta, escolha a frase que mais se aproxima do que você pensa ou sente. Não pule as difíceis: escolha a que for mais verdadeira na maior parte do tempo.",
        itens: dados.eneagrama.map(function (q) { return { q: q.q, o: [{ k: "A", t: q.a }, { k: "B", t: q.b }] }; }) });
    }
    if (dados.disc && dados.disc.length) {
      partes.push({ id: "disc", titulo: "Estilo de comportamento no trabalho", tempo: "cerca de 3 minutos",
        intro: ESCALA_INTRO, itens: dados.disc.map(escala) });
    }
    if (dados.bigfive && dados.bigfive.length) {
      partes.push({ id: "bigfive", titulo: "Jeito de ser e de agir no trabalho", tempo: "cerca de 5 minutos",
        intro: ESCALA_INTRO, itens: dados.bigfive.map(escala) });
    }
    partes.forEach(function (p) { resp[p.id] = new Array(p.itens.length).fill(null); });
  }
  function totalItens() { return partes.reduce(function (s, p) { return s + p.itens.length; }, 0); }
  function feitos() { var n = 0; partes.forEach(function (p, pi) { n += pi < pos.p ? p.itens.length : pi === pos.p ? pos.i : 0; }); return n; }

  function telaInicial() {
    var lead = document.getElementById("av-lead");
    lead.textContent = "Olá, " + dados.nome + "! " + (dados.vaga ? "Esta etapa faz parte do processo seletivo para a vaga " + dados.vaga + "." : "Esta etapa faz parte do seu processo seletivo com a Permanência RH.");

    var lista = el("ol", { class: "aval-partes" }, partes.map(function (p) {
      return el("li", null, [el("strong", { text: p.titulo }), el("span", { class: "muted small", text: " · " + p.itens.length + " perguntas · " + p.tempo })]);
    }));
    var cb = el("input", { type: "checkbox", id: "av-aceite" });
    cb.checked = aceite;
    var err = el("span", { class: "error-msg", id: "av-aceite-err", role: "alert" });
    var btn = el("button", { type: "submit", class: "btn btn-primary", text: "Começar" });
    var form = el("form", { novalidate: true, class: "aval-form" }, [
      el("div", { class: "consent" }, [el("div", { class: "field" }, [
        el("label", { class: "option", for: "av-aceite" }, [cb, el("span", null, [
          "Li o ", el("a", { href: "privacidade.html#aviso", target: "_blank", rel: "noopener", text: "Aviso de Privacidade" }),
          " e autorizo a Permanência RH a usar minhas respostas nesta etapa do processo seletivo, inclusive no laudo entregue à empresa responsável pela vaga. ",
          el("span", { class: "req", "aria-hidden": "true", text: "*" })
        ])]), err
      ])]),
      el("div", { class: "btn-row" }, [btn])
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!cb.checked) { err.textContent = "Marque a autorização para começar."; cb.focus(); return; }
      aceite = true; pos = { p: 0, i: 0 }; pergunta();
    });

    mostrar([
      el("p", { class: "quiz-count", text: totalItens() + " perguntas · " + (partes.length > 1 ? partes.length + " partes" : "uma parte") }),
      el("h2", { class: "quiz-stem", tabindex: "-1", text: "Antes de começar" }),
      lista,
      el("ul", { class: "check-list compact" }, [
        el("li", { text: "Não existe resposta certa ou errada. Responda pensando em como você costuma agir, e não em como gostaria de agir." }),
        el("li", { text: "Reserve um momento tranquilo. Você pode voltar e mudar respostas antes de enviar." }),
        el("li", { text: "As respostas só são enviadas no final. Se fechar a página antes, será preciso recomeçar." }),
        el("li", { text: "O link vale até " + fmtData(dados.expira_em) + " e só pode ser enviado uma vez." }),
        el("li", { text: "Os questionários são ferramentas de apoio, de caráter exploratório. Não são teste psicológico e não dão diagnóstico." }),
        el("li", { text: "O resultado é analisado pela equipe junto com a entrevista e as outras etapas. Ele nunca é usado sozinho para aprovar ou eliminar ninguém." })
      ]),
      form
    ], "h2");
  }

  /* ------------------------------------------------------------ perguntas */
  function pergunta() {
    var parte = partes[pos.p], q = parte.itens[pos.i], lista = resp[parte.id];
    var pct = Math.round(feitos() / totalItens() * 100);
    var bar = el("div", { class: "quiz-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": "Progresso da avaliação" }, [el("span", { style: "width:" + pct + "%" })]);

    var fs = el("fieldset", { class: "quiz-q" }, [el("legend", { id: "q-legend", tabindex: "-1" }, [
      el("span", { class: "quiz-count", text: (partes.length > 1 ? "Parte " + (pos.p + 1) + " de " + partes.length + " · " : "") + "Pergunta " + (pos.i + 1) + " de " + parte.itens.length }),
      el("span", { class: "quiz-stem", text: q.q })
    ])]);
    var ops = el("div", { class: "choices" });
    var ultimo = pos.p === partes.length - 1 && pos.i === parte.itens.length - 1;
    var btnNext = el("button", { type: "submit", class: "btn btn-primary", text: ultimo ? "Revisar e enviar" : "Próxima" });
    btnNext.disabled = lista[pos.i] === null;
    q.o.forEach(function (o, i) {
      var id = "q" + pos.p + "-" + pos.i + "-" + i;
      var inp = el("input", { type: "radio", name: "q", id: id, value: o.k });
      if (lista[pos.i] === o.k) inp.checked = true;
      inp.addEventListener("change", function () { lista[pos.i] = o.k; btnNext.disabled = false; });
      ops.appendChild(el("label", { class: "choice", for: id }, [inp, el("span", { text: o.t })]));
    });
    fs.appendChild(ops);

    var btnBack = el("button", { type: "button", class: "btn btn-secondary", text: "Voltar", onclick: voltar });
    var form = el("form", { novalidate: true }, [fs, el("div", { class: "form-actions" }, [btnBack, btnNext])]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (lista[pos.i] === null) return;
      if (ultimo) { revisar(); return; }
      if (pos.i < parte.itens.length - 1) pos.i++;
      else { pos.p++; pos.i = 0; transicao(); return; }
      pergunta();
    });

    var nodes = [bar];
    if (pos.i === 0) nodes.push(el("div", { class: "aval-intro" }, [el("p", { class: "eyebrow", text: parte.titulo }), el("p", { class: "muted small", text: parte.intro })]));
    nodes.push(form);
    mostrar(nodes, "#q-legend");
  }
  function voltar() {
    if (pos.i > 0) pos.i--;
    else if (pos.p > 0) { pos.p--; pos.i = partes[pos.p].itens.length - 1; }
    else { telaInicial(); return; }
    pergunta();
  }
  function transicao() {
    mostrar([
      el("p", { class: "quiz-count", text: "Parte " + pos.p + " concluída" }),
      el("h2", { class: "quiz-stem", tabindex: "-1", text: "Ótimo! Agora a parte " + (pos.p + 1) + ": " + partes[pos.p].titulo }),
      el("p", { class: "muted", text: partes[pos.p].itens.length + " perguntas · " + partes[pos.p].tempo + ". " + partes[pos.p].intro }),
      el("div", { class: "form-actions" }, [
        el("button", { type: "button", class: "btn btn-secondary", text: "Voltar", onclick: function () { pos.p--; pos.i = partes[pos.p].itens.length - 1; pergunta(); } }),
        el("button", { type: "button", class: "btn btn-primary", text: "Continuar", onclick: function () { pergunta(); } })
      ])
    ], "h2");
  }

  /* ------------------------------------------------------------ envio */
  function revisar(erro) {
    var faltam = [];
    partes.forEach(function (p, pi) { resp[p.id].forEach(function (v, i) { if (v === null) faltam.push([pi, i]); }); });
    var btn = el("button", { type: "button", class: "btn btn-primary", text: "Enviar respostas" });
    var nodes = [
      el("div", { class: "quiz-bar", "aria-hidden": "true" }, [el("span", { style: "width:100%" })]),
      el("h2", { class: "quiz-stem", tabindex: "-1", text: "Tudo pronto para enviar" }),
      el("p", { text: "Depois do envio não é possível alterar as respostas. Se quiser revisar alguma, use o botão Voltar." })
    ];
    if (erro) nodes.push(el("p", { class: "error-msg", role: "alert", text: erro }));
    if (faltam.length) {
      btn.disabled = true;
      nodes.push(el("p", { class: "error-msg", role: "alert", text: "Ainda há " + faltam.length + " pergunta(s) sem resposta." }));
      nodes.push(el("button", { type: "button", class: "btn btn-secondary", text: "Ir para a primeira sem resposta", onclick: function () { pos = { p: faltam[0][0], i: faltam[0][1] }; pergunta(); } }));
    }
    nodes.push(el("div", { class: "form-actions" }, [
      el("button", { type: "button", class: "btn btn-secondary", text: "Voltar", onclick: function () { pos = { p: partes.length - 1, i: partes[partes.length - 1].itens.length - 1 }; pergunta(); } }),
      btn
    ]));
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Enviando…";
      rpc("avaliacao_enviar_v2", {
        p_token: token, p_aceite: aceite,
        p_eneagrama: resp.eneagrama ? resp.eneagrama.join("") : null,
        p_perfil: resp.perfil ? resp.perfil.join("") : null,
        p_bigfive: resp.bigfive ? resp.bigfive.join("") : null,
        p_disc: resp.disc ? resp.disc.join("") : null
      }).then(function (r) {
        if (r && r.ok) { concluido(); return; }
        var e = r && r.erro;
        if (e === "concluida") aviso("Avaliação já enviada", "Recebemos suas respostas anteriormente. Obrigado!");
        else if (e === "expirada") aviso("Link expirado", "O prazo para responder terminou. Peça um novo link pelo WhatsApp.");
        else if (e === "invalido") aviso("Link inválido", "Este link foi cancelado ou substituído. Fale com a Permanência para receber o link atualizado.");
        else revisar("Não foi possível enviar. Confira se todas as perguntas foram respondidas e tente de novo.");
      }).catch(function () {
        revisar("Sem conexão com o servidor. Suas respostas continuam aqui: verifique a internet e clique em Enviar de novo.");
      });
    });
    mostrar(nodes, "h2");
  }

  function concluido() {
    resp = {};
    document.getElementById("av-lead").textContent = "";
    mostrar([
      el("p", { class: "quiz-count", text: "Avaliação enviada" }),
      el("h2", { class: "quiz-stem", tabindex: "-1", text: "Obrigado, " + dados.nome + "!" }),
      el("p", { text: "Suas respostas chegaram para a equipe da Permanência RH. Agora é só aguardar o retorno sobre as próximas etapas do processo." }),
      el("p", { class: "muted small", text: "Você pode fechar esta página." })
    ], "h2");
  }

  window.addEventListener("hashchange", function () { location.reload(); });
  iniciar();
})();
