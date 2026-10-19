const dashboardAlertasMock = (() => {
    const minuto = 60_000;
    const recursos = ['CPU', 'RAM', 'Disco', 'Rede'];
    const pesos = { normal: 0, atencao: 1, critico: 2 };
    const perfis = [{ id: '1', nome: 'Carrinho' }, { id: '2', nome: 'Financeiro' }, { id: '3', nome: 'Catálogo' }];
    const servidores = [
        ['cart-api-07', '1'], ['cart-api-12', '1'], ['cart-api-02', '1'], ['cart-api-09', '1'],
        ['pay-db-02', '2'], ['pay-api-04', '2'], ['pay-api-06', '2'],
        ['catalog-api-03', '3'], ['catalog-api-05', '3'], ['catalog-api-08', '3']
    ];

    // Rampa de demanda seguida de recuperação; horários de São Paulo (UTC−3).
    function onda(hora, inicio, pico, fim) {
        return Math.max(0, Math.min((hora - inicio) / (pico - inicio), (fim - hora) / (fim - pico)));
    }

    function criarBase(referencia) {
        const registros = [];
        for (let timestamp = referencia - 10080 * minuto; timestamp <= referencia; timestamp += 5 * minuto) {
            const local = new Date(timestamp - 3 * 60 * minuto);
            const hora = local.getUTCHours() + local.getUTCMinutes() / 60;
            const fatorDia = [1.12, 0.90, 0.94, 0.97, 1, 1.08, 1.15][local.getUTCDay()];
            const demanda = atraso => fatorDia * (
                0.92 * onda(hora - atraso, 10.5, 12.4, 15.6) +
                1.22 * onda(hora - atraso, 17, 19.5, 23)
            );
            servidores.forEach(([servidor, perfil], indice) => {
                const sensibilidade = [1.34, 1.18, 1.08, 0.88, 1.20, 1.10, 0.94, 1.12, 0.98, 0.86][indice];
                const variacao = 2 * Math.sin(hora * 2 + indice + local.getUTCDate());
                const valores = {
                    CPU: 27 + 58 * demanda(0) * sensibilidade + variacao,
                    RAM: 38 + 47 * demanda(0.35) * sensibilidade + variacao,
                    // Escritas de pagamentos e cache do catálogo pressionam disco no pico.
                    Disco: 40 + (indice === 4 ? 48 : indice === 8 ? 33 : 15) * demanda(0.5),
                    // O catálogo concentra o tráfego; os demais têm margem de rede.
                    Rede: 25 + (perfil === '3' ? 55 * sensibilidade : 24) * demanda(0)
                };
                recursos.forEach(recurso => registros.push(Object.freeze({
                    servidor, perfil, recurso, timestamp,
                    severidade: valores[recurso] >= 90 ? 'critico' : valores[recurso] >= 75 ? 'atencao' : 'normal'
                })));
            });
        }
        // Estados normais também são registrados para representar a recuperação.
        return Object.freeze(registros);
    }

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
        const granularidade = periodo <= 60 ? 5 : periodo <= 360 ? 15 : periodo <= 720 ? 30 : periodo <= 1440 ? 60 : 360;
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

    return { criarBase, agregar, recursos, perfis };
})();
