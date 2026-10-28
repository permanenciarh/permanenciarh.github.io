/**
 * Permanência RH — página de resultado da orientação de carreira (resultado.html#t=TOKEN)
 *
 * - Só funciona com o link liberado no painel; o token vai depois do "#" (não aparece em registros de servidor).
 * - Mostra só o primeiro nome, o texto do relatório e as barras de DISC/Big Five, conforme liberado pela equipe.
 * - O link tem prazo e pode ser fechado pela equipe a qualquer momento. Nada é salvo no navegador.
 */
(function () {
  "use strict";
  var C = window.PRH_CONFIG || {};
  var box = document.getElementById("resultado");
  if (!box || !window.PRH_ORI) return;
  var el = window.PRH_ORI.el;
  var token = (location.hash.match(/(?:^#|&)t=([0-9a-f]{64})/) || [])[1] || null;
  var lead = document.getElementById("rs-lead");

  function wa() { return "https://wa.me/" + (C.whatsapp || "5534992871582"); }
  function aviso(titulo, texto) {
    lead.textContent = "";
    box.innerHTML = "";
    box.appendChild(el("div", { class: "quiz-card" }, [
      el("h2", { class: "quiz-stem", tabindex: "-1", text: titulo }), el("p", { text: texto }),
      el("div", { class: "btn-row" }, [el("a", { class: "btn btn-secondary", href: wa(), target: "_blank", rel: "noopener", text: "Falar com a Permanência no WhatsApp" })])
    ]));
  }
  function rpc(nome, corpo) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, C.requestTimeoutMs || 25000) : null;
    return fetch(String(C.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/rpc/" + nome, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": C.supabaseAnonKey, "Authorization": "Bearer " + C.supabaseAnonKey },
      body: JSON.stringify(corpo), signal: ctrl ? ctrl.signal : undefined, referrerPolicy: "no-referrer", credentials: "omit"
    }).then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error("http_" + r.status); return r.json(); }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  if (!token) { aviso("Link incompleto", "Abra o relatório pelo link exato que você recebeu. Se ele não funcionar, peça um novo pelo WhatsApp."); return; }
  if (!C.supabaseUrl || !C.supabaseAnonKey) { aviso("Relatório indisponível", "O sistema está em manutenção. Tente de novo mais tarde."); return; }
  rpc("orientacao_resultado_abrir", { p_token: token }).then(function (d) {
    if (!d || d.estado === "invalido") { aviso("Link indisponível", "Este link não existe mais ou foi fechado. Fale com a Permanência para receber um novo."); return; }
    if (d.estado === "expirado") { aviso("Link expirado", "O prazo para ver o relatório por este link terminou em " + new Date(d.expira_em).toLocaleDateString("pt-BR") + ". Peça um novo link pelo WhatsApp."); return; }
    lead.textContent = "Olá, " + d.nome + "! Este é o relatório da sua orientação de carreira. Ele fica disponível por este link até " + new Date(d.expira_em).toLocaleDateString("pt-BR") + ".";
    box.innerHTML = "";
    box.appendChild(el("div", { class: "ori-acoes no-print" }, [el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Imprimir / salvar em PDF", onclick: function () { window.print(); } })]));
    box.appendChild(window.PRH_ORI.render(d));
  }).catch(function () { aviso("Não foi possível carregar", "Verifique sua conexão com a internet e recarregue a página."); });
})();
