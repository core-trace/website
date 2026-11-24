const resumoGeralService = require("./resumoGeralService");
const geminiService = require("./geminiService");

// cada pergunta pronta tem seu proprio jeito de montar o contexto a partir do
// resumo real (/geral/resumo), e um texto fixo caso o gemini falhe
const PERGUNTAS = [
    {
        pergunta: "Por que o Financeiro é a prioridade?",
        montarContexto: resumo => `${resumo.resumo.titulo}. ${resumo.resumo.motivo} ${resumo.resumo.cobertura}`,
        respostaFixa: "O Financeiro tem a maior proporção de servidores afetados e o caso crítico mais antigo entre os perfis."
    },
    {
        pergunta: "O que mudou recentemente?",
        montarContexto: resumo => resumo.evolucaoLegenda,
        respostaFixa: "Consulte o gráfico de evolução acima pra ver o que mudou nesse horário."
    },
    {
        pergunta: "Algum risco está perto de virar um problema?",
        montarContexto: resumo => resumo.riscos.length === 0
            ? "Nenhum risco em acompanhamento no momento."
            : resumo.riscos.map(risco => `${risco.titulo}: ${risco.detalhe}`).join(" "),
        respostaFixa: "Consulte o card \"Riscos em acompanhamento\" acima pra ver os riscos reais do momento."
    },
    {
        pergunta: "O que significa sem dados recentes?",
        montarContexto: () => "Um servidor fica \"sem dados recentes\" quando a última leitura dele passou de 15 minutos sem chegar. Isso não quer dizer que o servidor tem problema, só que não sabemos o estado dele agora. Nesse caso, vale verificar se o script de captura (o agente) ainda está rodando naquele servidor.",
        respostaFixa: "A última leitura desse servidor passou de 15 minutos sem chegar. Não significa que o servidor está com problema — vale verificar se o script de captura ainda está rodando nele."
    },
    {
        pergunta: "Como exporto o relatório?",
        montarContexto: () => "O botão \"Exportar relatório\" no topo da tela baixa o PDF mais recente, gerado automaticamente a cada hora com o mesmo resumo e os mesmos números que a tela mostra agora.",
        respostaFixa: "Use o botão \"Exportar relatório\" no topo da tela. Ele gera um PDF com o mesmo resumo e os mesmos números que esta tela mostra agora."
    }
];

async function responderPergunta(perguntaTexto) {
    const item = PERGUNTAS.find(p => p.pergunta === perguntaTexto);
    if (!item) {
        return "Não conheço essa pergunta.";
    }

    const resumo = resumoGeralService.obterResumoGeral();
    const contexto = item.montarContexto(resumo);
    const prompt = `Contexto: ${contexto}\n\nPergunta: ${perguntaTexto}\n\nResponda em português, direto, em até 2 frases.`;

    try {
        return await geminiService.chamarGemini(prompt);
    } catch (erro) {
        console.error("Erro chamando o Gemini, usando resposta fixa:", erro.message);
        return item.respostaFixa;
    }
}

module.exports = { responderPergunta };
