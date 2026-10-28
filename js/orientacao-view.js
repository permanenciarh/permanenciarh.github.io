/**
 * Permanência RH — relatório de orientação de carreira (parte voltada à pessoa).
 * Usado em dois lugares com o mesmo desenho: no painel (visualizar/imprimir PDF) e na página
 * de resultado por link (resultado.html). Todo texto entra por textContent.
 *
 * PRH_ORI.render(d, opcoes) devolve um <article>. d: { nome, data, objetivo, sintese, pontos_fortes,
 * pontos_desenvolver, areas_exploracao, plano_30, plano_60, plano_90, proximos_passos, responsavel,
 * disc: {D,I,S,C} (somas 5 a 25) | null, bigfive: {O,C,E,A,N} (somas 6 a 30) | null }
 */
(function () {
  "use strict";
  var TX = window.PRH_AVAL_TEXTOS || {};
  var DISC_L = ["D", "I", "S", "C"], B5_L = ["O", "C", "E", "A", "N"];

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtData(s) { return s ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("pt-BR") : ""; }
  function fmtM(x, n) { return x.toFixed(n).replace(".", ","); }
  function ha(t) { return t != null && String(t).trim() !== ""; }

  function barras(itens) {
    return el("ul", { class: "res-bars ori-bars" }, itens.map(function (i) {
      return el("li", { class: i.top ? "is-top" : "" }, [
        el("span", { class: "res-bar-label", text: i.label }),
        el("span", { class: "res-bar-track", "aria-hidden": "true" }, [el("span", { style: "width:" + Math.round(i.media / 5 * 100) + "%" })]),
        el("span", { class: "res-bar-val", text: fmtM(i.media, i.casas) })
      ]);
    }));
  }
  function tabela(cab, linhas) {
    return el("table", { class: "ori-table" }, [
      el("thead", null, [el("tr", null, cab.map(function (t) { return el("th", { scope: "col", text: t }); }))]),
      el("tbody", null, linhas.map(function (l) { return el("tr", null, l.map(function (t) { return el("td", { text: t }); })); }))
    ]);
  }
  function maiusc(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function blocoTestes(d) {
    var out = [];
    if (d.disc && TX.disc) {
      var md = {}; DISC_L.forEach(function (k) { md[k] = Number(d.disc[k]) / 5; });
      var maxD = Math.max.apply(null, DISC_L.map(function (k) { return md[k]; }));
      out.push(el("h3", { text: "Seu estilo de comportamento no trabalho (DISC exploratório)" }));
      out.push(barras(DISC_L.map(function (k) { return { label: k + " · " + TX.disc[k].nome, media: md[k], casas: 1, top: md[k] === maxD }; })));
      out.push(tabela(["Dimensão", "O que as afirmações cobrem"], DISC_L.map(function (k) { return [k + " · " + TX.disc[k].nome, maiusc(TX.disc[k].foco)]; })));
    }
    if (d.bigfive && TX.bigfive) {
      var mb = {}; B5_L.forEach(function (k) { mb[k] = Number(d.bigfive[k]) / 6; });
      out.push(el("h3", { text: "Seu jeito de ser e de agir no trabalho (Big Five exploratório)" }));
      out.push(barras(B5_L.map(function (k) { return { label: k + " · " + TX.bigfive[k].nome, media: mb[k], casas: 2 }; })));
      out.push(tabela(["Dimensão", "O que as afirmações cobrem"], B5_L.map(function (k) { return [k + " · " + TX.bigfive[k].nome, maiusc(TX.bigfive[k].cobre)]; })));
    }
    if (out.length) {
      out.push(el("p", { class: "ori-nota-teste", text: "As barras mostram o quanto você concordou com cada grupo de afirmações, de 1 a 5, neste momento. Não existe resultado bom ou ruim, e eles não definem quem você é nem quais profissões servem para você. DISC e Big Five aqui são instrumentos exploratórios, sem validação psicométrica: não são teste psicológico e não dão diagnóstico. Use-os como ponto de partida para a nossa conversa." }));
    }
    return out;
  }

  function render(d, opcoes) {
    opcoes = opcoes || {};
    var n = 0;
    function secao(t) { n++; return el("h2", { text: n + ". " + t }); }
    function texto(t) { return el("p", { class: "ori-texto", text: t }); }
    var art = el("article", { class: "ori-doc" });
    art.appendChild(el("header", { class: "ori-head" }, [
      el("div", null, [el("p", { class: "ori-marca", text: "Permanência · Consultoria em RH" }), el("h1", { text: "Relatório de orientação de carreira" })]),
      el("p", { class: "ori-conf", text: "Confidencial · " + fmtData(d.data || new Date().toISOString()) })
    ]));
    art.appendChild(el("p", { class: "ori-para" }, ["Para: ", el("strong", { text: d.nome || "" })]));
    if (ha(d.objetivo)) { art.appendChild(secao("O que você busca")); art.appendChild(texto(d.objetivo)); }
    if (ha(d.sintese)) { art.appendChild(secao("O que observamos juntos")); art.appendChild(texto(d.sintese)); }
    if (ha(d.pontos_fortes) || ha(d.pontos_desenvolver)) {
      art.appendChild(secao("Pontos fortes e pontos a desenvolver"));
      art.appendChild(el("div", { class: "ori-cols" }, [
        el("div", null, [el("h3", { text: "Pontos fortes" }), texto(d.pontos_fortes || "—")]),
        el("div", null, [el("h3", { text: "Pontos a desenvolver" }), texto(d.pontos_desenvolver || "—")])
      ]));
    }
    if (ha(d.areas_exploracao)) { art.appendChild(secao("Caminhos para explorar")); art.appendChild(texto(d.areas_exploracao)); }
    var testes = blocoTestes(d);
    if (testes.length) { art.appendChild(secao("Seus questionários")); testes.forEach(function (t) { art.appendChild(t); }); }
    if (ha(d.plano_30) || ha(d.plano_60) || ha(d.plano_90)) {
      art.appendChild(secao("Seu plano de 90 dias"));
      art.appendChild(el("div", { class: "ori-plano" }, [["Primeiros 30 dias", d.plano_30], ["De 31 a 60 dias", d.plano_60], ["De 61 a 90 dias", d.plano_90]].map(function (p) {
        return el("div", { class: "ori-passo" }, [el("h3", { text: p[0] }), texto(ha(p[1]) ? p[1] : "—")]);
      })));
    }
    if (ha(d.proximos_passos)) { art.appendChild(secao("Próximos passos")); art.appendChild(texto(d.proximos_passos)); }
    art.appendChild(el("p", { class: "ori-nota", text: "A orientação de carreira apoia a sua reflexão e a sua tomada de decisão; ela não garante emprego, promoção ou resultado. Este documento é pessoal e confidencial. Você pode pedir a correção ou a exclusão dos seus dados a qualquer momento, pelo WhatsApp da Permanência RH." }));
    if (ha(d.responsavel) || opcoes.assinatura) {
      art.appendChild(el("div", { class: "ori-assinatura" }, [el("span", { class: "ori-linha" }), el("p", { text: d.responsavel || "" }), el("p", { class: "small", text: "Permanência · Consultoria em RH · " + fmtData(d.data || new Date().toISOString()) })]));
    }
    return art;
  }

  window.PRH_ORI = { render: render, el: el };
})();
