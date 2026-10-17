/**
 * Permanência RH — formulário do Banco de Talentos
 * Banco de Talentos: 5 etapas (importar, dados, preferências, teste de perfil, envio).
 * Página do teste: 4 etapas (o teste já foi feito acima do formulário).
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
  var importado = null; // arquivo PDF lido para preencher o cadastro (fica só na memória)
  var CAMPOS = ["nome", "email", "telefone", "cpf", "cnh", "linkedin", "cidade", "estado", "cargo", "area", "resumo", "experiencia", "escolaridade", "competencias", "idiomas"];

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
    btnNext.hidden = i === 0 || i === steps.length - 1;
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

  /* ---------------- Etapa 1: importar PDF do LinkedIn / currículo ---------------- */
  var inputImport = document.getElementById("import-arquivo");
  var importStatus = document.getElementById("import-status");
  function carregarLeitor() {
    if (window.pdfjsLib && window.PRH_IMPORT) return Promise.resolve();
    function js(src) { return new Promise(function (ok, erro) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = erro; document.head.appendChild(s); }); }
    return (window.pdfjsLib ? Promise.resolve() : js("js/vendor/pdf.min.js")).then(function () { return window.PRH_IMPORT ? null : js("js/importar.js"); });
  }
  function aplicarCampos(campos) {
    var n = 0;
    CAMPOS.forEach(function (k) {
      var el = document.getElementById(k);
      if (!el || !campos[k]) return;
      if (el.tagName === "SELECT") {
        var ok = Array.prototype.some.call(el.options, function (o) { return (o.value || o.text) === campos[k]; });
        if (!ok) return;
      }
      el.value = campos[k];
      el.classList.add("auto-filled");
      var lbl = document.querySelector('label[for="' + k + '"]');
      if (lbl && !lbl.querySelector(".auto-tag")) { var t = document.createElement("span"); t.className = "auto-tag"; t.textContent = "preenchido"; lbl.appendChild(t); }
      n++;
    });
    if (counter && resumo) counter.textContent = resumo.value.length;
    toggleCnh();
    if (cpfEl && cpfEl.value) cpfEl.dispatchEvent(new Event("input"));
    return n;
  }
  if (inputImport) {
    inputImport.addEventListener("change", function () {
      var f = inputImport.files && inputImport.files[0];
      if (!f) return;
      importStatus.innerHTML = '<p class="small"><span class="spinner" aria-hidden="true"></span> Lendo seu PDF…</p>';
      carregarLeitor().then(function () { return window.PRH_IMPORT.lerPdf(f); }).then(function (r) {
        var n = aplicarCampos(r.campos);
        importado = f;
        var box = document.getElementById("usar-importado-box");
        if (box && f.size <= (CONFIG.maxUploadMB || 5) * 1024 * 1024) { box.hidden = false; document.getElementById("nome-importado").textContent = f.name; document.getElementById("campo-arquivo").hidden = true; }
        document.getElementById("auto-aviso").hidden = n === 0;
        importStatus.innerHTML = '<p class="small ok-msg">' + (n ? "Pronto! Preenchemos " + n + " campos a partir do seu " + (r.origem === "linkedin" ? "LinkedIn" : "currículo") + "." : "Não conseguimos ler os dados deste PDF. Preencha manualmente na próxima etapa.") + "</p>";
        showStep(1, true);
      }).catch(function (e) {
        var m = e && e.message;
        importStatus.innerHTML = '<p class="error-msg">' + (m === "formato" ? "Envie um arquivo em PDF." : m === "tamanho" ? "O arquivo tem mais de 10 MB." : m === "sem_texto" ? "Este PDF parece ser uma imagem escaneada e não tem texto para ler. Preencha manualmente." : "Não foi possível ler este PDF. Tente outro arquivo ou preencha manualmente.") + "</p>";
      });
      inputImport.value = "";
    });
  }
  var btnManual = document.getElementById("btn-manual");
  if (btnManual) btnManual.addEventListener("click", function () { showStep(1, true); });

  /* ---------------- CPF e CNH ---------------- */
  var cpfEl = document.getElementById("cpf");
  if (cpfEl) cpfEl.addEventListener("input", function () {
    var d = cpfEl.value.replace(/\D/g, "").slice(0, 11);
    cpfEl.value = d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  });
  var cnhEl = document.getElementById("cnh");
  function toggleCnh() {
    var tem = cnhEl && cnhEl.value && cnhEl.value !== "nao_possui";
    document.querySelectorAll("[data-cnh-extra]").forEach(function (el) { el.hidden = !tem; });
    if (!tem) { var e = document.getElementById("cnh-ear"); if (e) e.checked = false; }
  }
  if (cnhEl) cnhEl.addEventListener("change", toggleCnh);

  /* ---------------- Etapa 3: diversidade (opcional) ---------------- */
  var divPcd = document.getElementById("div-pcd");
  if (divPcd) divPcd.addEventListener("change", function () {
    document.querySelectorAll("[data-pcd-extra]").forEach(function (el) { el.hidden = divPcd.value !== "sim"; });
  });
  function respostasDiversidade() {
    return Array.prototype.some.call(form.querySelectorAll('[name^="div_"]'), function (el) { return el.name !== "div_consent" && el.value && el.value.trim(); });
  }
  function validarDiversidade() {
    var c = document.getElementById("div-consent");
    if (!c) return [];
    var msg = respostasDiversidade() && !c.checked ? c.getAttribute("data-msg") : "";
    window.PRH.setError(c, msg);
    if (msg) { document.getElementById("di-box").open = true; return [{ field: c, msg: msg }]; }
    return [];
  }

  /* ---------------- Vaga (candidatura a partir da página de vagas) ---------------- */
  (function () {
    var m = location.search.match(/[?&]vaga=([0-9a-f-]{36})/i);
    if (!m || !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return;
    fetch(CONFIG.supabaseUrl + "/rest/v1/vagas?select=id,titulo,cidade,uf,modalidade&status=eq.aberta&id=eq." + m[1], {
      headers: { apikey: CONFIG.supabaseAnonKey, Authorization: "Bearer " + CONFIG.supabaseAnonKey }, credentials: "omit"
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (!rows || !rows.length) return;
      var v = rows[0];
      document.getElementById("vaga-id").value = v.id;
      document.getElementById("vaga-banner-titulo").textContent = v.titulo;
      document.getElementById("vaga-banner-local").textContent = [v.cidade && (v.cidade + (v.uf ? "/" + v.uf : "")), ({ presencial: "Presencial", hibrido: "Híbrido", remoto: "Remoto", todas: "" })[v.modalidade]].filter(Boolean).join(" · ");
      document.getElementById("vaga-banner").hidden = false;
      btnSend.textContent = "Enviar candidatura";
    }).catch(function () { /* sem vaga: segue como cadastro normal */ });
  })();

  /* ---------------- Teste de perfil (obrigatório) ---------------- */
  function testeFeito() {
    var r = document.getElementById("perfil-respostas");
    return !!(r && /^[ICOA]{25}$/.test(r.value));
  }
  function validarTeste(step) {
    var q = step && step.querySelector("#quiz");
    if (!q || testeFeito()) return [];
    var err = document.getElementById("quiz-err");
    var msg = "Responda o teste de perfil até o fim para continuar o cadastro.";
    if (err) err.textContent = msg;
    var alvo = q.querySelector("button, input") || q;
    return [{ field: alvo, msg: msg }];
  }

  btnNext.addEventListener("click", function () {
    var errors = window.PRH.validateContainer(steps[current]);
    if (current === 2) errors = errors.concat(validarDiversidade());
    errors = errors.concat(validarTeste(steps[current]));
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
    fd.set("versao_aviso_privacidade", "1.3");
    // Perfil comportamental: obrigatório; segue sempre que as 25 respostas estiverem completas
    var resp = document.getElementById("perfil-respostas");
    fd.delete("incluir_perfil");
    // As escolhas de cada pergunta do teste (q0…q24) não vão para o servidor; só o código das 25 respostas
    Array.from(fd.keys()).forEach(function (k) { if (/^q\d+$/.test(k)) fd.delete(k); });
    if (resp && /^[ICOA]{25}$/.test(resp.value)) fd.set("incluir_perfil", "true");
    else fd.delete("perfil_respostas");
    var file = document.getElementById("curriculo-arquivo");
    var usar = document.getElementById("usar-importado");
    if (!file.files.length) fd.delete("curriculo_arquivo");
    if (!file.files.length && importado && usar && usar.checked && !document.getElementById("usar-importado-box").hidden) fd.set("curriculo_arquivo", importado, importado.name);
    // Diversidade: só vai se a pessoa autorizou
    var dc = document.getElementById("div-consent");
    if (dc && dc.checked && respostasDiversidade()) fd.set("div_consent", "true");
    else Array.from(fd.keys()).filter(function (k) { return k.indexOf("div_") === 0; }).forEach(function (k) { fd.delete(k); });
    if (!fd.get("vaga_id")) fd.delete("vaga_id");
    var cpfDig = String(fd.get("cpf") || "").replace(/\D/g, "");
    if (cpfDig) fd.set("cpf", cpfDig); else fd.delete("cpf");
    fd.set("cnh_ear", document.getElementById("cnh-ear") && document.getElementById("cnh-ear").checked ? "true" : "false");
    return fd;
  }

  function clearForm() {
    form.reset();
    importado = null;
    form.querySelectorAll(".auto-filled").forEach(function (el) { el.classList.remove("auto-filled"); });
    form.querySelectorAll(".auto-tag").forEach(function (el) { el.remove(); });
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
    all = all.concat(validarDiversidade());
    steps.forEach(function (s) { all = all.concat(validarTeste(s)); });
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
          var vaga = document.getElementById("vaga-id").value;
          panel("is-ok", vaga ? "Candidatura recebida!" : "Cadastro recebido!",
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
