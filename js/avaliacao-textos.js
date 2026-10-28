/**
 * Permanência RH — textos de interpretação usados no laudo (painel).
 * Fonte: planilha "Etapa 2 - Testes comportamentais" (abas Informações e Pref. cerebral),
 * reescritos em linguagem simples. Edite aqui para mudar o que aparece no laudo.
 */
window.PRH_AVAL_TEXTOS = {
  perfil: {
    I: {
      chave: "aguia", nome: "Águia", papel: "Idealizador", lema: "Fazer diferente", tema: "inovacao",
      comportamento: "Criativo, intuitivo e voltado para o futuro. Curioso, informal e flexível; costuma questionar o jeito de sempre e trazer ideias novas.",
      fortes: ["Criatividade e visão de futuro", "Provoca e conduz mudanças", "Antecipa tendências e enxerga o todo"],
      atencao: ["Pode perder a atenção ao presente e aos detalhes", "Impaciência com rotina; tende a defender o novo só por ser novo", "Precisa cuidar da execução e do trabalho em equipe"],
      motivacoes: ["Liberdade de expressão e de criação", "Pouco controle rígido", "Oportunidade de delegar tarefas operacionais"],
      valores: "Criatividade e liberdade (inspirar ideias)"
    },
    C: {
      chave: "gato", nome: "Gato", papel: "Comunicador", lema: "Fazer junto", tema: "pessoas",
      comportamento: "Sensível, orientado a relacionamentos e ao time. Busca harmonia, valoriza a contribuição de cada um e preserva a cultura do grupo.",
      fortes: ["Comunicação aberta e acolhedora", "Mantém a harmonia e o clima da equipe", "Desenvolve e sustenta a cultura do grupo"],
      atencao: ["Pode evitar ou esconder conflitos necessários", "Tende a colocar o bem-estar do grupo acima do resultado", "Precisa trabalhar objetividade, prazos realistas e controle do tempo"],
      motivacoes: ["Segurança e aceitação social", "Reconhecimento da equipe", "Liderança próxima e ambiente harmônico", "Trabalho em grupo e construção de consenso"],
      valores: "Felicidade e igualdade (pensa nos outros)"
    },
    O: {
      chave: "lobo", nome: "Lobo", papel: "Organizador", lema: "Fazer certo", tema: "metodo",
      comportamento: "Detalhista, organizado e estrategista. Pontual, previsível e conservador; busca conhecimento e segue regras e procedimentos.",
      fortes: ["Organização, consistência e qualidade", "Conformidade com regras e responsabilidades", "Lealdade e confiabilidade"],
      atencao: ["Dificuldade de adaptação a mudanças repentinas", "Excesso de detalhe e de estrutura pode travar o progresso", "Precisa desenvolver flexibilidade e aceitação de outros estilos"],
      motivacoes: ["Certeza e regras claras", "Conhecimento específico do trabalho", "Ausência de riscos e erros", "Ver o trabalho do começo ao fim"],
      valores: "Ordem e controle"
    },
    A: {
      chave: "tubarao", nome: "Tubarão", papel: "Executor", lema: "Fazer rápido", tema: "resultado",
      comportamento: "Senso de urgência, iniciativa e praticidade. Focado no aqui e agora, gosta de vencer desafios, é autossuficiente e tende a não delegar.",
      fortes: ["Ação e foco em resultado", "Faz as coisas acontecerem", "Combate a burocracia e motiva pela energia"],
      atencao: ["Relacionamento pode ficar em segundo plano", "Impulsividade; tende a fazer do jeito mais rápido", "Precisa desenvolver paciência, escuta e trabalho coletivo"],
      motivacoes: ["Liberdade para agir e controle das próprias atividades", "Resolver problemas do seu jeito", "Competição e variedade de atividades", "Não repetir tarefas"],
      valores: "Resultado"
    }
  },

  // Preferência cerebral: combinação dos quatro perfis (planilha "Pref. cerebral")
  cerebral: {
    esquerdo: { nome: "Lado esquerdo", sub: "razão · Lobo + Tubarão", tracos: ["Detalhista", "Lógico", "Analítico", "Cauteloso", "Verbal", "Memória", "Cético", "Repetitivo"] },
    direito: { nome: "Lado direito", sub: "emoção · Águia + Gato", tracos: ["Amplo", "Criativo", "Intuitivo", "Sintético", "Receptivo", "Aberto", "Aventureiro", "Busca novos caminhos"] },
    anterior: { nome: "Região anterior", sub: "planejar e idealizar · Águia + Lobo", tracos: ["Pensa antes de agir", "Planejamento e visão", "Prefere entender o porquê e o como"] },
    posterior: { nome: "Região posterior", sub: "agir e se relacionar · Gato + Tubarão", tracos: ["Aprende fazendo", "Ação e contato com pessoas", "Prefere o concreto e o imediato"] }
  },

  eneagrama: {
    1: { nome: "Perfeccionista", tema: "metodo",
      essencia: "Busca fazer o certo e melhorar o que está ao redor. Tem padrões elevados, senso de ética e responsabilidade.",
      trabalho: "Contribui com qualidade, organização, cumprimento de regras e melhoria contínua.",
      fortes: ["Responsabilidade e ética", "Atenção à qualidade e aos detalhes", "Disciplina e organização"],
      atencao: ["Autocrítica e crítica aos outros", "Rigidez e dificuldade de delegar", "Irritação contida quando as coisas saem do padrão"],
      gestao: "Responde bem a critérios claros e a reconhecimento pelo trabalho bem feito. Ajuda combinar o que é \"bom o suficiente\"." },
    2: { nome: "Prestativo", tema: "pessoas",
      essencia: "Movido pela vontade de ajudar e de ser importante para os outros. Atencioso, generoso e caloroso.",
      trabalho: "Contribui com apoio às pessoas, cooperação, atendimento e clima de equipe.",
      fortes: ["Empatia e disponibilidade", "Facilidade para criar vínculos", "Espírito de servir"],
      atencao: ["Dificuldade de dizer não", "Pode esquecer as próprias necessidades", "Busca de aprovação e reconhecimento"],
      gestao: "Responde bem a reconhecimento pessoal e a uma relação de confiança. Ajuda definir limites claros de responsabilidade." },
    3: { nome: "Realizador", tema: "resultado",
      essencia: "Orientado a metas, imagem e sucesso. Adaptável, competitivo e eficiente.",
      trabalho: "Contribui com produtividade, foco em resultado, energia e capacidade de se adaptar ao que o contexto pede.",
      fortes: ["Foco em objetivos e eficiência", "Iniciativa e boa apresentação", "Capacidade de motivar e de se adaptar"],
      atencao: ["Pode priorizar a imagem e o resultado acima das pessoas", "Excesso de trabalho e competitividade", "Dificuldade de lidar com o fracasso"],
      gestao: "Responde bem a metas desafiadoras, visibilidade e reconhecimento por conquistas. Ajuda equilibrar resultado com relacionamento." },
    4: { nome: "Individualista", tema: "inovacao",
      essencia: "Busca autenticidade e significado. Sensível, criativo, introspectivo e atento às emoções.",
      trabalho: "Contribui com criatividade, estética, profundidade e empatia em situações delicadas.",
      fortes: ["Criatividade e originalidade", "Sensibilidade e empatia", "Autenticidade"],
      atencao: ["Oscilações de humor", "Sensação de ser incompreendido", "Dificuldade com tarefas rotineiras"],
      gestao: "Responde bem a trabalhos com propósito e espaço para se expressar. Ajuda dar retorno cuidadoso e específico." },
    5: { nome: "Observador", tema: "metodo",
      essencia: "Busca compreender e dominar o conhecimento. Reservado, analítico, independente e objetivo.",
      trabalho: "Contribui com análise, pensamento crítico, especialização técnica e decisões bem fundamentadas.",
      fortes: ["Capacidade analítica", "Objetividade e calma", "Domínio técnico e independência"],
      atencao: ["Distanciamento e pouca expressão emocional", "Pode demorar para agir enquanto analisa", "Reserva de tempo, energia e informação"],
      gestao: "Responde bem a autonomia, tempo para pensar e informação antecipada. Ajuda incentivar a participação e a troca com o time." },
    6: { nome: "Leal", tema: "metodo",
      essencia: "Busca segurança e confiança. Responsável, comprometido, prudente e atento a riscos.",
      trabalho: "Contribui com lealdade, prevenção de problemas, trabalho em equipe e cumprimento de compromissos.",
      fortes: ["Comprometimento e lealdade", "Antecipação de riscos", "Senso de responsabilidade com o grupo"],
      atencao: ["Desconfiança e ansiedade diante do incerto", "Dúvida e hesitação para decidir", "Pode questionar a autoridade ou depender dela"],
      gestao: "Responde bem a orientações claras, coerência da liderança e ambiente previsível. Ajuda explicar o porquê das mudanças." },
    7: { nome: "Entusiasta", tema: "inovacao",
      essencia: "Busca experiências, liberdade e possibilidades. Otimista, espontâneo, versátil e bem-humorado.",
      trabalho: "Contribui com ideias, energia, otimismo e capacidade de conectar assuntos diferentes.",
      fortes: ["Otimismo e entusiasmo", "Criatividade e versatilidade", "Facilidade de comunicação"],
      atencao: ["Dispersão e dificuldade de concluir", "Evitar o que é desconfortável ou repetitivo", "Impulsividade nos compromissos"],
      gestao: "Responde bem a variedade, desafios novos e liberdade. Ajuda combinar prazos e entregas intermediárias." },
    8: { nome: "Desafiador", tema: "resultado",
      essencia: "Busca controle e autonomia. Assertivo, direto, protetor e decidido.",
      trabalho: "Contribui com liderança, firmeza em decisões, coragem para enfrentar problemas e proteção do time.",
      fortes: ["Assertividade e decisão", "Liderança e senso de justiça", "Força para enfrentar desafios"],
      atencao: ["Pode ser impositivo ou intimidador", "Baixa tolerância a vulnerabilidade e lentidão", "Confronto em excesso"],
      gestao: "Responde bem a franqueza, autonomia e desafios reais. Ajuda dar retorno direto e combinar limites com clareza." },
    9: { nome: "Pacificador", tema: "pessoas",
      essencia: "Busca harmonia e estabilidade. Calmo, receptivo, conciliador e paciente.",
      trabalho: "Contribui com mediação de conflitos, estabilidade, escuta e visão de várias perspectivas.",
      fortes: ["Escuta e diplomacia", "Calma sob pressão", "Aceitação e capacidade de integrar pessoas"],
      atencao: ["Evitar conflitos e adiar decisões", "Dificuldade de priorizar e de se posicionar", "Pode se acomodar"],
      gestao: "Responde bem a ambiente estável e a prioridades claras. Ajuda pedir posicionamento e acompanhar prazos." }
  },

  temas: {
    resultado: "orientação a resultados, iniciativa e senso de urgência",
    pessoas: "foco em relacionamento, cooperação e cuidado com o clima",
    metodo: "organização, cautela e cuidado com a qualidade",
    inovacao: "criatividade, abertura a novidades e visão de futuro"
  },

  /* ---------------------------------------------------------------------------------------------
   * DISC exploratório (20 afirmações, 5 por dimensão, escala 1 a 5, média 1 a 5).
   * Instrumento autoral, sem validação psicométrica nem normas. As faixas de leitura (4,0–5,0 / 3,0–3,9 /
   * 1,0–2,9) e os textos abaixo foram adaptados do "Guia de interpretação aprofundada" da Permanência:
   * descrevem tendências autorrelatadas e hipóteses a confirmar, nunca traços fixos ou aptidão.
   * Equivalência com as dimensões do guia: D = Ação e resultados · I = Comunicação e influência ·
   * S = Estabilidade e cooperação · C = Análise e qualidade.
   * ------------------------------------------------------------------------------------------- */
  disc: {
    D: { nome: "Dominância", foco: "ação e resultados",
      leitura: "As respostas indicam concordância com comportamentos de iniciativa, orientação a metas, disposição para resolver problemas e conforto para decidir e agir. Pode ser útil em ambientes dinâmicos, com metas claras e responsabilização.",
      uteis: ["Iniciativa e disposição para resolver problemas", "Orientação a metas e a entregas", "Conforto para decidir e assumir responsabilidade"],
      verificar: ["Se a velocidade preserva qualidade, segurança e colaboração", "Se alinha expectativas antes de agir", "Se distingue urgência de importância e respeita ritmos diferentes"],
      menor: "Concordância menor não indica falta de iniciativa: pode refletir cautela, metas pouco claras, pouca autonomia, sobrecarga ou um ambiente que penaliza tentativas.",
      pressao: "acelerar, assumir o controle, priorizar o resultado ou decidir antes do alinhamento",
      perguntas: ["Como você escolhe o que fazer primeiro?", "Conte uma decisão rápida que deu certo e uma em que teria sido melhor alinhar ou analisar mais.", "Como você protege a qualidade e a participação da equipe em situações urgentes?"] },
    I: { nome: "Influência", foco: "comunicação e influência",
      leitura: "As respostas indicam concordância com comportamentos de adaptar a mensagem, apresentar ideias, criar conexões e mobilizar pessoas. Pode ajudar em alinhamentos, atendimento, negociação, integração de colegas e comunicação de mudanças.",
      uteis: ["Facilidade para apresentar ideias e envolver pessoas", "Criação de proximidade e clima positivo", "Mobilização de pessoas em torno de um objetivo"],
      verificar: ["Se escuta antes de responder e confirma que foi compreendido", "Se transforma conversas em decisões, responsáveis e registros", "Se cuida da confidencialidade ao compartilhar informações"],
      menor: "Concordância menor não indica dificuldade social: pode refletir preferência por comunicação objetiva, escrita ou individual, menor exposição exigida pelo cargo ou comportamentos que só aparecem com confiança.",
      pressao: "falar mais, tentar convencer, buscar apoio ou perder o foco da mensagem",
      perguntas: ["Como você confirma que foi compreendido?", "Conte uma situação em que precisou influenciar alguém sem autoridade formal.", "O que você faz para escutar e registrar decisões quando o tempo é curto?"] },
    S: { nome: "Estabilidade", foco: "cooperação e constância",
      leitura: "As respostas indicam concordância com comportamentos de constância, paciência, cooperação, previsibilidade e respeito a combinados. Pode contribuir para rotinas, acompanhamento, suporte, integração da equipe e relações de trabalho confiáveis.",
      uteis: ["Constância e respeito aos combinados", "Escuta paciente e cooperação", "Construção de confiança antes de mudanças"],
      verificar: ["Se sinaliza discordância a tempo, sem evitar conversas difíceis", "Se aceita demandas só para preservar a harmonia", "Se precisa de tempo adicional diante de mudanças rápidas de prioridade"],
      menor: "Concordância menor pode indicar preferência por variedade, autonomia ou ritmo acelerado, mas também pode refletir um contexto instável. Cooperação não deve ser confundida com submissão.",
      pressao: "buscar consenso, preservar a rotina, adiar o confronto ou precisar de tempo para se adaptar",
      perguntas: ["Como você reage quando as prioridades mudam de repente?", "Como diz “não” ou apresenta uma discordância?", "O que ajuda você a manter a constância sem perder a flexibilidade?"] },
    C: { nome: "Conformidade", foco: "análise e qualidade",
      leitura: "As respostas indicam concordância com comportamentos de atenção a detalhes, evidências, critérios, consistência e planejamento. Pode apoiar controles, qualidade, análise de dados, revisão e decisões com consequências relevantes.",
      uteis: ["Atenção a dados, detalhes e inconsistências", "Comparação de alternativas antes de decidir", "Cuidado com padrões, critérios e requisitos"],
      verificar: ["Se define o nível de detalhe de acordo com o risco e o prazo", "Se consegue decidir sem certeza absoluta", "Se comunica correções sem que soem excessivamente críticas"],
      menor: "Concordância menor não significa incapacidade analítica: pode refletir preferência pela visão geral, experiência prática, menor exigência de documentação ou urgência operacional.",
      pressao: "aumentar as checagens, buscar mais dados, focar nas inconsistências ou demorar para concluir",
      perguntas: ["Que evidência faria você mudar de opinião?", "Como decide quando parar de analisar e avançar?", "Como comunica um erro sem perder a colaboração?"] }
  },

  // Combinações das duas dimensões mais próximas do topo (hipóteses de conversa, não tipos fixos de pessoa)
  discCombinacoes: {
    DI: { titulo: "D + I · Mobilização orientada à entrega",
      hipotese: "pode combinar capacidade de comunicar e mobilizar com impulso para transformar ideias em ação. Pode ser útil em vendas, projetos, atendimento, negociação e liderança de iniciativas.",
      tensao: "entusiasmo e urgência podem fazer com que detalhes, escuta ou alinhamentos sejam abreviados.",
      explorar: "Como transforma conversas em responsáveis, prazos e acompanhamento?" },
    DS: { titulo: "D + S · Entrega com continuidade",
      hipotese: "pode buscar resultados sem abandonar constância, compromisso e cooperação. Pode contribuir para rotinas com metas, acompanhamento operacional e execução sustentada.",
      tensao: "pode sentir conflito entre acelerar e manter a estabilidade, ou assumir compromissos em excesso para atender às expectativas.",
      explorar: "Como prioriza, renegocia prazos e se recupera depois de picos de demanda?" },
    DC: { titulo: "D + C · Decisão com foco e critério",
      hipotese: "pode combinar orientação a resultados com atenção a evidências, riscos e qualidade. Pode contribuir para a resolução de problemas, a melhoria de processos e decisões com indicadores.",
      tensao: "pode oscilar entre agir rápido e revisar muito, ou usar a análise para justificar uma decisão já tomada.",
      explorar: "Quais são seus critérios de decisão, os riscos que tolera e o prazo-limite para analisar?" },
    IS: { titulo: "I + S · Relacionamento com constância",
      hipotese: "pode valorizar vínculo, cooperação e uma comunicação que preserve a confiança. Pode contribuir para integração, atendimento contínuo, suporte e mediação de relações.",
      tensao: "para preservar a harmonia, pode adiar conversas difíceis ou evitar limites claros.",
      explorar: "Como exerce assertividade, dá feedback e comunica expectativas?" },
    IC: { titulo: "I + C · Comunicação fundamentada",
      hipotese: "pode combinar a apresentação de ideias com a preocupação de organizar argumentos e informações. Pode apoiar treinamentos, consultoria, apresentações técnicas e a comunicação de decisões.",
      tensao: "pode alternar entre explicar demais e buscar uma formulação perfeita, ou apresentar argumentos convincentes sem adaptar o nível de detalhe ao público.",
      explorar: "Como sintetiza e como garante que escutou o público?" },
    SC: { titulo: "S + C · Consistência e precisão",
      hipotese: "pode valorizar estabilidade, método, qualidade e previsibilidade. Pode contribuir para controles, processos, documentação, conformidade e acompanhamento detalhado.",
      tensao: "mudanças rápidas e decisões incompletas podem gerar desconforto, e pode haver cautela excessiva diante da incerteza.",
      explorar: "Como lida com experimentos pequenos, critérios mínimos de qualidade e decisões reversíveis?" }
  },

  /* Big Five exploratório (30 afirmações, 6 por dimensão, escala 1 a 5, média 1 a 5).
   * O próprio material proíbe classificar em baixo/médio/alto sem validação e normas:
   * aqui só se registram médias descritivas e se descreve o que as afirmações da dimensão cobrem. */
  bigfive: {
    O: { nome: "Abertura", cobre: "curiosidade, interesse por ideias e métodos novos e disposição para considerar perspectivas diferentes",
      explorar: "Em que situações você experimenta um método novo e em quais prefere o que já foi testado?" },
    C: { nome: "Conscienciosidade", cobre: "organização das tarefas, cumprimento de prazos, atenção a detalhes e foco em atividades prolongadas",
      explorar: "Como você organiza prioridades e acompanha pendências quando o volume de trabalho aumenta?" },
    E: { nome: "Extroversão", cobre: "facilidade para iniciar conversas, participar de grupos, compartilhar ideias e ganhar energia nas interações",
      explorar: "Em que tipo de ambiente de trabalho você contribui mais e em qual precisa de mais preparo?" },
    A: { nome: "Amabilidade", cobre: "consideração pelo ponto de vista do outro, busca de soluções respeitosas em desacordos, ajuda e feedback com respeito",
      explorar: "Como você apresenta uma discordância ou um feedback difícil sem perder a relação?" },
    N: { nome: "Neuroticismo", cobre: "reação a críticas, preocupação diante da incerteza, dificuldade de relaxar sob pressão e, nos itens invertidos, recuperar o foco, administrar reações e pensar nos próximos passos diante de imprevistos",
      explorar: "O que ajuda você a recuperar o foco depois de uma crítica ou de um imprevisto?" }
  },
  bigfiveAviso: "Big Five exploratório: instrumento autoral, sem validação psicométrica nem normas. As médias descrevem concordância com as afirmações e não classificam a pessoa em baixo, médio ou alto. Não é teste psicológico e não permite diagnóstico.",
  discAviso: "DISC exploratório: instrumento autoral, sem validação psicométrica nem normas. Indica apenas a concordância da pessoa com as afirmações desta versão e não é um perfil DISC oficial. Não é teste psicológico e não deve ser usado como critério isolado de seleção.",

  /* Roteiro de entrevista de orientação de carreira: blocos de perguntas abertas; as anotações ficam no painel (uso interno) */
  carreira: {
    como: "Use como guia, não como questionário: escolha as perguntas que fazem sentido para a pessoa e deixe a conversa fluir. Anote o que ela disse com as palavras dela e separe, nas anotações, o que é fato do que é sua leitura. Evite prometer resultado ou indicar uma carreira “certa”: o papel é ajudar a pessoa a decidir com mais clareza.",
    blocos: [
      { id: "demanda", nome: "Momento atual e demanda", perguntas: ["O que fez você procurar a orientação agora?", "O que você espera ter ao final do nosso trabalho?", "O que já tentou antes e o que aconteceu?"] },
      { id: "trajetoria", nome: "Trajetória e conquistas", perguntas: ["Conte seu caminho profissional e de estudos até aqui.", "De quais entregas ou fases você mais se orgulha? O que fez delas boas?", "Em que momentos sentiu que estava no lugar certo? E no errado?"] },
      { id: "valores", nome: "Valores e motivações", perguntas: ["O que não pode faltar em um trabalho para você (autonomia, estabilidade, propósito, reconhecimento, remuneração, tempo)?", "O que você não aceita mais?", "O que te faz perder a noção do tempo trabalhando?"] },
      { id: "habilidades", nome: "Habilidades e interesses", perguntas: ["Do que as pessoas costumam te pedir ajuda?", "O que você faz com facilidade e os outros acham difícil?", "O que você gostaria de aprender, mesmo sem saber se daria dinheiro?"] },
      { id: "contexto", nome: "Contexto e restrições", perguntas: ["Quais são as condições práticas hoje (renda necessária, horário, cidade, família, saúde, transporte)?", "O que é negociável e o que é inegociável?", "Quem apoia ou pressiona essa decisão?"] },
      { id: "mercado", nome: "Mercado e alternativas", perguntas: ["Quais caminhos você já considerou? O que atrai e o que preocupa em cada um?", "O que você sabe sobre o que o mercado pede nesses caminhos?", "Conhece alguém que faz o que você quer fazer? Dá para conversar com essa pessoa?"] },
      { id: "obstaculos", nome: "Obstáculos e crenças", perguntas: ["O que te impede de dar o próximo passo?", "Que frases você repete sobre si mesmo(a) quando pensa em mudar?", "O que seria o pior que poderia acontecer? Como você lidaria?"] },
      { id: "futuro", nome: "Visão de futuro e critérios de sucesso", perguntas: ["Como seria um dia de trabalho bom daqui a dois anos?", "Como você vai saber que deu certo?", "Qual é o menor passo que você pode dar nas próximas duas semanas?"] }
    ]
  },

  /* Entrevista por competências (STAR): 7 competências, nota de 1 a 4 ou NE (formulário 3 e rubrica do formulário 4) */
  star: {
    competencias: [
      { id: "problemas", nome: "Resolução de problemas", pergunta: "Conte uma situação em que precisou resolver um problema difícil." },
      { id: "planejamento", nome: "Planejamento", pergunta: "Fale de uma ocasião em que precisou conciliar várias prioridades." },
      { id: "comunicacao", nome: "Comunicação", pergunta: "Descreva uma situação em que explicou algo complexo ou alinhou pessoas com opiniões diferentes." },
      { id: "equipe", nome: "Trabalho em equipe", pergunta: "Conte sobre um objetivo alcançado com a colaboração de outras pessoas." },
      { id: "adaptacao", nome: "Adaptação", pergunta: "Fale de uma mudança inesperada que afetou sua rotina." },
      { id: "qualidade", nome: "Qualidade e responsabilidade", pergunta: "Conte sobre um erro, desvio ou risco que identificou e como lidou." },
      { id: "lideranca", nome: "Liderança e influência", pergunta: "Descreva uma situação em que mobilizou pessoas para alcançar um objetivo." }
    ],
    notas: { "1": ["Evidência insuficiente", "Resposta vaga, sem exemplo verificável ou sem contribuição individual identificável."],
             "2": ["Evidência parcial", "Exemplo parcialmente relevante; ações ou resultados pouco claros."],
             "3": ["Evidência consistente", "Exemplo claro, ações pertinentes e resultado ou aprendizado identificável."],
             "4": ["Evidência forte", "Exemplo específico, contribuição individual clara, decisões justificadas e resultado ou evidência robusta."],
             "NE": ["Não evidenciado", "Não houve evidência suficiente para avaliar; não equivale automaticamente à nota 1."] },
    como: "Peça um exemplo real e específico do passado. Diferencie o que a pessoa fez diretamente da ação da equipe. Faça perguntas de aprofundamento sem sugerir a resposta."
  },

  // Sugestões para a lista de outros instrumentos do laudo
  instrumentos: ["Palográfico", "AC — Atenção Concentrada", "G36 — Raciocínio não verbal", "Entrevista com o gestor", "Teste situacional", "Dinâmica de grupo", "Prova prática / técnica", "Checagem de referências"]
};
