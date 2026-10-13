/**
 * Permanência RH — página pública de vagas.
 * Lê somente vagas com status "aberta" (regra aplicada no banco) e só as colunas públicas.
 */
(function () {
  "use strict";
  var C = window.PRH_CONFIG || {};
  var lista = document.getElementById("vaga-list");
  if (!lista) return;

  var MODAL = { presencial: "Presencial", hibrido: "Híbrido", remoto: "Remoto", todas: "Presencial, híbrido ou remoto" };
  var TIPOS = { clt: "CLT", estagio: "Estágio", aprendizagem: "Jovem aprendiz", temporario: "Temporário", pj: "PJ", freelancer: "Freelancer" };
  var AFIRM = { pcd: "Vaga afirmativa · PcD", mulheres: "Vaga afirmativa · Mulheres", pessoas_negras: "Vaga afirmativa · Pessoas negras", lgbtqia: "Vaga afirmativa · LGBTQIA+", pessoas_50_mais: "Vaga afirmativa · 50+", pessoas_trans: "Vaga afirmativa · Pessoas trans" };
  var COLS = "id,codigo,titulo,empresa_exibicao,area,cidade,uf,modalidade,tipo,descricao,requisitos,beneficios,faixa_salarial,afirmativa,publicada_em,encerra_em";
  var vagas = [];

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k]; else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function data(s) { return s ? new Date(s).toLocaleDateString("pt-BR") : ""; }

  function vazio(msg) {
    lista.innerHTML = "";
    lista.appendChild(el("div", { class: "vaga-vazia" }, [
      el("p", { text: msg || "Nenhuma vaga aberta no momento." }),
      el("p", { class: "muted small", text: "Cadastre-se no Banco de Talentos para ser considerado nas próximas oportunidades." }),
      el("a", { class: "btn btn-primary", href: "banco-de-talentos.html#cadastro", text: "Cadastrar meu perfil" })
    ]));
  }

  function card(v) {
    var link = location.origin + location.pathname + "#" + v.codigo;
    var detalhe = el("div", { class: "vaga-detalhe", id: "det-" + v.codigo, hidden: "" }, [
      el("div", null, [el("h4", { text: "Sobre a vaga" }), el("p", { text: v.descricao })]),
      v.requisitos ? el("div", null, [el("h4", { text: "Requisitos" }), el("p", { text: v.requisitos })]) : null,
      v.beneficios ? el("div", null, [el("h4", { text: "Benefícios" }), el("p", { text: v.beneficios })]) : null,
      v.faixa_salarial ? el("p", null, [el("strong", { text: "Faixa salarial: " }), v.faixa_salarial]) : null,
      v.encerra_em ? el("p", { class: "muted", text: "Inscrições até " + data(v.encerra_em + "T12:00:00") }) : null
    ]);
    var btnVer = el("button", { type: "button", class: "btn btn-secondary", "aria-expanded": "false", "aria-controls": "det-" + v.codigo, text: "Ver detalhes" });
    btnVer.addEventListener("click", function () {
      var aberto = btnVer.getAttribute("aria-expanded") === "true";
      btnVer.setAttribute("aria-expanded", String(!aberto)); detalhe.hidden = aberto; btnVer.textContent = aberto ? "Ver detalhes" : "Fechar detalhes";
    });
    var copiado = el("span", { class: "small muted", role: "status" });
    var btnLink = el("button", { type: "button", class: "btn-link", text: "Copiar link da vaga", onclick: function () {
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { copiado.textContent = " Link copiado."; }, function () { copiado.textContent = " " + link; });
      else copiado.textContent = " " + link;
    } });
    return el("article", { class: "vaga-card", id: v.codigo }, [
      v.afirmativa && AFIRM[v.afirmativa] ? el("span", { class: "badge-afirmativa", text: AFIRM[v.afirmativa] }) : null,
      el("h3", { text: v.titulo }),
      el("div", { class: "vaga-meta" }, [
        el("span", { text: v.empresa_exibicao }),
        v.cidade ? el("span", { text: v.cidade + (v.uf ? "/" + v.uf : "") }) : null,
        el("span", { text: MODAL[v.modalidade] || v.modalidade }),
        el("span", { text: TIPOS[v.tipo] || v.tipo }),
        v.publicada_em ? el("span", { text: "Publicada em " + data(v.publicada_em) }) : null
      ]),
      detalhe,
      el("div", { class: "btn-row" }, [
        el("a", { class: "btn btn-primary", href: "banco-de-talentos.html?vaga=" + v.id + "#cadastro", text: "Candidatar-se" }),
        btnVer
      ]),
      el("p", { class: "small" }, [btnLink, copiado])
    ]);
  }

  function filtrar() {
    var q = (document.getElementById("vf-busca").value || "").toLowerCase().trim();
    var area = document.getElementById("vf-area").value, mod = document.getElementById("vf-modalidade").value, uf = document.getElementById("vf-uf").value;
    var res = vagas.filter(function (v) {
      if (area && v.area !== area) return false;
      if (mod && v.modalidade !== mod && v.modalidade !== "todas") return false;
      if (uf && v.uf !== uf && v.modalidade !== "remoto") return false;
      if (q && (v.titulo + " " + v.descricao + " " + (v.requisitos || "")).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    lista.innerHTML = "";
    document.getElementById("vagas-contagem").textContent = vagas.length ? res.length + (res.length === 1 ? " vaga encontrada" : " vagas encontradas") : "";
    if (!vagas.length) return vazio();
    if (!res.length) { lista.appendChild(el("p", { class: "muted", text: "Nenhuma vaga com esses filtros." })); return; }
    res.forEach(function (v) { lista.appendChild(card(v)); });
    abrirDoLink();
  }

  function abrirDoLink() {
    var cod = (location.hash || "").replace("#", "");
    if (!/^VAGA-/.test(cod)) return;
    var c = document.getElementById(cod);
    if (!c) return;
    var b = c.querySelector("[aria-controls]"); if (b && b.getAttribute("aria-expanded") === "false") b.click();
    c.scrollIntoView();
  }

  ["vf-busca", "vf-area", "vf-modalidade", "vf-uf"].forEach(function (id) {
    var e = document.getElementById(id); e.addEventListener(id === "vf-busca" ? "input" : "change", filtrar);
  });
  document.getElementById("vagas-filtros").addEventListener("submit", function (e) { e.preventDefault(); });

  if (!C.supabaseUrl || !C.supabaseAnonKey) return vazio();
  fetch(C.supabaseUrl + "/rest/v1/vagas?select=" + COLS + "&status=eq.aberta&order=publicada_em.desc", {
    headers: { apikey: C.supabaseAnonKey, Authorization: "Bearer " + C.supabaseAnonKey }, credentials: "omit"
  }).then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
    .then(function (rows) {
      var hoje = new Date().toISOString().slice(0, 10);
      vagas = (rows || []).filter(function (v) { return !v.encerra_em || v.encerra_em >= hoje; });
      filtrar();
    })
    .catch(function () { vazio("Não foi possível carregar as vagas agora. Tente novamente em instantes."); });
})();
