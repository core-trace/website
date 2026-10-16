// Altere esta referência ou use ?dataDemo=AAAA-MM-DD. Horários da apresentação: Brasília.
const DATA_REFERENCIA_DEMO = '2026-10-15T14:30:00-03:00';
const monitoramentoMock = (() => {
    const periodos = [15, 30, 60, 360, 1440, 10080];
    const rotulosPeriodo = { 15: 'Últimos 15 minutos', 30: 'Últimos 30 minutos', 60: 'Última hora', 360: 'Últimas 6 horas', 1440: 'Últimas 24 horas', 10080: 'Últimos 7 dias' };
    const formato = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' };
    const horario = instante => new Date(instante).toLocaleTimeString('pt-BR', formato);
    const dataHora = instante => new Date(instante).toLocaleString('pt-BR', { ...formato, day: '2-digit', month: '2-digit' });
    // Receitas de métricas por MAC cadastrado, sem criar servidores, perfis ou limites.
    const cenarios = {
        'aabbccddee07': [97,62,63,16,'cpu'],
        'aabbccddee12': [82,58,57,16,'cpu-atencao'],
        'aabbccddee02': [44,54,52,16,'recuperacao'],
        'aabbccddee09': [39,48,47,16,'normal'],
        'aabbccddef02': [51,94,78,32,'ram'],
        'aabbccddef04': [38,83,56,16,'ram-atencao'],
        'aabbccddef06': [35,57,49,16,'disco-financeiro'],
        'aabbccddf003': [47,55,61,16,'rede'],
        'aabbccddf005': [36,54,44,16,'disco-catalogo'],
        'aabbccddf008': [32,49,41,16,'normal']
    };
    function configurar(registro) {
        const mac = String(registro.endereco_mac || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
        const receita = cenarios[mac];
        if (!receita) return null;
        const [cpuFinal, ramFinal, discoFinal, capacidade, incidente] = receita;
        const fase = parseInt(mac.slice(-4),16) % 19;
        return { cpuFinal, ramFinal, discoFinal, capacidade, incidente, fase, nucleos:8,
            uptime: '9d 4h', crescimentoDisco: incidente === 'ram' ? 17/14 : incidente.startsWith('disco') || incidente === 'cpu' ? 0 : 0.35 };
    }

    function referencia(valor) {
        let configurada = valor ?? DATA_REFERENCIA_DEMO;
        if (valor === undefined && typeof location !== 'undefined') {
            const data = new URLSearchParams(location.search).get('dataDemo');
            if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) configurada = `${data}T14:30:00-03:00`;
        }
        const instante = typeof configurada === 'number' ? configurada : Date.parse(configurada);
        if (!Number.isFinite(instante)) throw new RangeError('Data de referência inválida.');
        return Math.floor(instante / 60000) * 60000;
    }

    function validarPeriodo(minutos) {
        if (!periodos.includes(minutos)) throw new RangeError('Período inválido para a demonstração.');
    }

    function recortar(servidor, minutos) {
        validarPeriodo(minutos);
        return servidor.coletas.slice(-minutos - 1);
    }

    function historico(servidor, minutos = 30) {
        const completas = recortar(servidor, minutos);
        const amostras = dashboardDados.reduzirPontos(completas, ['cpu_percent', 'ram_percent', 'swap_percent', 'disk_percent', 'net_errors', 'net_drops']);
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
        return servidor.incidentes.filter(item => item.inicio <= servidor.referencia && (item.fim === null || item.fim >= inicio));
    }

    function cenario(servidor) {
        const coleta = servidor.coletas.at(-1);
        if (!coleta) return null;
        const tecnica = dashboardSimulacao.tecnica(servidor, coleta);
        const estado = dashboardDados.classificar(servidor.componentes, coleta);
        const usada = servidor.capacidade * coleta.valores.ram_percent / 100;
        const processos = dashboardSimulacao.processos(servidor, coleta);
        return {
            capacidade: servidor.capacidade, usada, disponivel: servidor.capacidade - usada,
            carga5: coleta.valores.load_avg_5 / servidor.nucleos, carga15: coleta.valores.load_avg_15 / servidor.nucleos,
            swap: coleta.valores.swap_percent, swapEntrada: coleta.valores.swap_sin, swapSaida: coleta.valores.swap_sout,
            iowait: coleta.valores.cpu_iowait, oom: [], volumes: servidor.volumes, processos,
            containers: dashboardSimulacao.containers(servidor, coleta, processos),
            discos: tecnica.discos, redes: tecnica.redes, alertas: estado.alertas,
            alerta: estado.alertas.length ? `${estado.alertas.length} ${estado.alertas.length === 1 ? 'alerta ativo' : 'alertas ativos'} · ${[...new Set(estado.alertas.map(item => item.recurso))].join(', ')}` : 'Sem alertas ativos na última coleta',
            regra: 'Estado atual da demonstração · limites configurados no perfil'
        };
    }
    return { configurar, periodos, rotulosPeriodo, referencia, horario, dataHora, validarPeriodo, recortar, historico, incidentes, cenario };
})();
