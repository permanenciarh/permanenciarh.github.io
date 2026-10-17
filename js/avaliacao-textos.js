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

  // Sugestões para a lista de outros instrumentos do laudo
  instrumentos: ["Palográfico", "AC — Atenção Concentrada", "G36 — Raciocínio não verbal", "Entrevista por competências", "Entrevista com o gestor", "Teste situacional", "Dinâmica de grupo", "Prova prática / técnica", "Checagem de referências"]
};
