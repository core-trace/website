// Lê lotes/resumos da Gold e aplica as regras da etapa 4.3
// (limiares, primeiro desvio, deltas A->B, eventos, recorrência).

const LIMIARES = {
    cpu: { atencao: 60, critico: 80 },
    rssGb: { atencao: 2.0, critico: 2.5 }
};

function obterContexto(filtros) {
    // TODO: carregar servidores, janelas de análise e processos ativos
    return Promise.resolve({
        servidores: [],
        periodos: [],
        processosAtivos: [],
        intervalo: null
    });
}

function obterKpis(filtros) {
    // TODO: calcular os 6 cards (identificados, críticos, CPU/RAM elevadas, threads, eventos)
    return Promise.resolve({ kpis: [] });
}

function obterSerieTemporal(filtros) {
    // TODO: serie de CPU (%) e RSS (GB) do processo selecionado + limites, pico, primeiro desvio, comparativo A->B
    return Promise.resolve({
        cpu: { pontos: [], limites: LIMIARES.cpu },
        rss: { pontos: [], limites: LIMIARES.rssGb },
        primeiroDesvio: null,
        comparativo: null
    });
}

function obterVariacao(filtros) {
    // TODO: ranking por Δ CPU / Δ RSS (antes vs atual na janela)
    return Promise.resolve({ processos: [] });
}

function obterEventos(filtros) {
    // TODO: timeline de transições (início, aumento memória, limite excedido, atenção/crítico, encerrado)
    return Promise.resolve({ janelaInvestigacao: null, eventos: [] });
}

function listarTodos(filtros) {
    // TODO: tabela paginada/filtrável de todos os processos
    return Promise.resolve({ itens: [], total: 0, pagina: 1, porPagina: 10 });
}

function obterRecorrencia(filtros) {
    // TODO: agrupar por (processo/pid + tipo), ocorrências, última, duração média (encerradas), frequência 1-5
    return Promise.resolve({ itens: [] });
}

module.exports = {
    obterContexto,
    obterKpis,
    obterSerieTemporal,
    obterVariacao,
    obterEventos,
    listarTodos,
    obterRecorrencia
};