/* Permanência RH — aba "Propostas e contratos" do painel.
 * Gera, no navegador, a tabela de serviços de carreira, as propostas para empresas e o contrato de carreira (pessoa física).
 * Nada é enviado a servidor: o documento abre numa janela do painel, pode ser editado ali mesmo (campos [em destaque]) e é
 * salvo em PDF pela impressão. Depois, o PDF pode ser anexado em "Documentos" na ficha da pessoa.
 * Dados pessoais do prestador (CPF, endereço) NÃO ficam no código: são digitados e, se a equipe quiser, lembrados só neste navegador.
 */
(function () {
  "use strict";

  var CADEIRA = '<svg viewBox="0 0 32 48" aria-hidden="true"><rect x="5" y="3" width="22" height="18" rx="3"/><path d="M11 6v12M16 6v12M21 6v12"/><path d="M3 25h26" stroke-width="3.2"/><path d="M7 27 5 46M11 27l-1 19M21 27l1 19M25 27l2 19"/></svg>';

  /* ------------------------------------------------------------ conteúdo */
  var SERVICOS = [
    { id: "curriculo_revisao", nome: "Currículo Profissional (revisão)", preco: 100, prazo: "2 dias úteis" },
    { id: "curriculo_zero", nome: "Currículo Profissional (do zero)", preco: 180, prazo: "2 dias úteis" },
    { id: "linkedin", nome: "LinkedIn Estratégico", preco: 220, prazo: "" },
    { id: "entrevistas", nome: "Preparação para Entrevistas", preco: 180, prazo: "" },
    { id: "carreira360", nome: "Carreira 360", preco: 450, prazo: "" }
  ];

  var TABELA = [
    { nome: "Currículo Profissional", para: "Para quem não recebe retorno, vai voltar ao mercado ou mudar de área.", preco: ["curriculo_revisao", "curriculo_zero"],
      itens: ["Conversa inicial sobre sua trajetória", "Currículo do zero ou revisão completa, focado em resultados", "PDF pronto para enviar e para triagem automática", "1 rodada de ajustes"] },
    { nome: "LinkedIn Estratégico", para: "Para quem quer ser encontrado por recrutadores.", preco: ["linkedin"],
      itens: ["Título e Sobre reescritos com as palavras que recrutador busca", "Experiências e competências organizadas", "Orientações de foto, URL e visibilidade", "Roteiro do que publicar"] },
    { nome: "Preparação para Entrevistas", para: "Para quem tem entrevista marcada ou trava ao falar de si.", preco: ["entrevistas"],
      itens: ["Simulação de cerca de 1 hora, com perguntas da sua área", "Devolutiva do que foi bem e do que ajustar", "Roteiro para contar experiências (situação, ação, resultado)", "Orientação para perguntas difíceis e pretensão salarial"] },
    { nome: "Carreira 360", para: "Para quem está em transição e quer chegar pronto.", preco: ["carreira360"], destaque: true,
      itens: ["Currículo + LinkedIn + Preparação para Entrevistas", "Conversa de orientação de carreira para definir o próximo passo", "Mais barato que contratar os três separados"] }
  ];

  var PROPOSTAS = {
    "contratacao-certa": { titulo: "Contratação Certa", sub: "Recrutamento e seleção de ponta a ponta",
      entendi: "[Empresa] precisa contratar [n] profissional(is) para [cargo/área], em [cidade], com início previsto para [data]. Hoje o maior desafio é [ex.: rotatividade na função, urgência, falta de candidatos qualificados].",
      passos: [["Alinhamento", "Dia 1-2", "Reunião sobre a rotina real da vaga, o time, a liderança e o perfil de quem fica."],
        ["Divulgação", "Dia 2-3", "Anúncio e divulgação no site, nas redes e no Banco de Talentos da Permanência."],
        ["Triagem", "Dia 3-7", "Análise de currículos e entrevista de pré-seleção."],
        ["Entrevistas", "Dia 7-12", "Entrevistas por competências e, quando fizer sentido para a vaga, avaliação comportamental."],
        ["Finalistas", "Dia 12-15", "Apresentação de até [3] finalistas, com parecer de cada um."],
        ["Acompanhamento", "90 dias", "Contato com o novo colaborador e com o gestor nos primeiros 90 dias."]],
      recebe: ["Finalistas com parecer individual", "Histórico do processo", "Devolutiva a todos os candidatos não aprovados", "Relatório do acompanhamento dos 90 dias"],
      prazo: "Primeiros finalistas em até [15] dias úteis após o alinhamento. O prazo depende do retorno rápido da empresa nas entrevistas.",
      invest: ["[Opção A: R$ ___ por vaga]  ou  [Opção B: ___% do primeiro salário, mínimo R$ ___]", "Pagamento: 50% no aceite e 50% na contratação.", "Uma única reposição sem custo se o contratado sair em até 90 dias por questão de perfil."],
      extraT: "O que não está incluído", extra: "Exames admissionais, registro em carteira e DP, anúncios pagos em plataformas e a decisão final de contratar, que é sempre da empresa.",
      prox: "Responda esta mensagem com \"de acordo\" e agendo o alinhamento em até 2 dias úteis." },
    "pesquisa-de-clima": { titulo: "Pesquisa de Clima", sub: "Entender o que faz as pessoas ficarem ou saírem",
      entendi: "[Empresa] tem [n] colaboradores em [setores/turnos] e quer entender [ex.: por que as pessoas saem, como está a relação com a liderança, o efeito de uma mudança recente]. Parte da equipe [não tem e-mail / trabalha em campo ou em turnos].",
      passos: [["Alinhamento", "Semana 1", "Objetivos, áreas a comparar e regras de sigilo, com a direção."],
        ["Questionário", "Semana 1", "Sob medida: liderança, comunicação, reconhecimento, condições de trabalho e pertencimento."],
        ["Campanha interna", "Semana 2", "Cartazes, avisos e roteiro para os líderes, para chegar a pelo menos [80]% de participação."],
        ["Aplicação anônima", "Semana 2-3", "Online e/ou presencial, com urna e acompanhamento nos turnos."],
        ["Análise", "Semana 4", "Indicadores por área, sem identificar ninguém (grupos com menos de [5] respostas são agrupados)."],
        ["Devolutiva e plano", "Semana 5", "Apresentação para a liderança e plano de ação com responsáveis e prazos."]],
      recebe: ["Relatório de resultados com indicadores por área", "Apresentação para a liderança", "Plano de ação pronto para acompanhar", "Modelo de comunicação de volta para os colaboradores"],
      prazo: "Cerca de [5] semanas a partir do aceite.",
      invest: ["R$ [___] para até [n] colaboradores.", "Pagamento: 50% no aceite e 50% na entrega do relatório.", "Acompanhamento do plano de ação após 90 dias (opcional): R$ [___]."],
      extraT: "Cuidados com os dados", extra: "Respostas anônimas, usadas apenas para esta pesquisa, relatório sem identificação individual, conforme o Aviso de Privacidade da Permanência e a LGPD.",
      prox: "Responda com \"de acordo\" e marco o alinhamento com a direção em até 2 dias úteis." },
    "avaliacao-de-desempenho": { titulo: "Avaliação de Desempenho", sub: "Critérios claros para reconhecer e desenvolver",
      entendi: "[Empresa] tem [n] colaboradores e hoje [não avalia / avalia de forma informal] o desempenho. A direção quer critérios claros para reconhecer, desenvolver e promover, e para [ex.: decidir promoções, reduzir conflitos sobre reajuste, preparar sucessores].",
      passos: [["Diagnóstico", "Semana 1", "Cargos, estrutura e o que a empresa quer valorizar."],
        ["Desenho do modelo", "Semana 2-3", "Competências e metas por cargo, escala, formulários e regras do ciclo (autoavaliação + gestor, ou 180 graus)."],
        ["Treino dos gestores", "Semana 3-4", "Como avaliar com evidências e conduzir a conversa de feedback."],
        ["Primeiro ciclo", "Semana 4-6", "Aplicação, acompanhamento e suporte aos gestores."],
        ["Calibração", "Semana 7", "Reunião com a liderança para alinhar critérios e resultados."],
        ["PDIs e relatório", "Semana 8", "Planos de Desenvolvimento Individual e relatório consolidado para a direção."]],
      recebe: ["Modelo de avaliação documentado (competências, escala, formulários, calendário)", "Gestores treinados", "Primeiro ciclo concluído", "PDIs definidos e relatório para a direção"],
      prazo: "Cerca de [8] semanas a partir do aceite.",
      invest: ["R$ [___] para até [n] colaboradores.", "Pagamento: 40% no aceite, 30% ao fim do treinamento e 30% na entrega do relatório.", "Segundo ciclo conduzido pela Permanência (opcional): R$ [___]."],
      extraT: "O que não está incluído", extra: "Decisões de promoção, reajuste ou desligamento, que são da empresa. A avaliação apoia a decisão, não a substitui.",
      prox: "Responda com \"de acordo\" e agendo o diagnóstico em até 2 dias úteis." },
    "rh-estruturado": { titulo: "RH Estruturado", sub: "Processos e indicadores para quem está crescendo",
      entendi: "[Empresa] tem [n] colaboradores, está crescendo e hoje [não tem RH dedicado / concentra o RH no dono ou no financeiro]. Os riscos que aparecem: [ex.: contratações sem critério, integração improvisada, saídas que ninguém acompanha, documentos e políticas soltos].",
      passos: [["Diagnóstico", "Semana 1-2", "Rotinas de RH, pontos de risco e prioridades. Sai com um mapa do que fazer primeiro."],
        ["Base", "Semana 3-6", "Descrições de cargo e matriz de competências."],
        ["Entrada e permanência", "Semana 7-9", "Integração de novos colaboradores (onboarding) e procedimentos e políticas de RH documentados."],
        ["Números e treinamento", "Semana 10-12", "Indicadores essenciais (turnover, absenteísmo, tempo de contratação) e matriz de treinamentos por função."],
        ["Encerramento", "Semana 12", "Calendário de RH para os próximos 12 meses e reunião de passagem para quem vai tocar a rotina."]],
      recebe: ["Processos documentados", "Indicadores implantados, com planilha pronta", "Calendário de RH para seguir", "1 hora de suporte por semana durante a implantação"],
      prazo: "Cerca de [12] semanas. Pode ser contratado só o diagnóstico + base (fases 1 e 2).",
      invest: ["Diagnóstico + base: R$ [___].", "Implantação completa: R$ [___]  ou  [3]x de R$ [___] por mês.", "Cada fase é entregue e validada antes de seguir para a próxima."],
      extraT: "O que não está incluído", extra: "Departamento Pessoal operacional (folha, admissão, eSocial) e parecer jurídico. Posso indicar parceiros, se for preciso.",
      prox: "Responda com \"de acordo\" e marco o diagnóstico em até 2 dias úteis." }
  };

  /* ------------------------------------------------------------ utilidades */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  /** Texto com [campos] destacados para completar. */
  function campos(t, tag) {
    var node = el(tag || "span");
    String(t == null ? "" : t).split(/(\[[^\]]+\])/).forEach(function (p) {
      if (!p) return;
      if (/^\[[^\]]+\]$/.test(p)) node.appendChild(el("span", { class: "fld", text: p }));
      else node.appendChild(document.createTextNode(p));
    });
    return node;
  }
  function reais(n) { return "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 }); }
  function hoje() { return new Date().toLocaleDateString("pt-BR"); }
  function marca(dir) {
    return el("div", { class: "pd-brand" }, [el("span", { class: "pd-logo", html: CADEIRA }), el("div", null, [el("b", { text: "Permanência" }), el("i", { text: "Consultoria em RH" })]), el("div", { class: "pd-site", text: dir })]);
  }
  function rodape() { return el("div", { class: "pd-foot" }, [el("span", { text: "Permanência Consultoria em RH · permanenciarh.com.br" }), el("span", { text: "Gente que fica. Gestão que funciona." })]); }
  function h2(n, t) { return el("h2", null, [el("span", { text: n }), t]); }
  function doc(paginas) { return el("article", { class: "pd-doc", contenteditable: "true", spellcheck: "true", "aria-label": "Documento editável. Clique no texto para ajustar antes de imprimir." }, paginas); }
  function pagina(filhos, extra) { return el("section", { class: "pd-page" + (extra ? " " + extra : "") }, filhos); }

  /* ------------------------------------------------------------ tabela de serviços */
  function tabela(precos) {
    var p = precos || {};
    function v(id) { var s = SERVICOS.filter(function (x) { return x.id === id; })[0]; return reais(p[id] != null && p[id] !== "" ? p[id] : s.preco); }
    var tb = el("table", { class: "pd-tab" }, [el("thead", null, [el("tr", null, [el("th", { text: "Serviço" }), el("th", { text: "O que inclui" }), el("th", { text: "Valor" })])])]);
    var body = el("tbody");
    TABELA.forEach(function (r) {
      var preco = r.preco.length === 2 ? el("td", { class: "pd-preco" }, [v(r.preco[0]) + " revisão", el("br"), v(r.preco[1]) + " do zero"]) : el("td", { class: "pd-preco", text: v(r.preco[0]) });
      body.appendChild(el("tr", { class: r.destaque ? "pd-hl" : "" }, [
        el("td", { class: "pd-n" }, [r.nome, el("br"), el("span", { class: "pd-leve", text: r.para })]),
        el("td", null, [el("ul", { class: "pd-ul pd-ul-sm" }, r.itens.map(function (i) { return el("li", { text: i }); }))]),
        preco
      ]));
    });
    tb.appendChild(body);
    return doc([pagina([
      marca("permanenciarh.com.br"),
      el("p", { class: "pd-eyebrow", text: "Próxima Cadeira · Carreira" }), el("h1", { text: "Serviços e valores" }),
      el("p", { class: "pd-sub", text: "Atendimento individual com o Álamo. Escopo combinado antes de começar." }),
      tb,
      el("p", { class: "pd-note" }, [el("b", { text: "Como funciona: " }), "você me conta seu momento e eu indico o melhor caminho. Pagamento via PIX: metade para começar e metade na entrega. Currículo entregue em até 2 dias úteis após a nossa conversa; os demais prazos combinamos no início."]),
      el("p", { class: "pd-note" }, [el("b", { text: "Transparência: " }), "os serviços melhoram a sua apresentação profissional, mas não garantem contratação."]),
      el("div", { class: "pd-cta" }, [el("b", { text: "Quer começar?" }), el("br"), "Me chame no WhatsApp ", el("b", { text: "(34) 99287-1582" }), " e diga qual serviço te interessa.", el("br"), "permanenciarh.com.br/desenvolvimento-profissional.html"]),
      rodape()
    ])]);
  }

  /* ------------------------------------------------------------ proposta para empresa */
  function proposta(modelo, d) {
    var m = PROPOSTAS[modelo]; d = d || {};
    var empresa = (d.empresa || "").trim();
    var para = [d.responsavel, d.cargo, empresa].filter(function (x) { return x && String(x).trim(); }).join(", ");
    var entendi = empresa ? m.entendi.replace("[Empresa]", empresa) : m.entendi;
    var meta = el("table", { class: "pd-meta" }, [
      el("tr", null, [el("td", { text: "Para" }), el("td", null, [para ? document.createTextNode(para) : campos("[Nome do responsável], [Cargo], [Empresa]")])]),
      el("tr", null, [el("td", { text: "Data" }), el("td", null, [campos((d.data || "[dd/mm/aaaa]") + " · Validade: 10 dias corridos")])])
    ]);
    var passos = el("table", { class: "pd-steps" }, m.passos.map(function (s) { return el("tr", null, [el("td", { text: s[0] }), el("td", { text: s[1] }), el("td", null, [campos(s[2])])]); }));
    var invest = el("div", { class: "pd-box" }, (d.investimento ? [el("p", { text: d.investimento })] : []).concat(m.invest.slice(d.investimento ? 1 : 0).map(function (x) { return campos(x, "p"); })));
    return doc([
      pagina([marca("permanenciarh.com.br"), el("p", { class: "pd-eyebrow", text: "Proposta comercial" }), el("h1", { text: m.titulo }), el("p", { class: "pd-sub", text: m.sub }), meta,
        h2("01", "O que entendi da sua necessidade"), campos(entendi, "p"), h2("02", "Como vamos trabalhar"), passos, rodape()]),
      pagina([marca(m.titulo), h2("03", "Você recebe"), el("ul", { class: "pd-ul" }, m.recebe.map(function (x) { return el("li", { text: x }); })),
        h2("04", "Prazo"), campos(m.prazo, "p"), h2("05", "Investimento"), invest, h2("06", m.extraT), campos(m.extra, "p"),
        el("div", { class: "pd-cta" }, [el("b", { text: "07 · Próximo passo" }), el("br"), campos(m.prox)]),
        el("div", { class: "pd-sign" }, [el("b", { text: "Álamo Monteiro" }), " · Psicólogo · MBA em Business Partner em RH", el("br"), "WhatsApp (34) 99287-1582 · contato@permanenciarh.com.br"]), rodape()], "pd-pg2")
    ]);
  }

  /* ------------------------------------------------------------ contrato de carreira (PF) */
  function contrato(d) {
    d = d || {};
    var serv = SERVICOS.filter(function (s) { return s.id === d.servico; })[0] || SERVICOS[4];
    var v = function (x, ph) { return x && String(x).trim() ? String(x).trim() : ph; };
    var contratado = "CONTRATADO: Álamo Monteiro, pessoa física, CPF " + v(d.cpfContratado, "[___.___.___-__]") + ", residente em " + v(d.endContratado, "[endereço]") + ", Patos de Minas/MG, atuando sob a marca Permanência Consultoria em RH.";
    var contratante = "CONTRATANTE: " + v(d.nome, "[Nome completo]") + ", CPF " + v(d.cpf, "[___.___.___-__]") + ", residente em " + v(d.endereco, "[endereço]") + ", contato " + v(d.contato, "[WhatsApp/e-mail]") + ".";
    var prazo = v(d.prazo, serv.prazo ? serv.prazo.replace(/ dias úteis/, "") : "__");
    var entrada = v(d.entrada, "50");
    var valor = d.valor !== undefined && d.valor !== "" ? reais(d.valor) : "R$ [____]";
    var ajustes = v(d.ajustes, "uma");
    var cl = [
      ["Das partes", contratado + " " + contratante],
      ["Do objeto", "Prestação do serviço de " + serv.nome + ", conforme a descrição publicada em permanenciarh.com.br/desenvolvimento-profissional.html e o que foi combinado na conversa inicial: " + v(d.detalhes, "[detalhes combinados]") + "."],
      ["Do prazo", "A entrega será feita em até " + prazo + " dias úteis contados da conversa inicial e do recebimento das informações e documentos pedidos ao CONTRATANTE. O atraso do CONTRATANTE em enviar o material prorroga o prazo na mesma medida."],
      ["Do valor e do pagamento", "O CONTRATANTE pagará " + valor + ", via PIX, sendo " + entrada + "% no aceite deste contrato e " + (100 - (parseInt(entrada, 10) || 50)) + "% na entrega. A entrega final é liberada após a confirmação do pagamento integral."],
      ["Dos ajustes", "Estão incluídas " + ajustes + " rodada(s) de ajustes, a pedir em até 5 dias após a entrega. Ajustes adicionais ou mudança do objetivo (outra área ou outro tipo de vaga) podem ser combinados e cobrados à parte."],
      ["Das obrigações do CONTRATANTE", "Fornecer informações verdadeiras e completas sobre sua trajetória e responder às dúvidas em tempo razoável. As informações e documentos enviados são de responsabilidade do CONTRATANTE. O CONTRATADO não inclui dados que o CONTRATANTE não confirmar como verdadeiros."],
      ["Do resultado", "Os serviços melhoram a apresentação profissional do CONTRATANTE, mas o CONTRATADO não garante contratação, entrevistas, aprovação em processos seletivos ou qualquer resultado específico, pois dependem de terceiros e do mercado."],
      ["Dos dados pessoais (LGPD)", "Os dados do CONTRATANTE serão usados apenas para prestar este serviço, conforme o Aviso de Privacidade da Permanência (permanenciarh.com.br/privacidade.html) e a Lei 13.709/2018, e não serão compartilhados com terceiros sem autorização. O CONTRATANTE pode pedir a exclusão de seus dados a qualquer momento, ressalvadas as obrigações legais."],
      ["Da propriedade dos documentos", "Os documentos entregues (currículo, textos do perfil etc.) pertencem ao CONTRATANTE para uso pessoal e profissional. A metodologia, os modelos e os roteiros utilizados pelo CONTRATADO continuam sendo dele."],
      ["Do cancelamento", "Contratando à distância (WhatsApp, e-mail ou internet), o CONTRATANTE pode desistir em até 7 dias corridos do aceite. Se pediu que o trabalho começasse nesse período, pagará pela parte já executada e será reembolsado do restante. Depois desse prazo, havendo desistência após o início, o valor correspondente ao trabalho já realizado não é reembolsado."],
      ["Do foro", "Fica eleito o foro da comarca de Patos de Minas/MG para resolver dúvidas deste contrato, sem prejuízo de outro foro previsto em lei para o consumidor."]
    ];
    var ps = cl.map(function (c, i) { return el("p", { class: "pd-cl" }, [el("b", { text: "Cláusula " + (i + 1) + "ª · " + c[0] + ". " }), campos(c[1])]); });
    return doc([pagina([
      marca("Contrato de prestação de serviços"),
      el("p", { class: "pd-eyebrow", text: "Contrato" }), el("h1", { class: "pd-h1-sm", text: "Prestação de serviços de carreira" }), el("p", { class: "pd-sub", text: "Pessoa física · Permanência Consultoria em RH" })
    ].concat(ps, [
      el("p", { class: "pd-cl", text: "E por estarem de acordo, as partes assinam este contrato, em duas vias de igual teor ou por aceite eletrônico (mensagem de \"de acordo\" no WhatsApp ou e-mail, com data)." }),
      el("p", { class: "pd-cl" }, ["Patos de Minas/MG, ", campos(d.data || "[dd/mm/aaaa]"), "."]),
      el("div", { class: "pd-sigs" }, [
        el("div", null, [el("b", { text: "Álamo Monteiro" }), el("br"), "CONTRATADO · CPF ", campos(v(d.cpfContratado, "[___]"))]),
        el("div", null, [el("b", { text: v(d.nome, "[Nome do contratante]") }), el("br"), "CONTRATANTE · CPF ", campos(v(d.cpf, "[___]"))])
      ]), rodape()]), "pd-contrato")]);
  }

  /* ------------------------------------------------------------ a aba */
  var LS = "prh_prestador";
  function lembrado() { try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { return {}; } }
  function lembrar(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } }

  function campo(label, input, hint, wide) {
    var id = input.id;
    return el("div", { class: "field" + (wide ? " full" : "") }, [el("label", { for: id, text: label }), input, hint ? el("p", { class: "hint", text: hint }) : null]);
  }
  function sel(id, opts, vazio) {
    var s = el("select", { id: id }, vazio ? [el("option", { value: "", text: vazio })] : []);
    opts.forEach(function (o) { s.appendChild(el("option", { value: o[0], text: o[1] })); });
    return s;
  }
  function inp(id, type, extra) { return el("input", Object.assign({ id: id, type: type || "text", autocomplete: "off" }, extra || {})); }
  function card(titulo, ajuda, filhos) { return el("section", { class: "d-sec pd-card" }, [el("h2", { class: "pd-card-t", text: titulo }), ajuda ? el("p", { class: "hint", text: ajuda }) : null].concat(filhos)); }

  /** ctx: { sb, abrirDocumento(art, rotulo), msg(texto, tipo), nomeExib(obj) } */
  function montarAba(host, ctx) {
    host.innerHTML = "";
    var carregado = { empresas: [], pessoas: [] };

    /* 1. Tabela */
    var precos = {};
    var camposPreco = el("div", { class: "fields" }, SERVICOS.map(function (s) {
      var i = inp("pd-p-" + s.id, "number", { min: "0", step: "1", value: String(s.preco), inputmode: "decimal" });
      i.addEventListener("input", function () { precos[s.id] = i.value; });
      return campo(s.nome, i);
    }));
    var b1 = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Gerar tabela de serviços", onclick: function () {
      SERVICOS.forEach(function (s) { precos[s.id] = $v("pd-p-" + s.id); });
      ctx.abrirDocumento(tabela(precos), "Tabela de serviços de carreira");
    } });

    /* 2. Proposta */
    var modelo = sel("pd-modelo", Object.keys(PROPOSTAS).map(function (k) { return [k, PROPOSTAS[k].titulo]; }));
    var empSel = sel("pd-empresa", [], "Escolher empresa cadastrada (opcional)");
    var empNome = inp("pd-emp-nome", "text", { maxlength: "160" }), resp = inp("pd-emp-resp", "text", { maxlength: "120" }), cargo = inp("pd-emp-cargo", "text", { maxlength: "80" });
    var dataP = inp("pd-emp-data", "text", { value: hoje(), maxlength: "20" });
    var invest = inp("pd-emp-invest", "text", { maxlength: "300", placeholder: "Ex.: R$ 2.500 por vaga" });
    empSel.addEventListener("change", function () {
      var e = carregado.empresas.filter(function (x) { return x.id === empSel.value; })[0];
      if (!e) return;
      empNome.value = e.nome || ""; resp.value = e.contato_nome || ""; cargo.value = e.contato_cargo || "";
      if (e.valor_estimado) invest.value = reais(e.valor_estimado);
    });
    var b2 = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Gerar proposta", onclick: function () {
      ctx.abrirDocumento(proposta(modelo.value, { empresa: empNome.value, responsavel: resp.value, cargo: cargo.value, data: dataP.value, investimento: invest.value }), "Proposta · " + PROPOSTAS[modelo.value].titulo);
    } });

    /* 3. Contrato */
    var pesSel = sel("pd-pessoa", [], "Escolher pessoa em Orientação (opcional)");
    var cNome = inp("pd-c-nome", "text", { maxlength: "160" }), cCpf = inp("pd-c-cpf", "text", { maxlength: "20", placeholder: "000.000.000-00" }),
      cEnd = inp("pd-c-end", "text", { maxlength: "240" }), cContato = inp("pd-c-contato", "text", { maxlength: "200" });
    var cServ = sel("pd-c-serv", SERVICOS.map(function (s) { return [s.id, s.nome + " · " + reais(s.preco)]; }));
    cServ.value = "carreira360";
    var cValor = inp("pd-c-valor", "number", { min: "0", step: "1", value: "450", inputmode: "decimal" });
    var cPrazo = inp("pd-c-prazo", "text", { maxlength: "20", placeholder: "dias úteis" });
    var cEnt = inp("pd-c-ent", "number", { min: "0", max: "100", step: "5", value: "50" });
    var cAj = inp("pd-c-aj", "text", { maxlength: "20", value: "uma" });
    var cDet = el("textarea", { id: "pd-c-det", rows: "2", maxlength: "500", placeholder: "O que foi combinado na conversa inicial" });
    var lem = lembrado();
    var cCpfP = inp("pd-c-cpfp", "text", { maxlength: "20", value: lem.cpf || "" }), cEndP = inp("pd-c-endp", "text", { maxlength: "240", value: lem.end || "" });
    var cData = inp("pd-c-data", "text", { value: hoje(), maxlength: "20" });
    cServ.addEventListener("change", function () {
      var s = SERVICOS.filter(function (x) { return x.id === cServ.value; })[0];
      cValor.value = s.preco; cPrazo.value = s.prazo ? s.prazo.replace(/ dias úteis/, "") : "";
    });
    pesSel.addEventListener("change", function () {
      var p = carregado.pessoas.filter(function (x) { return x.id === pesSel.value; })[0];
      if (!p) return;
      cNome.value = p.nome || ""; cContato.value = [p.telefone, p.email].filter(Boolean).join(" / ");
      if (p.cidade) cEnd.value = [p.cidade, p.uf].filter(Boolean).join("/");
    });
    var lembrarCk = el("input", { type: "checkbox", id: "pd-c-lem" }); lembrarCk.checked = !!(lem.cpf || lem.end);
    var b3 = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Gerar contrato", onclick: function () {
      lembrar(lembrarCk.checked ? { cpf: cCpfP.value, end: cEndP.value } : {});
      ctx.abrirDocumento(contrato({ nome: cNome.value, cpf: cCpf.value, endereco: cEnd.value, contato: cContato.value, servico: cServ.value, valor: cValor.value,
        prazo: cPrazo.value, entrada: cEnt.value, ajustes: cAj.value, detalhes: cDet.value, cpfContratado: cCpfP.value, endContratado: cEndP.value, data: cData.value }), "Contrato de carreira");
    } });

    host.appendChild(card("Tabela de serviços de carreira (1 página, para WhatsApp)", "Ajuste os valores se precisar. O documento abre numa janela onde você ainda pode editar o texto antes de salvar em PDF.", [camposPreco, el("div", { class: "btn-row" }, [b1])]));
    host.appendChild(card("Proposta para empresa", "Escolha o modelo e, se quiser, uma empresa cadastrada. O que não for preenchido aparece em destaque para completar na janela do documento.", [
      el("div", { class: "fields" }, [campo("Modelo", modelo), campo("Empresa cadastrada", empSel), campo("Empresa", empNome), campo("Responsável", resp), campo("Cargo", cargo), campo("Data", dataP),
        campo("Investimento (opcional)", invest, "Se preencher, vira a primeira linha do investimento.", true)]),
      el("div", { class: "btn-row" }, [b2])]));
    host.appendChild(card("Contrato de carreira (pessoa física)", "Os dados da pessoa vêm do cadastro em Orientação. CPF e endereço seus não ficam no site: você digita e, se marcar a caixa, o navegador lembra só neste computador. Modelo a revisar com advogado antes de usar.", [
      el("div", { class: "fields" }, [campo("Pessoa em Orientação", pesSel), campo("Nome do contratante", cNome), campo("CPF do contratante", cCpf), campo("Endereço do contratante", cEnd), campo("Contato", cContato),
        campo("Serviço", cServ), campo("Valor (R$)", cValor), campo("Prazo (dias úteis)", cPrazo), campo("Entrada (%)", cEnt), campo("Rodadas de ajuste", cAj), campo("Data", cData),
        campo("Detalhes combinados", cDet, null, true),
        campo("Seu CPF (contratado)", cCpfP), campo("Seu endereço (contratado)", cEndP),
        el("div", { class: "field full" }, [el("label", { class: "check-inline", for: "pd-c-lem" }, [lembrarCk, " Lembrar meu CPF e endereço neste navegador"])])]),
      el("div", { class: "btn-row" }, [b3]),
      el("p", { class: "hint", text: "Depois de salvar o PDF, anexe-o em “Documentos” na ficha da pessoa (Orientação ou Banco de Talentos) para ficar guardado." })]));

    /* 4. Agendamento (página de reservas do Google Agenda, com Meet) */
    var LSA = "prh_agendamento";
    var urlAg = inp("pd-ag-url", "url", { maxlength: "300", placeholder: "https://calendar.app.google/..." });
    try { urlAg.value = localStorage.getItem(LSA) || ""; } catch (e) { /* sem armazenamento */ }
    var nomeAg = inp("pd-ag-nome", "text", { maxlength: "120", placeholder: "Nome da pessoa (opcional)" });
    var txtAg = el("textarea", { id: "pd-ag-txt", rows: "4", readonly: "readonly" });
    function montarTexto() {
      var u = urlAg.value.trim(), n = nomeAg.value.trim();
      if (u && !/^https:\/\//i.test(u)) { ctx.msg("Cole o link completo, começando com https://", "err"); return null; }
      try { localStorage.setItem(LSA, u); } catch (e) { /* ok */ }
      txtAg.value = "Olá" + (n ? ", " + n.split(" ")[0] : "") + "! Para marcarmos nossa conversa, escolha o dia e o horário que ficar melhor para você neste link: " + (u || "[cole aqui o link da sua página de agendamento]") + "\nAo confirmar, o link da reunião (Google Meet) chega no seu e-mail. Qualquer dúvida, me chame por aqui. — Álamo, Permanência RH";
      return txtAg.value;
    }
    var bCopiar = el("button", { type: "button", class: "btn btn-primary btn-sm", text: "Montar e copiar mensagem", onclick: function () {
      var t = montarTexto(); if (!t) return;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { ctx.msg("Mensagem copiada.", "ok"); }, function () { txtAg.select(); ctx.msg("Selecione e copie o texto abaixo.", "ok"); });
      else { txtAg.select(); ctx.msg("Selecione e copie o texto abaixo.", "ok"); }
    } });
    var bZap = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Abrir no WhatsApp", onclick: function () {
      var t = montarTexto(); if (!t) return;
      window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener");
    } });
    host.appendChild(card("Agendamento com Google Meet", "Crie uma vez a página de agendamento no Google Agenda (Criar → Programação de compromissos), com o local “Google Meet”. A pessoa escolhe entre os horários livres e, ao confirmar, o Google gera o link da reunião e coloca na sua agenda e na dela. Cole aqui o link da página: o navegador lembra só neste computador.", [
      el("div", { class: "fields" }, [campo("Link da página de agendamento", urlAg, null, true), campo("Nome da pessoa", nomeAg), campo("Mensagem pronta", txtAg, null, true)]),
      el("div", { class: "btn-row" }, [bCopiar, bZap])]));

    /* listas (só leitura; se faltar permissão, os campos seguem manuais) */
    ctx.sb.from("empresas").select("id,nome,contato_nome,contato_cargo,valor_estimado").order("nome").limit(500).then(function (r) {
      carregado.empresas = r.data || [];
      carregado.empresas.forEach(function (e) { empSel.appendChild(el("option", { value: e.id, text: e.nome })); });
    });
    ctx.sb.from("orientacao_clientes").select("id,nome,telefone,email,cidade,uf").order("nome").limit(500).then(function (r) {
      carregado.pessoas = r.data || [];
      carregado.pessoas.forEach(function (p) { pesSel.appendChild(el("option", { value: p.id, text: p.nome })); });
    });
  }
  function $v(id) { var x = document.getElementById(id); return x ? x.value : ""; }

  window.PRH_DOCS = { montarAba: montarAba, tabela: tabela, proposta: proposta, contrato: contrato, SERVICOS: SERVICOS, PROPOSTAS: PROPOSTAS };
})();
