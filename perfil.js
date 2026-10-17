/**
 * Permanência RH — questionário de Perfil Comportamental
 * Cada resposta soma 4 pontos percentuais ao perfil correspondente (25 x 4 = 100%).
 * As respostas ficam só na memória da página: nada é salvo no navegador.
 * O resultado vai para o Banco de Talentos junto com o cadastro (o teste é etapa obrigatória do cadastro).
 * Na página do Banco de Talentos o teste fica dentro do formulário (etapa 4); por isso não usa <form> próprio.
 */
(function () {
  "use strict";

  var dataEl = document.getElementById("perfil-data");
  var quiz = document.getElementById("quiz");
  if (!dataEl || !quiz) return;

  var DATA = JSON.parse(dataEl.textContent);
  var Q = DATA.questions, P = DATA.profiles;
  var ORDER = ["I", "C", "O", "A"];
  var answers = new Array(Q.length).fill(null);
  var idx = 0;
  var embutido = !!quiz.closest("form");

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k]; // somente conteúdo fixo do próprio site
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* ------------------------------------------------------------ tela inicial */
  function renderStart() {
    quiz.innerHTML = "";
    quiz.appendChild(el("div", { class: "quiz-card quiz-start" }, [
      el("p", { class: "quiz-count", text: Q.length + " perguntas · cerca de 5 minutos" }),
      el("h3", { text: "Pronto para começar?" }),
      el("p", { class: "muted", text: "Em cada pergunta, escolha uma única alternativa. Você pode voltar e mudar suas respostas antes de ver o resultado." }),
      el("button", { type: "button", class: "btn btn-primary", text: "Começar o teste", onclick: function () { idx = 0; renderQuestion(true); } })
    ]));
  }

  /* ------------------------------------------------------------ pergunta */
  function renderQuestion(focus) {
    var q = Q[idx];
    quiz.innerHTML = "";
    var pct = Math.round((idx / Q.length) * 100);
    var bar = el("div", { class: "quiz-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(Q.length), "aria-valuenow": String(idx), "aria-label": "Progresso do teste" }, [el("span", { style: "width:" + pct + "%" })]);

    var fs = el("fieldset", { class: "quiz-q" }, [el("legend", { id: "q-legend", tabindex: "-1" }, [
      el("span", { class: "quiz-count", text: "Pergunta " + (idx + 1) + " de " + Q.length }),
      el("span", { class: "quiz-stem", text: q.q })
    ])]);
    var opts = el("div", { class: "choices" });
    q.o.forEach(function (o, i) {
      var id = "q" + idx + "-" + i;
      var input = el("input", { type: "radio", name: "q" + idx, id: id, value: o.k });
      if (answers[idx] === o.k) input.checked = true;
      input.addEventListener("change", function () { answers[idx] = o.k; btnNext.disabled = false; });
      opts.appendChild(el("label", { class: "choice", for: id }, [input, el("span", { text: o.t })]));
    });
    fs.appendChild(opts);

    var last = idx === Q.length - 1;
    var btnBack = el("button", { type: "button", class: "btn btn-secondary", text: "Voltar", onclick: function () { idx--; renderQuestion(true); } });
    if (idx === 0) btnBack.hidden = true;
    var btnNext = el("button", { type: "button", class: "btn btn-primary", text: last ? "Ver meu resultado" : "Próxima" });
    btnNext.disabled = answers[idx] === null;
    btnNext.addEventListener("click", function () {
      if (answers[idx] === null) return;
      if (last) renderResult(); else { idx++; renderQuestion(true); }
    });

    var card = el("div", { class: "quiz-card" }, [bar, fs, el("div", { class: "form-actions" }, [btnBack, btnNext])]);
    quiz.appendChild(card);
    if (focus) {
      document.getElementById("q-legend").focus({ preventScroll: true });
      var top = quiz.getBoundingClientRect().top + window.scrollY - 100;
      if (window.scrollY > top || window.scrollY + window.innerHeight < top + 300) window.scrollTo(0, top);
    }
  }

  /* ------------------------------------------------------------ cálculo */
  function score() {
    var s = { I: 0, C: 0, O: 0, A: 0 };
    answers.forEach(function (a) { if (a) s[a] += 4; });
    return s;
  }
  function ranking(s) { return ORDER.slice().sort(function (a, b) { return s[b] - s[a] || ORDER.indexOf(a) - ORDER.indexOf(b); }); }

  /* ------------------------------------------------------------ gráfico em quadrantes (SVG) */
  function quadrantSVG(s) {
    // Gato (sup. esq.), Águia (sup. dir.), Tubarão (inf. esq.), Lobo (inf. dir.)
    var NS = "http://www.w3.org/2000/svg", C = 160, R = 140;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 320 320");
    svg.setAttribute("class", "quad");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Gráfico dos quatro perfis: Águia " + s.I + "%, Gato " + s.C + "%, Lobo " + s.O + "%, Tubarão " + s.A + "%");
    function node(t, a) { var n = document.createElementNS(NS, t); Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); }); svg.appendChild(n); return n; }
    [25, 50, 75, 100].forEach(function (p) { node("circle", { cx: C, cy: C, r: R * p / 100, class: "quad-ring" }); });
    node("line", { x1: C, y1: 10, x2: C, y2: 310, class: "quad-axis" });
    node("line", { x1: 10, y1: C, x2: 310, y2: C, class: "quad-axis" });
    var quads = { C: [180, 270], I: [270, 360], A: [90, 180], O: [0, 90] };
    var top = ranking(s)[0];
    Object.keys(quads).forEach(function (k) {
      var r = R * Math.max(s[k], 2) / 100, a0 = quads[k][0] * Math.PI / 180, a1 = quads[k][1] * Math.PI / 180;
      var x0 = C + r * Math.cos(a0), y0 = C + r * Math.sin(a0), x1 = C + r * Math.cos(a1), y1 = C + r * Math.sin(a1);
      node("path", { d: "M" + C + " " + C + " L" + x0.toFixed(1) + " " + y0.toFixed(1) + " A" + r.toFixed(1) + " " + r.toFixed(1) + " 0 0 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + " Z", class: "quad-slice" + (k === top ? " is-top" : "") });
    });
    var labels = { C: [14, 26, "start"], I: [306, 26, "end"], A: [14, 304, "start"], O: [306, 304, "end"] };
    Object.keys(labels).forEach(function (k) {
      var t = node("text", { x: labels[k][0], y: labels[k][1], "text-anchor": labels[k][2], class: "quad-label" + (k === top ? " is-top" : "") });
      t.textContent = P[k].nome + " " + s[k] + "%";
    });
    return svg;
  }

  function axis(leftLabel, rightLabel, left, right) {
    var total = left + right || 1, pos = Math.round((right / total) * 100);
    return el("div", { class: "axis" }, [
      el("div", { class: "axis-labels" }, [el("span", { text: leftLabel + " " + left + "%" }), el("span", { text: rightLabel + " " + right + "%" })]),
      el("div", { class: "axis-track", "aria-hidden": "true" }, [el("span", { class: "axis-dot", style: "left:" + pos + "%" })])
    ]);
  }

  function list(title, items) {
    return el("div", { class: "res-block" }, [el("h4", { text: title }), el("ul", { class: "check-list" }, items.map(function (t) { return el("li", { text: t }); }))]);
  }

  /* ------------------------------------------------------------ resultado */
  function renderResult() {
    var s = score(), rk = ranking(s), top = rk[0], second = rk[1];
    var p = P[top];
    var empate = s[second] === s[top];
    var proximo = !empate && s[top] - s[second] <= 8;

    quiz.innerHTML = "";
    quiz.appendChild(el("div", { class: "quiz-card quiz-done" }, [
      el("p", { class: "quiz-count", text: "Teste concluído" }),
      el("p", { text: embutido ? "Seu resultado está logo abaixo. Depois de ler, clique em Continuar para terminar o cadastro." : "Seu resultado está logo abaixo." }),
      el("button", { type: "button", class: "btn btn-secondary", text: "Refazer o teste", onclick: function () { answers.fill(null); idx = 0; hideResult(); renderQuestion(true); } })
    ]));

    var box = document.getElementById("resultado-conteudo");
    box.innerHTML = "";
    var bars = el("ul", { class: "res-bars" }, rk.map(function (k) {
      return el("li", { class: k === top ? "is-top" : "" }, [
        el("span", { class: "res-bar-label", text: P[k].nome + " · " + P[k].papel }),
        el("span", { class: "res-bar-track", "aria-hidden": "true" }, [el("span", { style: "width:" + s[k] + "%" })]),
        el("span", { class: "res-bar-val", text: s[k] + "%" })
      ]);
    }));

    var titulo = empate ? "Seu perfil combina " + p.nome + " e " + P[second].nome : "Seu perfil predominante é " + p.nome;
    box.appendChild(el("div", { class: "result-head" }, [
      el("p", { class: "eyebrow", text: "Seu resultado" }),
      el("h2", { id: "res-title", tabindex: "-1", text: titulo }),
      el("p", { class: "tagline", text: p.papel + " · “" + p.lema + "”" })
    ]));

    box.appendChild(el("div", { class: "result-grid" }, [
      el("div", { class: "result-chart" }, [quadrantSVG(s)]),
      el("div", { class: "result-main" }, [
        el("p", { class: "lead", text: p.resumo }),
        (empate || proximo) ? el("p", { class: "note", text: "Você também tem traços fortes do perfil " + P[second].nome + " (" + P[second].papel.toLowerCase() + "). Leia as duas descrições: as duas combinam com você." }) : null,
        bars,
        el("div", { class: "axes" }, [
          axis("Razão", "Emoção", s.O + s.A, s.I + s.C),
          axis("Planejar e idealizar", "Agir e se relacionar", s.I + s.O, s.C + s.A)
        ])
      ])
    ]));

    box.appendChild(el("div", { class: "res-cols" }, [
      list("Pontos fortes", p.fortes),
      list("Pontos de atenção", p.atencao),
      list("O que te motiva", p.motiva)
    ]));
    box.appendChild(el("div", { class: "res-tips" }, [
      el("div", null, [el("h4", { text: "Para usar na entrevista" }), el("p", { text: p.dica })]),
      el("div", null, [el("h4", { text: "Para se desenvolver" }), el("p", { text: p.desenvolver })])
    ]));

    var outros = el("details", { class: "res-others" }, [el("summary", { class: "btn btn-secondary", text: "Conhecer os outros perfis" })]);
    rk.slice(1).forEach(function (k) {
      outros.appendChild(el("div", { class: "res-other" }, [
        el("h4", { text: P[k].nome + " · " + P[k].papel + " (" + s[k] + "%)" }), el("p", { text: P[k].resumo })
      ]));
    });
    box.appendChild(outros);

    var salvar = document.getElementById("salvar-perfil");
    if (!embutido) {
      box.appendChild(el("div", { class: "btn-row res-cta" }, [
        el("a", { class: "btn btn-primary", href: salvar ? "#salvar-perfil" : "banco-de-talentos.html#cadastro", text: "Salvar meu perfil no Banco de Talentos" })
      ]));
    }
    var qerr = document.getElementById("quiz-err"); if (qerr) qerr.textContent = "";

    // Liga o resultado ao formulário de cadastro (mesma página)
    var hidden = document.getElementById("perfil-respostas");
    if (hidden) {
      hidden.value = answers.join("");
      document.querySelectorAll("[data-perfil-block]").forEach(function (b) { b.hidden = false; });
      document.querySelectorAll("[data-perfil-missing]").forEach(function (b) { b.hidden = true; });
      document.querySelectorAll("[data-perfil-resumo]").forEach(function (b) { b.textContent = rk.map(function (k) { return P[k].nome + " " + s[k] + "%"; }).join(" · "); });
    }

    document.getElementById("resultado").hidden = false;
    if (salvar) salvar.hidden = false;
    var h = document.getElementById("res-title");
    h.scrollIntoView(); h.focus({ preventScroll: true });
  }

  function hideResult() {
    document.getElementById("resultado").hidden = true;
    var salvar = document.getElementById("salvar-perfil"); if (salvar) salvar.hidden = true;
    var hidden = document.getElementById("perfil-respostas");
    if (hidden) {
      hidden.value = "";
      document.querySelectorAll("[data-perfil-block]").forEach(function (b) { b.hidden = true; });
      document.querySelectorAll("[data-perfil-missing]").forEach(function (b) { b.hidden = false; });
    }
  }

  renderStart();
})();
