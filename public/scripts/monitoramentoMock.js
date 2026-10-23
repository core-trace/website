const monitoramentoMock = (() => {
    const periodos = [30, 60, 360, 720, 1440, 10080];
    const rotulosPeriodo = { 30: 'Últimos 30 minutos', 60: 'Última hora', 360: 'Últimas 6 horas', 720: 'Últimas 12 horas', 1440: 'Últimas 24 horas', 10080: 'Últimos 7 dias' };
    const formato = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' };
    const horario = instante => new Date(instante).toLocaleTimeString('pt-BR', formato);
    const dataHora = instante => new Date(instante).toLocaleString('pt-BR', { ...formato, day: '2-digit', month: '2-digit' });
    function referencia() {
        return Date.parse(CoreTraceCenario7d.DATA_FINAL);
    }

    function validarPeriodo(minutos) {
        if (!periodos.includes(minutos)) throw new RangeError('Período inválido para a demonstração.');
    }

    function recortar(servidor, minutos) {
        validarPeriodo(minutos);
        const inicio = servidor.referencia - minutos * 60000;
        return servidor.coletas.filter(coleta => coleta.instante >= inicio && coleta.instante <= servidor.referencia);
    }

    function historico(servidor, minutos = 30) {
        const completas = recortar(servidor, minutos);
        const amostras = dashboardDados.reduzirPontos(completas, ['cpu_percent', 'ram_percent', 'swap_percent', 'disk_percent', 'net_errors', 'net_drops', 'load_avg_5', 'load_avg_15']);
        const tecnicas = amostras.map(coleta => dashboardSimulacao.tecnica(servidor, coleta));
        const serie = coluna => amostras.map(coleta => coleta.valores[coluna]);
        const dispositivos = tipo => tecnicas[0][tipo].map((dispositivo, indice) => {
            const resultado = { ...tecnicas.at(-1)[tipo][indice] };
            for (const campo of Object.keys(dispositivo)) {
                if (typeof dispositivo[campo] === 'number' && !campo.startsWith('iops')) resultado[campo] = tecnicas.map(item => item[tipo][indice][campo]);
            }
            return resultado;
        });
        const mediasNucleos = Array(servidor.nucleos).fill(0);
        for (const coleta of completas) {
            const nucleos = dashboardSimulacao.nucleos(servidor, coleta);
            nucleos.forEach((valor, indice) => { mediasNucleos[indice] += valor / completas.length; });
        }
        return {
            instantes: amostras.map(item => item.instante),
            rotulos: amostras.map(item => minutos >= 1440 ? dataHora(item.instante) : horario(item.instante)),
            cpu: serie('cpu_percent'), ram: serie('ram_percent'), swap: serie('swap_percent'),
            ocupacao: serie('disk_percent'), espacoLivre: serie('disk_free'), carga5: serie('load_avg_5'), carga15: serie('load_avg_15'),
            nucleos: Array.from({ length: servidor.nucleos }, (_, indice) => tecnicas.map(item => item.nucleos[indice])),
            mediasNucleos, discos: dispositivos('discos'), redes: dispositivos('redes'), oom: [],
            incidentes: incidentes(servidor, minutos), amostrasOriginais: completas.length
        };
    }

    function incidentes(servidor, minutos) {
        validarPeriodo(minutos);
        const inicio = servidor.referencia - minutos * 60000;
        return servidor.incidentes.filter(item => item.inicio <= servidor.referencia && (item.fim === null || item.fim > inicio));
    }

    function cenario(servidor) {
        const coleta = servidor.coletas.at(-1);
        if (!coleta) return null;
        const tecnica = dashboardSimulacao.tecnica(servidor, coleta);
        const estado = dashboardDados.classificar(servidor.componentes, coleta);
        const processos = dashboardSimulacao.processos(servidor, coleta);
        return {
            capacidade: coleta.valores.ram_total, usada: coleta.valores.ram_used, disponivel: coleta.valores.ram_available,
            carga5: coleta.valores.load_avg_5, carga15: coleta.valores.load_avg_15,
            swap: coleta.valores.swap_percent, swapTotal: coleta.valores.swap_total,
            swapUsada: coleta.valores.swap_used, swapLivre: coleta.valores.swap_free,
            swapEntrada: coleta.valores.swap_sin, swapSaida: coleta.valores.swap_sout,
            iowait: coleta.valores.cpu_iowait, oom: [], volumes: servidor.volumes, processos,
            containers: dashboardSimulacao.containers(servidor, coleta, processos),
            discos: tecnica.discos, redes: tecnica.redes, alertas: estado.alertas,
            alerta: estado.alertas.length ? `${estado.alertas.length} ${estado.alertas.length === 1 ? 'alerta ativo' : 'alertas ativos'} · ${estado.alertas.map(item => `${item.recurso} ${item.nivel === 'critico' ? 'crítico' : 'atenção'}`).join(', ')}` : 'Sem alertas ativos na última coleta',
            regra: ''
        };
    }
    return { periodos, rotulosPeriodo, referencia, horario, dataHora, validarPeriodo, recortar, historico, incidentes, cenario };
})();
