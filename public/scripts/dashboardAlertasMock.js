const dashboardAlertasMock = (() => {
    const minuto = 60_000;
    const recursos = ['CPU', 'RAM', 'Disco', 'Rede'];
    const pesos = { normal: 0, atencao: 1, critico: 2 };
    function reduzir(pontos, inicio, granularidade) {
        const janelas = new Map();
        pontos.forEach(ponto => {
            const chave = Math.floor((ponto.instante - inicio) / (granularidade * minuto));
            if (!janelas.has(chave)) janelas.set(chave, []);
            janelas.get(chave).push(ponto);
        });
        const selecionados = new Set(pontos.length ? [pontos[0], pontos.at(-1)] : []);
        // Seleciona coletas reais, mantendo juntos os estados das duas linhas.
        // Não soma estados de horários diferentes nem oculta picos breves.
        janelas.forEach(janela => {
            ['atencao', 'critico'].forEach(nivel => {
                selecionados.add(janela.reduce((a, b) => b[nivel] > a[nivel] ? b : a));
                selecionados.add(janela.reduce((a, b) => b[nivel] < a[nivel] ? b : a));
            });
        });
        return [...selecionados].sort((a, b) => a.instante - b.instante);
    }

    function agregar(registros, { inicio, fim, perfil = '' }) {
        const periodo = (fim - inicio) / minuto;
        const granularidade = periodo <= 60 ? 1 : periodo <= 360 ? 15 : periodo <= 720 ? 30 : periodo <= 1440 ? 60 : 360;
        const porRecurso = new Map(recursos.map(recurso => [recurso, new Map()]));
        const porInstante = new Map();
        const servidoresNoPeriodo = new Set();
        for (const registro of registros) {
            if (registro.timestamp < inicio || registro.timestamp > fim || (perfil && registro.perfil !== perfil)) continue;
            const peso = pesos[registro.severidade];
            servidoresNoPeriodo.add(registro.servidor);
            const recurso = porRecurso.get(registro.recurso);
            recurso.set(registro.servidor, Math.max(recurso.get(registro.servidor) || 0, peso));
            if (!porInstante.has(registro.timestamp)) porInstante.set(registro.timestamp, new Map());
            const estados = porInstante.get(registro.timestamp);
            estados.set(registro.servidor, Math.max(estados.get(registro.servidor) || 0, peso));
        }
        const contar = estados => {
            const contagem = { atencao: 0, critico: 0 };
            estados.forEach(peso => {
                if (peso === 2) contagem.critico++;
                else if (peso === 1) contagem.atencao++;
            });
            return contagem;
        };
        const pontos = [...porInstante].sort((a, b) => a[0] - b[0]).map(([instante, estados]) => ({ instante, ...contar(estados) }));
        return {
            inicio, fim, periodo, granularidade, totalServidores: servidoresNoPeriodo.size,
            recursos: Object.fromEntries([...porRecurso].map(([recurso, estados]) => [recurso, contar(estados)])),
            evolucao: reduzir(pontos, inicio, granularidade)
        };
    }

    return { agregar, recursos };
})();
