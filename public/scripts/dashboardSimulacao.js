const dashboardSimulacao = (() => {
    const minuto = 60000, dia = 86400000;
    const arredondar = valor => Number(valor.toFixed(4));
    const limitar = (valor, min = 0, max = 100) => Math.max(min, Math.min(max, valor));
    const rampa = (t, a, b) => limitar((t - a) / (b - a), 0, 1);
    const onda = (m, fase) => (Math.sin(m / 11 + fase) * 1.1 + Math.sin(m / 3.7 + fase) * 0.35);
    const cache = new Map();

    // Janela com subida gradual, platô e recuperação. Tempos relativos à referência.
    const janela = (t, inicio, subida, estavel, fim) => rampa(t,inicio,subida)*(1-rampa(t,estavel,fim));
    function coleta(servidor, instante) {
        const t = (instante - servidor.referencia) / minuto; // Zero é o fim da história (14:30).
        const horarioDia = ((t + 870) % 1440 + 1440) % 1440;
        const picoDiario = Math.exp(-(((horarioDia - 780) / 65) ** 2));
        const crescimento = rampa(t, -210, -30);
        const recuperacao = rampa(t, -185, -115) * (1 - rampa(t, -70, -35));
        let cpuBase = servidor.cpuFinal;
        let ramBase = servidor.ramFinal;
        if (['cpu', 'cpu-atencao'].includes(servidor.incidente)) cpuBase = 39 + (servidor.cpuFinal - 39) * crescimento;
        else if (servidor.incidente === 'recuperacao') cpuBase = 44 + 52 * recuperacao;
        if (['ram', 'ram-atencao'].includes(servidor.incidente)) ramBase = 54 + (servidor.ramFinal - 54) * rampa(t, -240, -25);
        const fim = Math.min(1, Math.abs(t) / 12);
        let cpuHistorica=0, ramHistorica=0, discoHistorico=0, redeHistorica=0;
        // Almoços dos seis dias anteriores, com intensidades e durações distintas.
        if (['cpu','cpu-atencao','recuperacao'].includes(servidor.incidente)) for(let d=1;d<=6;d++) {
            const x=t+d*1440;
            const amplitude=servidor.incidente==='cpu'? [0,55,44,57,48,54,43][d] : servidor.incidente==='cpu-atencao'?38:49;
            cpuHistorica=Math.max(cpuHistorica,amplitude*janela(x,-230,-130,-75,10));
        }
        if (['ram','ram-atencao'].includes(servidor.incidente)) {
            ramHistorica= Math.max(39*janela(t,-5*1440-480,-5*1440-60,-5*1440+90,-5*1440+210),32*janela(t,-2*1440-600,-2*1440-120,-2*1440+30,-2*1440+210));
        }
        if(servidor.incidente==='disco-financeiro') discoHistorico=48*janela(t,-4*1440-720,-4*1440,-4*1440+180,-4*1440+360);
        if(servidor.incidente==='disco-catalogo') discoHistorico=53*janela(t,-1440-480,-1440+30,-1440+180,-1440+300);
        if(servidor.incidente==='rede') redeHistorica=Math.max(janela(t,-3*1440-90,-3*1440-60,-3*1440+120,-3*1440+160),janela(t,-780,-740,-660,-610));
        const diario = t < -240 ? picoDiario * 3 : 0;
        const cpu = arredondar(limitar(cpuBase + (onda(t, servidor.fase) + diario + cpuHistorica) * fim));
        const ram = arredondar(limitar(ramBase + (onda(t, servidor.fase + 2) * 0.4 + diario * 0.25 + ramHistorica) * fim));
        const disco = arredondar(limitar(servidor.discoFinal + t / 1440 * servidor.crescimentoDisco + discoHistorico));
        const swap = servidor.incidente === 'ram' ? Math.max(8 + 50 * rampa(t, -100, -10), Math.max(0,ram-75)*2.5) : 4 + servidor.fase * 0.15;
        const carga = cpu / 100 * servidor.nucleos * (cpu > 90 ? 1.2 : 0.95);
        return { instante, valores: {
            cpu_percent: cpu, ram_percent: ram, disk_percent: disco, swap_percent: arredondar(swap), net_errors: arredondar(redeHistorica*(24+onda(t,2))), net_drops: arredondar(redeHistorica*(48+onda(t,3)*2)),
            disk_total:200, disk_used:200*disco/100, disk_free:200*(1-disco/100),
            ram_total: servidor.capacidade, ram_used: servidor.capacidade * ram / 100,
            ram_available: servidor.capacidade * (1 - ram / 100),
            load_avg_5: arredondar(carga), load_avg_15: arredondar(carga * (t < -30 ? 0.85 : 0.94)),
            cpu_iowait: arredondar(servidor.incidente === 'ram' ? 1.5 + swap / 25 : 0.5 + cpu / 100),
            swap_sin: servidor.incidente === 'ram' ? Math.round(Math.max(0, swap - 45) * 2048) : 0,
            swap_sout: servidor.incidente === 'ram' ? Math.round(Math.max(0, swap - 40) * 4096) : 0
        } };
    }

    function nucleos(servidor, coleta) {
        const cpu = coleta.valores.cpu_percent;
        const amplitude = Math.min(3, cpu, 100 - cpu);
        const fase = (coleta.instante - servidor.referencia) / minuto / 13;
        // Oito fases igualmente espaçadas: os desvios somam zero, preservando a média do host.
        return Array.from({ length: servidor.nucleos }, (_, indice) => arredondar(cpu + amplitude * Math.sin(fase + indice * 2 * Math.PI / servidor.nucleos)));
    }

    function tecnica(servidor, coleta) {
        const v = coleta.valores;
        const pressao = v.cpu_percent / 100 + (servidor.incidente === 'ram' ? v.ram_percent / 100 : 0) + Math.max(0,v.disk_percent-75)/15;
        const leitura = 3 + pressao * 12, escrita = 1 + pressao * 6;
        const discos = [1, 0.22].map((fator, indice) => ({
            nome: indice ? 'sda' : 'nvme0n1', leitura: arredondar(leitura * fator), escrita: arredondar(escrita * fator),
            latenciaLeitura: arredondar((0.7 + pressao * 1.5) * fator), latenciaEscrita: arredondar((1.3 + pressao * 2.5) * fator),
            fila: arredondar((0.1 + pressao * 0.9) * fator),
            iopsLeitura: Math.round(leitura * fator * 16), iopsEscrita: Math.round(escrita * fator * 16)
        }));
        const interfaces = servidor.monitorarDocker ? [1, 0.2] : [1];
        const redes = interfaces.map((fator, indice) => ({
            nome: indice ? 'docker0' : 'eth0', ativa: true,
            recebimento: arredondar((0.3 + pressao * 2.2 + v.net_errors*0.07) * fator), envio: arredondar((0.1 + pressao * 0.7) * fator),
            errosEntrada: indice ? 0 : v.net_errors*0.8, errosSaida: indice ? 0 : v.net_errors*0.2, descartesEntrada: indice ? 0 : v.net_drops*0.75, descartesSaida: indice ? 0 : v.net_drops*0.25
        }));
        return { nucleos: nucleos(servidor, coleta), discos, redes };
    }

    function processos(servidor, coleta) {
        const cpu = coleta.valores.cpu_percent * servidor.nucleos;
        const usada = coleta.valores.ram_used;
        const servico = servidor.nome.startsWith('pay-db') ? 'postgres' : 'node';
        return [
            { pid: 1800 + servidor.fase, nome: `${servico} · ${servidor.nome}`, estado: 'Executando', cpu: arredondar(cpu * 0.68), memoria: arredondar(usada * 0.65) },
            { pid: 2200 + servidor.fase, nome: `${servidor.nome.split('-api')[0]}-worker`, estado: 'Executando', cpu: arredondar(cpu * 0.18), memoria: arredondar(usada * 0.15) },
            { pid: 900 + servidor.fase, nome: 'coretrace-agent', estado: 'Em espera', cpu: arredondar(cpu * 0.01), memoria: arredondar(usada * 0.01) }
        ];
    }

    function containers(servidor, coleta) {
        if (!servidor.monitorarDocker) return [];
        const cadastrados=servidor.containers || [];
        const ativos=cadastrados.filter(c=>String(c.status).toUpperCase()==='ATIVO').length;
        const disco=tecnica(servidor,coleta).discos[0];
        return cadastrados.map(c=>({id:c.id_container,nome:c.nome,
            estado:String(c.status).toUpperCase()==='ATIVO'?'Executando':'Parado',
            cpu:coleta.valores.cpu_percent*servidor.nucleos*0.8/Math.max(1,ativos),
            memoria:coleta.valores.ram_used*0.8/Math.max(1,ativos),
            leitura:Math.round(disco.leitura*1e6*0.8/Math.max(1,ativos)),escrita:Math.round(disco.escrita*1e6*0.8/Math.max(1,ativos))}));
    }

    function detectarIncidentes(servidor) {
        const eventos = [], abertos = new Map();
        for (const coleta of servidor.coletas) {
            const estado = dashboardDados.classificar(servidor.componentes, coleta);
            const ativos = new Map(estado.alertas.map(alerta => [alerta.componente, alerta]));
            for (const [id, evento] of abertos) {
                if (!ativos.has(id) || ativos.get(id).nivel !== evento.nivel) {
                    evento.fim = coleta.instante;
                    abertos.delete(id);
                }
            }
            for (const [id, alerta] of ativos) if (!abertos.has(id)) {
                const componente = servidor.componentes.find(item => item.id === id);
                const evento = { coluna: componente.coluna, nome: componente.nome, nivel: alerta.nivel, inicio: coleta.instante, fim: null };
                eventos.push(evento);
                abertos.set(id, evento);
            }
        }
        return eventos;
    }

    function criar(cadastros, valorReferencia) {
        if (!Array.isArray(cadastros)) throw new TypeError("Cadastro de servidores obrigatório.");
        const referencia = monitoramentoMock.referencia(valorReferencia);
        // A chave inclui limites: editar um perfil invalida a demonstração em cache.
        const chave = `${referencia}:${JSON.stringify(cadastros)}`;
        if (cache.has(chave)) return cache.get(chave);
        const inicio = referencia - 7 * dia;
        const servidores = cadastros.map(item => {
            const config=monitoramentoMock.configurar(item);
            const numero = v => v === null || v === undefined || v === '' ? null : Number(v);
            const servidor = { ...config, id:Number(item.id_servidor), nome:item.nome, perfilId:String(item.id_perfil_servidor),
                perfil:item.nome_perfil, sistemaOperacional:item.sistema_operacional, referencia,
                monitorarDocker:item.monitorar_docker===true || Number(item.monitorar_docker)===1,
                containers:Array.isArray(item.containers)?item.containers:[], dadosContainersDisponiveis:Array.isArray(item.containers),
                componentes:(item.componentes||[]).map(c=>({...c, atencao:numero(c.atencao),critico:numero(c.critico)})) };
            if(!config) return {...servidor,coletas:[],incidentes:[],volumes:[],ultimaColeta:null,situacao:'sem-dados',cpu:'—',ram:'—',disco:'—',uptime:'—',docker:'Sem métricas',motivoSemDados:'Não há cenário de métricas associado ao MAC deste servidor.'};
            servidor.coletas = Array.from({ length: 10081 }, (_, indice) => coleta(servidor, inicio + indice * minuto));
            servidor.ultimaColeta = servidor.coletas.at(-1);
            servidor.incidentes = detectarIncidentes(servidor);
            const valores = servidor.ultimaColeta.valores;
            const limite = servidor.componentes.find(componente => componente.coluna === 'disk_percent' && ['>', '>='].includes(componente.operador))?.critico;
            servidor.volumes = ['/dados', '/'].map((nome, indice) => {
                const uso = indice ? 30 + servidor.fase/10 : valores.disk_percent;
                const historico = Array.from({ length: 8 }, (_, d) => ({ instante: inicio + d * dia, uso: indice ? uso : servidor.coletas[d * 1440].valores.disk_percent }));
                const volume = { nome, uso, capacidade: indice ? 100 : 200, limite: limite ?? null, historico, inodesUsados: indice ? 12 : 40 + servidor.fase/10, diasInodes: null };
                volume.livre = volume.capacidade * (1 - uso / 100);
                volume.diasEspaco = dashboardDados.preverVolume(volume)?.dias ?? null;
                return volume;
            });
            servidor.cpu = `${valores.cpu_percent}%`;
            servidor.ram = `${valores.ram_percent}%`;
            servidor.disco = `${valores.disk_percent}%`;
            servidor.docker = servidor.monitorarDocker ? (!servidor.dadosContainersDisponiveis ? 'Aguardando coleta' : servidor.containers.length ? `${containers(servidor, servidor.ultimaColeta).filter(item => item.estado === 'Executando').length} em execução` : 'Sem containers') : 'Não monitorado';
            servidor.situacao = dashboardDados.classificar(servidor.componentes, servidor.ultimaColeta).severidade;
            return servidor;
        });
        const resultado = { referencia, inicio, servidores };
        cache.clear();
        cache.set(chave, resultado);
        return resultado;
    }
    return { criar, coleta, nucleos, tecnica, processos, containers };
})();
