const dashboardDados = (() => {
    const recursos = ["CPU", "RAM", "Disco", "Rede"];
    const pesos = { "sem-dados": -1, normal: 0, atencao: 1, critico: 2 };
    const maior = (a, b) => pesos[a] >= pesos[b] ? a : b;
    const operadores = { ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b };
    const temValor = (componente, coleta) => Number.isFinite(coleta?.valores?.[componente.coluna]);
    const indices = new WeakMap();

    // Seleciona amostras reais, incluindo extremos locais. Não cria médias ou timestamps fictícios.
    function reduzirPontos(amostras, colunas, maximo = 600) {
        if (amostras.length <= maximo) return amostras;
        const selecionados = new Set([0, amostras.length - 1]);
        // Preserva as bordas de toda lacuna, mesmo que o orçamento nominal seja excedido.
        for(let i=1;i<amostras.length;i++) for(const coluna of colunas) {
            if(Number.isFinite(amostras[i].valores[coluna]) !== Number.isFinite(amostras[i-1].valores[coluna])) {
                selecionados.add(i-1); selecionados.add(i);
            }
        }
        const tamanho = Math.ceil(amostras.length / Math.floor((maximo - 2) / (colunas.length * 2)));
        for (let inicio = 0; inicio < amostras.length; inicio += tamanho) {
            const fim = Math.min(inicio + tamanho, amostras.length);
            for (const coluna of colunas) {
                let menor = inicio, maior = inicio;
                for (let i = inicio + 1; i < fim; i++) {
                    if (amostras[i].valores[coluna] < amostras[menor].valores[coluna]) menor = i;
                    if (amostras[i].valores[coluna] > amostras[maior].valores[coluna]) maior = i;
                }
                selecionados.add(menor);
                selecionados.add(maior);
            }
        }
        return [...selecionados].sort((a, b) => a - b).map(indice => amostras[indice]);
    }

    function classificar(componentes, coleta) {
        const porRecurso = Object.fromEntries(recursos.map(recurso => [recurso, { monitorado: false, comDados: false, severidade: "sem-dados" }]));
        const alertas = [];
        let severidade = "sem-dados";
        let incompleto = false;
        const vistos = new Set();
        for (const componente of componentes) {
            if (vistos.has(componente.id)) continue;
            vistos.add(componente.id);
            const recurso = porRecurso[componente.recurso];
            if (recurso) recurso.monitorado = true;
            const comparar = operadores[componente.operador];
            if (!comparar || !Number.isFinite(componente.atencao) || !Number.isFinite(componente.critico)) continue;
            if (!temValor(componente, coleta)) {
                incompleto = true;
                continue;
            }
            const valor = coleta.valores[componente.coluna];
            const comparar2 = operadores[componente.operador2];
            const segundaFaixaValida = comparar2 && Number.isFinite(componente.atencao2) && Number.isFinite(componente.critico2);
            const critico = comparar(valor, componente.critico)
                || (segundaFaixaValida && comparar2(valor, componente.critico2));
            const atencao = comparar(valor, componente.atencao)
                || (segundaFaixaValida && comparar2(valor, componente.atencao2));
            const nivel = critico ? "critico" : atencao ? "atencao" : "normal";
            severidade = maior(severidade, nivel);
            if (recurso) {
                recurso.comDados = true;
                recurso.severidade = maior(recurso.severidade, nivel);
            }
            if (nivel !== "normal") alertas.push({ componente: componente.id, nome: componente.nome || componente.coluna, recurso: componente.recurso, nivel });
        }
        // A ausência de um componente nunca comprova a normalidade do servidor.
        if (incompleto && severidade === "normal") severidade = "sem-dados";
        return { severidade, alertas, recursos: porRecurso, incompleto };
    }

    function preverVolume(volume) {
        if (!Number.isFinite(volume.limite)) return null;
        const amostras = [...new Map((volume.historico || []).filter(item => Number.isFinite(item.instante) && Number.isFinite(item.uso))
            .map(item => [item.instante, item])).values()].sort((a, b) => a.instante - b.instante);
        if (amostras.length < 3) return null;
        const primeiro = amostras[0], ultimo = amostras.at(-1);
        const dias = (ultimo.instante - primeiro.instante) / 86400000;
        if (dias < 1) return null;
        const crescimento = (ultimo.uso - primeiro.uso) / dias;
        if (crescimento <= 0 || crescimento < (volume.minimoCrescimento ?? 0)) return null;
        const prazo = (volume.limite - ultimo.uso) / crescimento;
        // Evita transformar 14.000000000000002 em 15 por precisão binária.
        const diasInteiros = Math.abs(prazo - Math.round(prazo)) < 1e-9 ? Math.round(prazo) : Math.ceil(prazo);
        return { dias: Math.max(0, diasInteiros), limite: volume.limite };
    }

    function agregar(entrada, instantes, agora) {
        const unicos = [...new Map(entrada.map(servidor => [servidor.id, servidor])).values()];
        for (const servidor of unicos) if (instantes.length && !indices.has(servidor.coletas)) indices.set(servidor.coletas, new Map(servidor.coletas.map(item => [item.instante, item])));
        const resumo = {
            atencao: 0, criticos: 0, alertas: { atencao: 0, critico: 0 }, previsao: null,
            recursos: Object.fromEntries(recursos.map(recurso => [recurso, { monitorados: 0, comDados: 0, atencao: 0, critico: 0 }])),
            servidores: [], evolucao: []
        };
        for (const servidor of unicos) {
            const ultimaColeta = servidor.ultimaColeta?.instante === agora ? servidor.ultimaColeta : servidor.coletas.filter(coleta => coleta.instante <= agora && servidor.componentes.some(componente => temValor(componente, coleta)))
                .sort((a, b) => b.instante - a.instante)[0] || null;
            const estado = classificar(servidor.componentes, ultimaColeta);
            if (estado.severidade === "critico") resumo.criticos++;
            if (estado.severidade === "atencao") resumo.atencao++;
            for (const alerta of estado.alertas) resumo.alertas[alerta.nivel]++;
            for (const recurso of recursos) {
                const classificacao = estado.recursos[recurso];
                if (classificacao.monitorado) resumo.recursos[recurso].monitorados++;
                if (classificacao.comDados) resumo.recursos[recurso].comDados++;
                if (["atencao", "critico"].includes(classificacao.severidade)) resumo.recursos[recurso][classificacao.severidade]++;
            }
            // Mantém o histórico sob demanda também nos servidores usados pela tabela.
            const item = Object.defineProperties({}, Object.getOwnPropertyDescriptors(servidor));
            Object.assign(item, { estado, situacao: estado.severidade, ultimaColeta,
                desatualizado: !!ultimaColeta && agora - ultimaColeta.instante > 90 * 60000 });
            resumo.servidores.push(item);
            for (const volume of servidor.volumes) {
                const previsao = preverVolume(volume);
                if (previsao && (!resumo.previsao || previsao.dias < resumo.previsao.dias)) resumo.previsao = { ...previsao, servidor, volume: volume.nome };
            }
        }
        resumo.servidores.sort((a, b) => pesos[b.situacao] - pesos[a.situacao] || a.nome.localeCompare(b.nome, "pt-BR") || a.id - b.id);
        resumo.evolucao = instantes.map(instante => {
            let atencao = 0, critico = 0, comDados = 0;
            for (const servidor of unicos) {
                // Só a coleta deste instante: não propagar a última leitura para preencher buracos.
                const coleta = indices.get(servidor.coletas).get(instante);
                const estado = classificar(servidor.componentes, coleta);
                if (estado.severidade !== "sem-dados") comDados++;
                if (estado.severidade === "atencao") atencao++;
                if (estado.severidade === "critico") critico++;
            }
            return { instante, atencao: comDados ? atencao : null, critico: comDados ? critico : null, comDados, semDados: unicos.length - comDados };
        });
        return resumo;
    }

    function indicadoresNoPeriodo(servidores, inicio, fim) {
        const resumo = { atencao: 0, criticos: 0, alertas: { atencao: 0, critico: 0 }, previsao: null };
        for (const servidor of new Map(servidores.map(s => [s.id, s])).values()) {
            let severidade = 'sem-dados';
            const abertos = new Map();
            for (const coleta of servidor.coletas) {
                if (coleta.instante < inicio || coleta.instante > fim) continue;
                const estado = classificar(servidor.componentes, coleta);
                severidade = maior(severidade, estado.severidade);
                const ativos = new Set(estado.alertas.map(a => a.componente));
                for (const id of abertos.keys()) if (!ativos.has(id)) abertos.delete(id);
                for (const alerta of estado.alertas) {
                    const anterior = abertos.get(alerta.componente);
                    if (!anterior) {
                        resumo.alertas[alerta.nivel]++;
                        abertos.set(alerta.componente, alerta.nivel);
                    } else if (pesos[alerta.nivel] > pesos[anterior]) {
                        resumo.alertas[anterior]--;
                        resumo.alertas[alerta.nivel]++;
                        abertos.set(alerta.componente, alerta.nivel);
                    }
                }
            }
            if (severidade === 'atencao') resumo.atencao++;
            if (severidade === 'critico') resumo.criticos++;
            for (const volume of servidor.volumes) {
                const previsao = preverVolume({ ...volume,
                    historico: volume.historico.filter(c => c.instante >= inicio && c.instante <= fim) });
                if (previsao && (!resumo.previsao || previsao.dias < resumo.previsao.dias)) {
                    resumo.previsao = { ...previsao, servidor, volume: volume.nome };
                }
            }
        }
        return resumo;
    }

    function recursosNoPeriodo(servidores, inicio, fim) {
        const resultado=Object.fromEntries(recursos.map(r=>[r,{monitorados:0,comDados:0,atencao:0,critico:0}]));
        for(const servidor of new Map(servidores.map(s=>[s.id,s])).values()) {
            const maiores=Object.fromEntries(recursos.map(r=>[r,'sem-dados']));
            for(const r of recursos) if(servidor.componentes.some(c=>c.recurso===r)) resultado[r].monitorados++;
            for(const coleta of servidor.coletas) if(coleta.instante>=inicio&&coleta.instante<=fim) {
                const estado=classificar(servidor.componentes,coleta);
                for(const r of recursos) maiores[r]=maior(maiores[r],estado.recursos[r].severidade);
            }
            for(const r of recursos) {
                if(maiores[r]!=='sem-dados')resultado[r].comDados++;
                if(['atencao','critico'].includes(maiores[r]))resultado[r][maiores[r]]++;
            }
        }
        return resultado;
    }
    return { classificar, preverVolume, agregar, indicadoresNoPeriodo, recursosNoPeriodo, reduzirPontos, recursos };
})();
