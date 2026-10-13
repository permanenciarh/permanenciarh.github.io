/**
 * Permanência RH — formulário do Banco de Talentos (3 etapas)
 *
 * Regras importantes:
 *  - NÃO salva dados em localStorage/sessionStorage.
 *  - Só mostra "Cadastro recebido" depois que o servidor confirma ({ ok: true }).
 *  - Sem endpoint configurado (PRH_CONFIG.cadastroEndpoint = null), mostra aviso
 *    de demonstração e não envia nada.
 */
(function () {
  "use strict";

  var form = document.getElementById("form-cadastro");
  if (!form || !window.PRH) return;

  var CONFIG = window.PRH_CONFIG || {};
  var steps = Array.prototype.slice.call(form.querySelectorAll("fieldset[data-step]"));
  var labels = document.querySelectorAll("[data-step-label]");
  var btnBack = document.getElementById("btn-voltar");
  var btnNext = document.getElementById("btn-avancar");
  var btnSend = document.getElementById("btn-enviar");
  var summary = document.getElementById("form-errors");
  var summaryList = document.getElementById("form-errors-list");
  var statusBox = document.getElementById("form-status");
  var current = 0;

  window.PRH.attachLiveValidation(form);

  // Contador de caracteres do resumo
  var resumo = document.getElementById("resumo");
  var counter = document.querySelector('[data-counter-for="resumo"]');
  if (resumo && counter) resumo.addEventListener("input", function () { counter.textContent = resumo.value.length; });

  function showStep(i, focus) {
    current = i;
    steps.forEach(function (s, idx) { s.hidden = idx !== i; });
    labels.forEach(function (l, idx) {
      if (idx === i) l.setAttribute("aria-current", "step"); else l.removeAttribute("aria-current");
      l.classList.toggle("done", idx < i);
    });
    btnBack.hidden = i === 0;
    btnNext.hidden = i === steps.length - 1;
    btnSend.hidden = i !== steps.length - 1;
    if (focus) {
      var legend = steps[i].querySelector("legend");
      legend.setAttribute("tabindex", "-1");
      legend.focus();
    }
  }

  function showErrors(errors) {
    if (!errors.length) { summary.hidden = true; summaryList.innerHTML = ""; return; }
    summaryList.innerHTML = "";
    errors.forEach(function (er) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + (er.field.id || er.field.name);
      a.textContent = er.msg;
      a.addEventListener("click", function (e) { e.preventDefault(); er.field.focus(); });
      li.appendChild(a);
      summaryList.appendChild(li);
    });
    summary.hidden = false;
    summary.focus();
  }

  btnNext.addEventListener("click", function () {
    var errors = window.PRH.validateContainer(steps[current]);
    showErrors(errors);
    if (!errors.length) showStep(current + 1, true);
  });
  btnBack.addEventListener("click", function () { showErrors([]); showStep(current - 1, true); });

  function setLoading(on) {
    btnSend.disabled = on;
    btnBack.disabled = on;
    form.setAttribute("aria-busy", String(on));
    btnSend.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span> Enviando…' : "Enviar cadastro";
  }

  function panel(kind, title, html) {
    statusBox.innerHTML = '<div class="status-panel ' + kind + '"><h3 tabindex="-1">' + title + "</h3>" + html + "</div>";
    statusBox.querySelector("h3").focus();
  }

  function collect() {
    var fd = new FormData(form);
    // Normaliza os grupos de múltipla escolha
    fd.delete("tipo");
    form.querySelectorAll('input[name="tipo"]:checked').forEach(function (c) { fd.append("tipo", c.value); });
    // Autorizações registradas explicitamente como true/false, com versão do aviso
    ["ciencia", "compartilhar", "novidades"].forEach(function (k) { fd.set(k, document.getElementById(k).checked ? "true" : "false"); });
    fd.set("versao_aviso_privacidade", "1.0");
    // Perfil comportamental: só segue se houver respostas E a pessoa autorizou incluir
    var resp = document.getElementById("perfil-respostas");
    var incl = document.getElementById("incluir-perfil");
    fd.delete("incluir_perfil");
    if (resp && resp.value && incl && incl.checked) fd.set("incluir_perfil", "true");
    else fd.delete("perfil_respostas");
    var file = document.getElementById("curriculo-arquivo");
    if (!file.files.length) fd.delete("curriculo_arquivo");
    return fd;
  }

  function clearForm() {
    form.reset();
    if (counter) counter.textContent = "0";
    showErrors([]);
    showStep(0, true);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    // Enter em uma etapa intermediária avança em vez de enviar
    if (current < steps.length - 1) { btnNext.click(); return; }
    // Revalida todas as etapas antes do envio
    var all = [];
    steps.forEach(function (s) { all = all.concat(window.PRH.validateContainer(s)); });
    if (all.length) {
      var firstStep = steps.findIndex(function (s) { return s.contains(all[0].field); });
      if (firstStep !== current) showStep(firstStep, false);
      showErrors(all.filter(function (er) { return steps[firstStep].contains(er.field); }));
      return;
    }
    showErrors([]);

    // ---------- Sem backend: modo demonstração (nada é enviado nem salvo)
    if (!CONFIG.cadastroEndpoint) {
      panel("is-demo", "Cadastro online em implantação",
        "<p>Este formulário está em modo de demonstração. Seus dados foram conferidos, mas <strong>não foram enviados nem salvos</strong>.</p>" +
        "<p>O Banco de Talentos será aberto em breve. Acompanhe a Permanência RH no LinkedIn e no Instagram <strong>@permanenciarh</strong> para saber quando.</p>" +
        '<p class="small muted">Para administradores: preencha <code>supabaseUrl</code> e <code>supabaseAnonKey</code> em <code>js/config.js</code> para ativar o envio real (veja o README).</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-secondary" id="btn-limpar">Apagar dados preenchidos</button></div>');
      document.getElementById("btn-limpar").addEventListener("click", function () { clearForm(); statusBox.innerHTML = ""; });
      return;
    }

    // ---------- Envio real
    setLoading(true);
    statusBox.innerHTML = '<p class="small">Enviando seu cadastro…</p>';
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.requestTimeoutMs || 20000);

    fetch(CONFIG.cadastroEndpoint, { method: "POST", body: collect(), signal: ctrl ? ctrl.signal : undefined, credentials: "omit" })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) { return { res: res, json: json }; });
      })
      .then(function (r) {
        clearTimeout(timer);
        setLoading(false);
        if (r.res.ok && r.json && r.json.ok === true) {
          form.reset();
          form.hidden = true;
          document.querySelector(".progress").hidden = true;
          panel("is-ok", "Cadastro recebido!",
            "<p>Agradecemos seu interesse na Permanência RH. Seu perfil será tratado conforme nosso aviso de privacidade e poderá ser considerado para oportunidades compatíveis, de acordo com suas preferências e as autorizações aplicáveis.</p>");
          return;
        }
        var msg = r.res.status === 429 ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." :
                  r.res.status === 413 ? "O arquivo do currículo é grande demais. Envie um PDF de até " + (CONFIG.maxUploadMB || 5) + " MB." :
                  r.res.status === 400 ? "Alguns dados não foram aceitos. Revise o formulário e tente novamente." :
                  "Não foi possível salvar seu cadastro agora. Tente novamente em alguns minutos.";
        panel("", "Cadastro não enviado", "<p>" + msg + "</p><p class=\"small muted\">Seus dados continuam no formulário.</p>");
      })
      .catch(function () {
        clearTimeout(timer);
        setLoading(false);
        panel("", "Cadastro não enviado", "<p>Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.</p><p class=\"small muted\">Seus dados continuam no formulário.</p>");
      });
  });

  showStep(0, false);
})();
