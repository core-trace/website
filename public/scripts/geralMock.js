// Dados mocados
const geralMock = {
    estado: { titulo: "Última leitura: 20h30", data: "27 nov 2026" },

    cobertura: { avaliados: 9, esperados: 10 },

    indicadores: {
        criticos: 2, criticosLegenda: "Financeiro e Carrinho",
        atencao: 2, atencaoLegenda: "Financeiro e Carrinho",
        semDadosRecentes: 1, semDadosLegenda: "Perfil Catálogo"
    },

    resumo: {
        titulo: "Financeiro exige atenção primeiro",
        motivo: "Maior proporção de servidores afetados e crítico mais antigo.",
        comparacao: [
            { perfil: "Financeiro", afetados: "2 de 3 afetados", duracao: "Crítico há 45 min" },
            { perfil: "Carrinho", afetados: "2 de 4 afetados", duracao: "Crítico há 25 min" }
        ],
        cobertura: "Entre os 10 servidores, 9 puderam ser avaliados"
    },

    acoes: [
        { titulo: "Investigar o Financeiro", destino: "Alertas · pay-api-04 e pay-db-02" },
        { titulo: "Verificar a coleta de catalog-api-03", destino: "Servidores · última leitura às 18h50" },
        { titulo: "Comparar o pico do Carrinho", destino: "Servidores · cart-api-07, 26 e 27 nov" }
    ],

    perfis: [
        {
            nome: "Financeiro", sinal: "CPU e memória", afetados: "2 de 3", proporcao: "67% do perfil",
            distribuicao: { critico: 1, atencao: 1, normal: 1, semDados: 0 },
            descricao: "1 crítico · 1 atenção · 1 normal",
            duracao: "45 min", referencia: "Desde 19h45"
        },
        {
            nome: "Carrinho", sinal: "CPU", afetados: "2 de 4", proporcao: "50% do perfil",
            distribuicao: { critico: 1, atencao: 1, normal: 2, semDados: 0 },
            descricao: "1 crítico · 1 atenção · 2 normais",
            duracao: "25 min", referencia: "Desde 20h05"
        },
        {
            nome: "Catálogo", sinal: "Lacuna de coleta", afetados: "0 confirmados", proporcao: "2 de 3 avaliados",
            distribuicao: { critico: 0, atencao: 0, normal: 2, semDados: 1 },
            descricao: "2 normais · 1 sem dados recentes",
            duracao: "—", referencia: "Nenhum entre os avaliados"
        }
    ],

    evolucao: {
        horarios: ["19h00", "19h25", "19h45", "20h05", "20h30"],
        criticos: [0, 0, 1, 2, 2],
        atencao: [1, 3, 3, 2, 2]
    },
    evolucaoLegenda: "Às 20h05, um servidor passou de atenção para crítico. O total de afetados continuou em 4.",

    riscos: [
        {
            tag: "Perto do limite", tom: "atencao", titulo: "Memória · pay-db-02",
            detalhe: "83% em uso · limite crítico de 85% · tendência de alta.",
            acao: "Revisar o histórico de memória."
        },
        {
            tag: "Projeção de limite", tom: "neutro", titulo: "Disco · catalog-api-05",
            detalhe: "82% em uso · pode atingir 90% por volta de 30 nov.",
            acao: "Revisar retenção e espaço disponível."
        }
    ],

    perguntasProntas: [
        {
            pergunta: "Por que o Financeiro é a prioridade?",
            resposta: "O Financeiro tem 2 de 3 servidores afetados (67%), a proporção mais alta entre os perfis, e o caso crítico mais antigo (pay-api-04, há 45 minutos)."
        },
        {
            pergunta: "O que mudou recentemente?",
            resposta: "cart-api-07 passou de atenção para crítico por CPU. O total de servidores afetados no Carrinho continuou em 2 de 4."
        },
        {
            pergunta: "Algum risco está perto de virar um problema?",
            resposta: "Consulte o card \"Riscos em acompanhamento\" acima pra ver os riscos reais do momento."
        },
        {
            pergunta: "O que significa sem dados recentes?",
            resposta: "A última leitura desse servidor passou de 15 minutos sem chegar. Não significa que o servidor está com problema — vale verificar se o script de captura ainda está rodando nele."
        },
        {
            pergunta: "Como exporto o relatório?",
            resposta: "Use o botão \"Exportar relatório\" no topo da tela. Ele gera um PDF com o mesmo resumo e os mesmos números que esta tela mostra agora."
        }
    ]
};
