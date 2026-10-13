/**
 * Permanência RH — comportamentos comuns a todas as páginas
 *  1. Menu móvel
 *  2. Navegação de página única (somente na versão "artifact", quando há [data-page])
 *  3. Validação de formulários (funções reutilizadas por cadastro.js)
 *  4. Formulário de contato empresarial -> mensagem para WhatsApp
 *  5. Conteúdos: filtro por categoria e "Ler conteúdo"
 */
(function () {
  "use strict";

  var CONFIG = window.PRH_CONFIG || {};

  /* ------------------------------------------------------------------ 1. Menu móvel */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("menu-principal");
  function closeMenu() {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
      if (!open) { var first = nav.querySelector("a"); if (first) first.focus(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) { closeMenu(); toggle.focus(); }
    });
  }

  /* ------------------------------------------------------------------ 2. Página única */
  var pages = document.querySelectorAll("[data-page]");
  var spa = pages.length > 1;

  function pageOf(el) { var p = el && el.closest ? el.closest("[data-page]") : null; return p ? p.getAttribute("data-page") : null; }

  function route(slug, anchor, focusMain) {
    var target = document.querySelector('[data-page="' + slug + '"]');
    if (!target) return false;
    pages.forEach(function (p) { p.hidden = p !== target; });
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === slug) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = target.getAttribute("data-title") || document.title;
    closeMenu();
    var el = anchor ? document.getElementById(anchor) : null;
    if (el) { el.scrollIntoView(); }
    else {
      window.scrollTo(0, 0);
      if (focusMain) { var main = document.getElementById("conteudo"); if (main) main.focus({ preventScroll: true }); }
    }
    return true;
  }

  function routeFromHash() {
    var h = (location.hash || "").replace("#", "");
    if (!h) return route("index");
    if (document.querySelector('[data-page="' + h + '"]')) return route(h);
    var el = document.getElementById(h);
    if (el && pageOf(el)) return route(pageOf(el), h);
    route("index");
  }

  if (spa) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank") return;
      var href = a.getAttribute("href");
      var m = href.match(/^([a-z0-9-]+)\.html(?:#([\w-]+))?$/);
      var slug, anchor;
      if (m) { slug = m[1]; anchor = m[2]; }
      else if (/^#[\w-]+$/.test(href)) {
        anchor = href.slice(1);
        var el = document.getElementById(anchor);
        slug = pageOf(el);
        if (!slug) return; // âncora fora das páginas (ex.: #conteudo)
      } else return;
      e.preventDefault();
      if (route(slug, anchor, true)) {
        try { history.pushState(null, "", "#" + (anchor || slug)); } catch (err) { /* ambiente sem history */ }
        if (anchor && anchor.indexOf("art-") === 0) openArticle(anchor);
      }
    });
    window.addEventListener("popstate", routeFromHash);
    window.addEventListener("hashchange", routeFromHash);
    routeFromHash();
  }

  /* ------------------------------------------------------------------ 3. Validação */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function labelText(field) {
    var id = field.id;
    var lbl = id ? document.querySelector('label[for="' + id + '"]') : null;
    var txt = lbl ? lbl.childNodes[0].textContent : field.name;
    return (txt || "").replace("*", "").trim();
  }

  /** Retorna mensagem de erro ou "" se válido. */
  function checkField(field) {
    var v = (field.value || "").trim();
    var name = labelText(field);
    if (field.type === "checkbox") {
      return field.required && !field.checked ? (field.getAttribute("data-msg") || "Marque esta opção para continuar.") : "";
    }
    if (field.type === "file") {
      if (!field.files || !field.files.length) return "";
      var f = field.files[0];
      var max = (CONFIG.maxUploadMB || 5) * 1024 * 1024;
      if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) return "Envie o currículo em formato PDF.";
      if (f.size > max) return "O arquivo tem mais de " + (CONFIG.maxUploadMB || 5) + " MB. Reduza o tamanho e tente de novo.";
      return "";
    }
    if (field.required && !v) return "Preencha o campo " + name + ".";
    if (!v) return "";
    if (field.type === "email" && !EMAIL_RE.test(v)) return "Informe um e-mail válido, como nome@exemplo.com.br.";
    if (field.type === "url" && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(v)) return "Informe um link completo, começando com https://";
    if (field.type === "tel") {
      var d = v.replace(/\D/g, "");
      if (d.length < 10 || d.length > 13) return "Informe o telefone com DDD, por exemplo (34) 99999-9999.";
    }
    var min = parseInt(field.getAttribute("minlength") || "0", 10);
    if (min && v.length < min) return "O campo " + name + " precisa ter pelo menos " + min + " caracteres.";
    return "";
  }

  function setError(field, msg) {
    var errEl = document.getElementById((field.id || field.name) + "-err");
    if (errEl) errEl.textContent = msg;
    if (field.type !== "radio" && field.type !== "checkbox" || field.required) {
      if (msg) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
    }
  }

  /** Valida os campos dentro de um container. Retorna [{field, msg}]. */
  function validateContainer(container) {
    var errors = [];
    container.querySelectorAll("input, select, textarea").forEach(function (f) {
      if (f.type === "radio" || (f.type === "checkbox" && !f.id) || f.id === "website") return; // grupos tratados abaixo
      var msg = checkField(f);
      setError(f, msg);
      if (msg) errors.push({ field: f, msg: msg });
    });
    // Grupos obrigatórios (radio / checkbox sem id): role="group" com * no rótulo
    container.querySelectorAll('[role="group"]').forEach(function (g) {
      var inputs = g.querySelectorAll("input");
      if (!inputs.length) return;
      var name = inputs[0].name;
      var any = Array.prototype.some.call(inputs, function (i) { return i.checked; });
      var errEl = document.getElementById(name + "-err");
      var labelEl = document.getElementById(g.getAttribute("aria-labelledby"));
      var required = labelEl && labelEl.querySelector(".req");
      var msg = required && !any ? (inputs[0].type === "radio" ? "Escolha uma opção em " : "Marque pelo menos uma opção em ") + labelEl.childNodes[0].textContent.trim() + "." : "";
      if (errEl) errEl.textContent = msg;
      if (msg) errors.push({ field: inputs[0], msg: msg });
    });
    return errors;
  }

  function attachLiveValidation(form) {
    form.addEventListener("blur", function (e) {
      var f = e.target;
      if (!f.matches || !f.matches("input, select, textarea") || f.type === "radio" || f.type === "file") return;
      if (f.type === "checkbox" && !f.id) return;
      if (f.value || f.getAttribute("aria-invalid")) setError(f, checkField(f));
    }, true);
    form.addEventListener("change", function (e) {
      var f = e.target;
      if (f.type === "file") setError(f, checkField(f));
      if (f.type === "radio" || (f.type === "checkbox" && !f.id)) {
        var errEl = document.getElementById(f.name + "-err"); if (errEl) errEl.textContent = "";
      }
      if (f.type === "checkbox" && f.id && f.checked) setError(f, "");
    });
  }

  window.PRH = { validateContainer: validateContainer, attachLiveValidation: attachLiveValidation, setError: setError };

  /* ------------------------------------------------------------------ 4. Contato empresarial */
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  document.querySelectorAll(".js-contact-form").forEach(function (form) {
    var output = form.parentNode.querySelector(".js-contact-output");
    attachLiveValidation(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errors = validateContainer(form);
      if (errors.length) { errors[0].field.focus(); output.innerHTML = '<p class="error-msg">Revise os ' + errors.length + ' campo(s) destacados.</p>'; return; }
      var data = new FormData(form);
      var msg = "Olá, Permanência RH!\n\n" +
        "Nome: " + data.get("nome") + "\n" +
        "Empresa: " + data.get("empresa") + "\n" +
        "Cargo: " + data.get("cargo") + "\n" +
        "E-mail: " + data.get("email") + "\n" +
        "Necessidade: " + data.get("tipo") + "\n\n" +
        data.get("mensagem");
      var href = "https://wa.me/" + (CONFIG.whatsapp || "") + "?text=" + encodeURIComponent(msg);
      output.innerHTML =
        '<div class="status-panel" style="margin-top:1.25rem">' +
        "<h3>Mensagem pronta</h3>" +
        "<p class=\"small\">Confira o texto abaixo. Nada foi enviado ainda: abra o WhatsApp e toque em enviar, ou copie a mensagem.</p>" +
        '<pre class="msg-preview" id="msg-preview">' + esc(msg) + "</pre>" +
        '<div class="btn-row"><a class="btn btn-primary" target="_blank" rel="noopener" href="' + esc(href) + '">Abrir no WhatsApp</a>' +
        '<button type="button" class="btn btn-secondary" id="btn-copy">Copiar mensagem</button></div>' +
        '<p class="small muted" id="copy-status" role="status"></p></div>';
      var copyBtn = output.querySelector("#btn-copy");
      copyBtn.addEventListener("click", function () {
        var status = output.querySelector("#copy-status");
        function fallback() {
          var pre = output.querySelector("#msg-preview");
          var r = document.createRange(); r.selectNodeContents(pre);
          var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          status.textContent = "Texto selecionado. Use Ctrl+C (ou Copiar) para copiar.";
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).then(function () { status.textContent = "Mensagem copiada."; }, fallback);
        } else fallback();
      });
      output.querySelector(".status-panel h3").setAttribute("tabindex", "-1");
      output.querySelector(".status-panel h3").focus();
    });
  });

  /* ------------------------------------------------------------------ 5. Conteúdos */
  document.querySelectorAll(".js-read").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var body = document.getElementById(btn.getAttribute("aria-controls"));
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      body.hidden = open;
      btn.textContent = open ? "Ler conteúdo" : "Fechar conteúdo";
    });
  });

  var chips = document.querySelectorAll(".chip[data-filter]");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.getAttribute("data-filter");
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      var shown = 0;
      document.querySelectorAll("#article-grid [data-category]").forEach(function (a) {
        var vis = f === "todas" || a.getAttribute("data-category") === f;
        a.hidden = !vis; if (vis) shown++;
      });
      var st = document.getElementById("filter-status");
      if (st) st.textContent = shown + (shown === 1 ? " conteúdo exibido." : " conteúdos exibidos.");
    });
  });

  // Abre automaticamente um artigo quando a página é acessada por link direto (#art-...)
  function openArticleFromHash() { openArticle((location.hash || "").replace("#", "")); }
  function openArticle(h) {
    if (!h || h.indexOf("art-") !== 0) return;
    var art = document.getElementById(h);
    var btn = art && art.querySelector(".js-read");
    if (btn && btn.getAttribute("aria-expanded") === "false") btn.click();
  }
  openArticleFromHash();
  window.addEventListener("hashchange", openArticleFromHash);
  window.addEventListener("popstate", openArticleFromHash);
})();
