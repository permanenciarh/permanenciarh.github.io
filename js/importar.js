/**
 * Permanência RH — leitura de currículo / PDF do LinkedIn para preencher o cadastro.
 *
 * Tudo acontece NO NAVEGADOR da pessoa: o arquivo não é enviado a nenhum servidor
 * durante a leitura. Ele só é enviado se a pessoa decidir anexá-lo ao cadastro.
 *
 * Uso: const r = await PRH_IMPORT.lerPdf(file)  ->  { origem, campos: {...}, encontrados: [...] }
 */
(function () {
  "use strict";

  var MESES = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december|jan|fev|feb|mar|abr|apr|mai|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec";
  var RE_PERIODO = new RegExp("(?:(?:" + MESES + ")\\.?\\s*(?:de\\s+)?)?((?:19|20)\\d{2})\\s*[-–]\\s*(?:(?:(?:" + MESES + ")\\.?\\s*(?:de\\s+)?)?((?:19|20)\\d{2})|(present|presente|atual|o momento|momento|hoje|current))", "i");
  var UF_POR_NOME = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE", "distrito federal": "DF",
    "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
    "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC",
    "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO"
  };
  var UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

  // Palavras-chave para sugerir a área (a pessoa sempre confere)
  var AREAS = [
    ["Recursos Humanos", /\b(rh|recursos humanos|gente e gest|gente & gest|departamento pessoal|\bdp\b|recrutamento|talent|people|human resources)/i],
    ["Segurança do trabalho", /seguran[çc]a do trabalho|t[ée]cnico de seguran|sesmt/i],
    ["Logística e distribuição", /log[íi]stic|estoque|armaz[ée]m|expedi[çc]|conferente|motorista|entregador|supply|distribui[çc]/i],
    ["Comercial e vendas", /vendas|vendedor|comercial|representante|consultor de vendas|key account|\bsales\b|promotor/i],
    ["Atendimento ao cliente", /atendimento|recepcionista|\bsac\b|call center|customer/i],
    ["Contabilidade e finanças", /cont[áa]bil|contador|financeir|fiscal|tesouraria|faturamento|controller|finance|accounting/i],
    ["Tecnologia da informação", /desenvolvedor|developer|software|programador|\bti\b|tecnologia da informa|dados|data |suporte t[ée]cnico|infraestrutura/i],
    ["Engenharia", /engenheir|engineer/i],
    ["Saúde", /enfermeir|enfermagem|m[ée]dic|sa[úu]de|farmac|fisioterap|nutricion/i],
    ["Comunicação e marketing", /marketing|comunica[çc]|social media|publicidade|design/i],
    ["Produção e indústria", /produ[çc][ãa]o|operador|industrial|f[áa]brica|qualidade|pcp/i],
    ["Manutenção", /manuten[çc]|mec[âa]nic|eletricista|eletrot[ée]cnic/i],
    ["Educação", /professor|educa[çc]|pedagog|docente|instrutor/i],
    ["Jurídico", /advogad|jur[íi]dic|direito|paralegal/i],
    ["Administrativo", /administrativ|assistente adm|auxiliar adm|secret[áa]ri|escrit[óo]rio|office/i],
    ["Serviços gerais", /servi[çc]os gerais|limpeza|zelador|porteiro|copeir/i]
  ];

  var SEC_ESQ = {
    contato: /^(contato|contact|contatos)$/i,
    competencias: /^(principais compet[êe]ncias|top skills|compet[êe]ncias|habilidades|skills)$/i,
    idiomas: /^(languages|idiomas|l[íi]nguas)$/i,
    certificacoes: /^(certifications|certifica[çc][õo]es|licenses? (&|and) certifications|licen[çc]as e certificados)$/i,
    outros: /^(honors-awards|honors|pr[êe]mios|publications|publica[çc][õo]es|patents|patentes|volunteer|trabalho volunt[áa]rio)$/i
  };
  var SEC_DIR = {
    resumo: /^(resumo|summary|sobre|about|perfil profissional|objetivo|objective|perfil)$/i,
    experiencia: /^(experi[êe]ncia|experi[êe]ncias|experience|experi[êe]ncia profissional|hist[óo]rico profissional)$/i,
    formacao: /^(forma[çc][ãa]o acad[êe]mica|forma[çc][ãa]o|education|escolaridade|educa[çc][ãa]o)$/i,
    competencias: /^(compet[êe]ncias|habilidades|skills|conhecimentos|qualifica[çc][õo]es)$/i,
    idiomas: /^(idiomas|languages)$/i,
    cursos: /^(cursos|cursos complementares|certifica[çc][õo]es|certifications)$/i
  };

  function sem(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function limpar(s) {
    return (s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
      .replace(/([a-zà-ú\)])\.([A-ZÀ-Ú])/g, "$1. $2").replace(/\s+/g, " ").trim();
  }
  function telefoneBR(s) {
    var d = (s || "").replace(/\D/g, "");
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "";
  }
  function faixaExperiencia(anos) {
    if (anos == null) return "";
    if (anos < 1) return "Até 1 ano";
    if (anos < 3) return "De 1 a 3 anos";
    if (anos < 5) return "De 3 a 5 anos";
    if (anos < 10) return "De 5 a 10 anos";
    return "Mais de 10 anos";
  }
  function escolaridade(texto) {
    var t = sem(texto), ano = new Date().getFullYear();
    if (!t) return "";
    if (/doutorad|phd|mestrad|master of science|\bm\.?sc\b|mestre/.test(t)) return "Mestrado ou doutorado";
    if (/\bmba\b|pos[- ]?gradua|especializa|master of business|postgraduate|lato sensu/.test(t)) return "Pós-graduação / MBA";
    if (/bacharel|bachelor|licenciatura|graduacao|tecnologo|universidade|faculdade|centro universitario|university|college|ensino superior/.test(t)) {
      var anos = (t.match(/(19|20)\d{2}/g) || []).map(Number);
      var fim = anos.length ? Math.max.apply(null, anos) : 0;
      if (/cursando|em andamento|incomplet|trancad/.test(t) || fim > ano) return "Ensino superior incompleto / cursando";
      return "Ensino superior completo";
    }
    if (/tecnico/.test(t)) return "Ensino técnico";
    if (/ensino medio|2o grau|segundo grau|high school/.test(t)) return "Ensino médio completo";
    return "";
  }
  function sugerirArea(texto) {
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i][1].test(texto || "")) return AREAS[i][0];
    return "";
  }
  function localizacao(linha) {
    var p = (linha || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    if (!p.length) return {};
    var uf = "";
    for (var i = 1; i < p.length; i++) {
      var n = sem(p[i]).replace(/^estado d[eo] /, "");
      if (UF_POR_NOME[n]) { uf = UF_POR_NOME[n]; break; }
      if (UFS.indexOf(p[i].toUpperCase()) > -1) { uf = p[i].toUpperCase(); break; }
    }
    var cidade = p[0].replace(/\s+e regi[ãa]o$/i, "");
    if (/^(brasil|brazil)$/i.test(cidade)) cidade = "";
    return { cidade: cidade, uf: uf };
  }

  /* ------------------------------------------------------------ PDF -> linhas */
  async function extrairLinhas(file) {
    if (!window.pdfjsLib) throw new Error("leitor_indisponivel");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
    var buf = await file.arrayBuffer();
    var pdf = await window.pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    var meta = {};
    try { meta = (await pdf.getMetadata()).info || {}; } catch (e) { /* sem metadados */ }
    var paginas = [];
    var maxPag = Math.min(pdf.numPages, 8);
    for (var n = 1; n <= maxPag; n++) {
      var page = await pdf.getPage(n);
      var vp = page.getViewport({ scale: 1 });
      var tc = await page.getTextContent();
      var itens = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
        return { s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height || 10, w: it.width || 0 };
      });
      paginas.push({ n: n, largura: vp.width, itens: itens });
    }
    return { meta: meta, paginas: paginas };
  }

  // Agrupa itens na mesma altura em linhas (dentro de uma coluna)
  function agruparLinhas(itens) {
    itens = itens.slice().sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var linhas = [];
    itens.forEach(function (it) {
      var l = linhas.length ? linhas[linhas.length - 1] : null;
      if (l && Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.35)) {
        var gap = it.x - (l.xFim || it.x);
        l.t += (gap > 1.5 && !/\s$/.test(l.t) && !/^\s/.test(it.s) ? " " : "") + it.s;
        l.xFim = it.x + it.w; l.h = Math.max(l.h, it.h);
      } else {
        linhas.push({ t: it.s, y: it.y, x: it.x, xFim: it.x + it.w, h: it.h });
      }
    });
    return linhas.map(function (l) { return { t: l.t.replace(/\s+/g, " ").trim(), h: l.h, x: l.x }; }).filter(function (l) { return l.t; });
  }

  function ehRodape(t) { return /^(page|página|pagina)\s+\d+\s+(of|de)\s+\d+$/i.test(t); }

  function secoes(linhas, mapa) {
    var out = { _antes: [] }, atual = "_antes";
    linhas.forEach(function (l) {
      var achou = null;
      Object.keys(mapa).forEach(function (k) { if (!achou && mapa[k].test(l.t.replace(/[:：]$/, ""))) achou = k; });
      if (achou) { atual = achou; out[atual] = out[atual] || []; return; }
      (out[atual] = out[atual] || []).push(l);
    });
    return out;
  }

  function anosDeExperiencia(textoLinhas) {
    var inicio = null, agora = new Date().getFullYear();
    textoLinhas.forEach(function (t) {
      var m = t.match(RE_PERIODO);
      if (m) { var a = Number(m[1]); if (a > 1950 && a <= agora && (inicio === null || a < inicio)) inicio = a; }
    });
    return inicio === null ? null : Math.max(0, agora - inicio);
  }

  function primeiroCargo(linhas) {
    for (var i = 0; i < linhas.length; i++) {
      if (RE_PERIODO.test(linhas[i]) && i > 0) {
        var c = linhas[i - 1];
        if (/^\d+\s+(anos?|meses|years?|months?)/i.test(c) && i > 1) c = linhas[i - 2];
        return c;
      }
    }
    return "";
  }

  /* ------------------------------------------------------------ LinkedIn */
  function parseLinkedIn(doc) {
    var p1 = doc.paginas[0], corte = p1.largura * 0.33;
    var esq = agruparLinhas(p1.itens.filter(function (i) { return i.x < corte; }));
    var dir = agruparLinhas(p1.itens.filter(function (i) { return i.x >= corte; }));
    doc.paginas.slice(1).forEach(function (pg) { dir = dir.concat(agruparLinhas(pg.itens)); });
    dir = dir.filter(function (l) { return !ehRodape(l.t); });

    var c = {};
    // Nome: maior fonte da coluna principal
    var maior = dir.reduce(function (m, l) { return l.h > m.h ? l : m; }, { h: 0 });
    c.nome = maior.t || "";

    var sd = secoes(dir, SEC_DIR);
    var cab = (sd._antes || []).map(function (l) { return l.t; });
    var idxNome = cab.indexOf(c.nome);
    var depois = cab.slice(idxNome + 1);
    if (depois.length) {
      var loc = depois[depois.length - 1];
      if (/,/.test(loc) || /brasil|brazil/i.test(loc)) {
        var lc = localizacao(loc); c.cidade = lc.cidade; c.estado = lc.uf; depois = depois.slice(0, -1);
      }
      c.headline = limpar(depois.join(" "));
    }

    var se = secoes(esq, SEC_ESQ);
    var contato = (se.contato || []).map(function (l) { return l.t; }).join("\n");
    var tudo = contato + "\n" + cab.join("\n");
    var em = tudo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); if (em) c.email = em[0].toLowerCase();
    var tel = contato.match(/(\+?\d[\d\s().-]{8,}\d)\s*\((mobile|celular|home|work|trabalho|residencial)\)/i) || contato.match(/(\+?\d[\d\s().-]{9,}\d)/);
    if (tel) c.telefone = telefoneBR(tel[1]);
    var li = contato.replace(/\n/g, "").match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i);
    if (li) c.linkedin = "https://www.linkedin.com/in/" + li[1].replace(/\(linkedin\)$/i, "");

    c.competencias = (se.competencias || []).map(function (l) { return l.t; }).join(", ");
    c.idiomas = (se.idiomas || []).map(function (l) { return l.t.replace(/\s*\((native or bilingual|nativo ou bilíngue)\)/i, " (nativo)").replace(/\s*\(full professional proficiency\)/i, " (fluente)").replace(/\s*\(professional working proficiency\)/i, " (avançado)").replace(/\s*\(limited working proficiency\)/i, " (intermediário)").replace(/\s*\(elementary proficiency\)/i, " (básico)"); }).join(", ");
    var certs = (se.certificacoes || []).map(function (l) { return l.t; });

    c.resumo = limpar((sd.resumo || []).map(function (l) { return l.t; }).join(" "));
    var exp = (sd.experiencia || []).map(function (l) { return l.t; });
    c.anos = anosDeExperiencia(exp);
    c.cargoAtual = primeiroCargo(exp);
    c.escolaridade = escolaridade((sd.formacao || []).map(function (l) { return l.t; }).join(" \n "));
    c._textoArea = (c.headline || "") + " " + c.cargoAtual + " " + exp.slice(0, 40).join(" ");
    if (!c.competencias && certs.length) c.competencias = certs.slice(0, 5).join(", ");
    return c;
  }

  /* ------------------------------------------------------------ currículo genérico */
  function parseCurriculo(doc) {
    var linhas = [];
    doc.paginas.forEach(function (pg) { linhas = linhas.concat(agruparLinhas(pg.itens)); });
    linhas = linhas.filter(function (l) { return !ehRodape(l.t); });
    var textos = linhas.map(function (l) { return l.t; });
    var tudo = textos.join("\n");
    var c = {};
    var em = tudo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); if (em) c.email = em[0].toLowerCase();
    var tel = tudo.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[\s.-]?\d{4}/); if (tel) c.telefone = telefoneBR(tel[0]);
    var li = tudo.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i); if (li) c.linkedin = "https://www.linkedin.com/in/" + li[1];

    // Nome: linha de maior fonte entre as 6 primeiras; senão a primeira com 2 a 6 palavras sem números
    var topo = linhas.slice(0, 8);
    var maior = topo.reduce(function (m, l) { return l.h > m.h ? l : m; }, { h: 0 });
    var candidatoNome = /^[A-Za-zÀ-ú'´`.\s-]{4,60}$/.test(maior.t || "") && maior.t.trim().split(/\s+/).length >= 2 ? maior.t : "";
    if (!candidatoNome) topo.some(function (l) { if (/^[A-Za-zÀ-ú'.\s-]{4,60}$/.test(l.t) && l.t.split(/\s+/).length >= 2 && l.t.split(/\s+/).length <= 6) { candidatoNome = l.t; return true; } return false; });
    c.nome = candidatoNome.replace(/\s+/g, " ").trim();
    if (c.nome && c.nome === c.nome.toUpperCase()) c.nome = c.nome.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\s(Da|De|Do|Das|Dos|E)\s/g, function (m) { return m.toLowerCase(); });

    var ufm = tudo.match(/(?:^|[|•·\n])[ \t]*([A-ZÀ-Ú][A-Za-zÀ-ú.' \t]{2,40}?)[ \t]*[-\/–,][ \t]*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
    if (ufm) { c.cidade = ufm[1].replace(/^.*(?:\d|,)\s*/, "").trim(); c.estado = ufm[2]; }

    var sd = secoes(linhas, SEC_DIR);
    c.resumo = limpar((sd.resumo || []).map(function (l) { return l.t; }).join(" "));
    var exp = (sd.experiencia || []).map(function (l) { return l.t; });
    c.anos = anosDeExperiencia(exp.length ? exp : textos);
    c.cargoAtual = primeiroCargo(exp);
    c.escolaridade = escolaridade((sd.formacao || []).map(function (l) { return l.t; }).join(" \n ") || tudo);
    c.competencias = (sd.competencias || []).map(function (l) { return l.t.replace(/^[•·\-–*]\s*/, ""); }).join(", ");
    c.idiomas = (sd.idiomas || []).map(function (l) { return l.t.replace(/^[•·\-–*]\s*/, ""); }).join(", ");
    var objetivo = (sd.resumo || [])[0];
    c.headline = objetivo ? objetivo.t : "";
    c._textoArea = c.headline + " " + c.cargoAtual + " " + exp.slice(0, 40).join(" ");
    return c;
  }

  /* ------------------------------------------------------------ montagem final */
  function finalizar(c, origem) {
    var campos = {};
    if (c.nome) campos.nome = c.nome.slice(0, 120);
    if (c.email) campos.email = c.email.slice(0, 160);
    if (c.telefone) campos.telefone = c.telefone;
    if (c.linkedin) campos.linkedin = c.linkedin.slice(0, 200);
    if (c.cidade) campos.cidade = c.cidade.slice(0, 80);
    if (c.estado) campos.estado = c.estado;
    var cargo = (c.headline || "").split(/\s*[|•·]\s*/)[0] || c.cargoAtual || "";
    if (cargo.length > 60 && c.cargoAtual) cargo = c.cargoAtual;
    if (cargo) campos.cargo = cargo.slice(0, 100);
    var area = sugerirArea(c.headline) || sugerirArea(c.cargoAtual) || sugerirArea(c._textoArea);
    if (area) campos.area = area;
    var resumo = c.resumo || "";
    if (resumo.length < 50 && c.headline) resumo = limpar(c.headline + (resumo ? ". " + resumo : ""));
    if (resumo.length >= 50) campos.resumo = resumo.length > 1200 ? resumo.slice(0, 1190).replace(/\s+\S*$/, "") + "…" : resumo;
    var faixa = faixaExperiencia(c.anos); if (faixa) campos.experiencia = faixa;
    if (c.escolaridade) campos.escolaridade = c.escolaridade;
    if (c.competencias) campos.competencias = c.competencias.slice(0, 300).replace(/,\s*[^,]*$/, function (m) { return c.competencias.length > 300 ? "" : m; });
    if (c.idiomas) campos.idiomas = c.idiomas.slice(0, 150);
    return { origem: origem, campos: campos, encontrados: Object.keys(campos) };
  }

  async function lerPdf(file) {
    if (!file) throw new Error("sem_arquivo");
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("formato");
    if (file.size > 10 * 1024 * 1024) throw new Error("tamanho");
    var doc = await extrairLinhas(file);
    var texto = doc.paginas.map(function (p) { return p.itens.map(function (i) { return i.s; }).join(" "); }).join(" ");
    if (texto.replace(/\s/g, "").length < 40) throw new Error("sem_texto");
    var ehLinkedIn = /linkedin/i.test(doc.meta.Author || "") || (/linkedin\.com\/in/i.test(texto) && /(Page|Página)\s+1\s+(of|de)/i.test(texto));
    var r = finalizar(ehLinkedIn ? parseLinkedIn(doc) : parseCurriculo(doc), ehLinkedIn ? "linkedin" : "curriculo");
    var extra = documentos(texto);
    Object.keys(extra).forEach(function (k) { r.campos[k] = extra[k]; r.encontrados.push(k); });
    return r;
  }

  /** CPF (só se os dígitos verificadores conferirem) e categoria da CNH, quando o currículo informa. */
  function cpfOk(c) {
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i); if (((s * 10) % 11) % 10 !== Number(c[t])) return false; }
    return true;
  }
  function documentos(texto) {
    var out = {};
    var m = texto.match(/CPF\s*(?:n[º°o.]*)?\s*[:\-]?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[\s.\-\/]?\d{2})/i) || texto.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
    if (m) { var d = m[1].replace(/\D/g, ""); if (cpfOk(d)) out.cpf = d; }
    var h = texto.match(/(?:CNH|[Cc]arteira\s+(?:[Nn]acional\s+)?de\s+[Hh]abilita[çc][ãa]o|[Hh]abilita[çc][ãa]o|HABILITA[ÇC][ÃA]O)[^.\n]{0,30}?\b(AE|AD|AC|AB|A|B|C|D|E)\b(?!\w)/);
    if (h) out.cnh = h[1].toUpperCase();
    return out;
  }

  window.PRH_IMPORT = { lerPdf: lerPdf };
})();
