// Adaptador da telemetria de referência para os contratos existentes da interface.
// A demonstração usa exclusivamente os servidores e limites propostos no README.
const dashboardSimulacao = (() => {
    const base = CoreTraceCenario7d, detalhes = CoreTraceDetalhes7d;
    const referencia = Date.parse(base.DATA_FINAL);
    const historicos = new Map(), tecnicas = new WeakMap();
    const normalizarMac = valor => {
        const mac = String(valor || '').trim();
        return /^(?:[a-f0-9]{12}|[a-f0-9]{2}([:-])(?:[a-f0-9]{2}\1){4}[a-f0-9]{2})$/i.test(mac)
            ? mac.replace(/[:-]/g, '').toUpperCase() : '';
    };
    const receitas = new Map(base.servidores.map(s => [normalizarMac(s.mac), s]));
    const formatar = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const pesos = { normal: 0, atencao: 1, critico: 2 };

    function componentesCenario(perfil) {
        const campos = {
            cpu: ['cpu_percent', 'Uso total (%)', 'CPU', '%'],
            ram: ['ram_percent', 'Uso de memória (%)', 'RAM', '%'],
            disco: ['disk_percent', 'Ocupação por volume (%)', 'Disco', '%'],
            errosRede: ['net_errors', 'Erros de recebimento e envio', 'Rede', 'eventos/s'],
            descartesRede: ['net_drops', 'Descartes de entrada e saída', 'Rede', 'pacotes/s']
        };
        return Object.entries(base.limitesReferencia[perfil] || {}).map(([id, [atencao, critico]]) => {
            const [coluna, nome, recurso, unidade] = campos[id];
            return { id, coluna, nome, recurso, unidade, atencao, critico, operador: '>' };
        });
    }

    function cadastrosDemo() {
        return base.servidores.map(s => ({
            id_servidor: s.mac, nome: s.nome, endereco_mac: s.mac, status: s.statusCadastral,
            id_perfil_servidor: s.perfil, nome_perfil: s.perfil,
            sistema_operacional: 'linux', monitorar_docker: s.monitorarDocker
        }));
    }

    function historico(mac) {
        if (!historicos.has(mac)) {
            const dados = base.historicoServidor(mac, '7d');
            let carga5 = 0, carga15 = 0;
            const coletas = dados.map((v, i) => {
                const swapTotal = v.ram_total >= 32 ? 8 : 4;
                const swapUsada = Number((swapTotal * v.swap_percent / 100).toFixed(4));
                const rede = detalhes.rede(mac, v);
                carga5 += v.load_avg_1 - (dados[i - 5]?.load_avg_1 || 0);
                carga15 += v.load_avg_1 - (dados[i - 15]?.load_avg_1 || 0);
                return { instante: Date.parse(v.timestamp), valores: Object.assign(v, {
                    load_avg_5: Number((carga5 / Math.min(5, i + 1)).toFixed(3)),
                    load_avg_15: Number((carga15 / Math.min(15, i + 1)).toFixed(3)),
                    swap_total: swapTotal, swap_used: swapUsada,
                    swap_free: Number((swapTotal - swapUsada).toFixed(4)), ram_oom_kills: 0,
                    net_traffic: Math.round((rede.recebimentoMBs + rede.envioMBs) * 1000000), net_isup: 1,
                    swap_sin: Math.round(Math.max(0, v.ram_percent - 75) * 8000),
                    swap_sout: Math.round(Math.max(0, v.ram_percent - 80) * 4500)
                }) };
            });
            historicos.set(mac, coletas);
        }
        return historicos.get(mac);
    }

    function amostra(servidor, coleta) {
        if (!tecnicas.has(coleta)) tecnicas.set(coleta, detalhes.telemetria(servidor.mac, coleta.instante));
        return tecnicas.get(coleta);
    }
    function nucleos(servidor, coleta) {
        return detalhes.cpuPorNucleo(servidor.mac, coleta.instante, coleta.valores.cpu_percent).map(item => item.percentual);
    }
    function tecnica(servidor, coleta) {
        const t = amostra(servidor, coleta), io = t.discoIO, rede = t.rede;
        return { nucleos: nucleos(servidor, coleta), discos: [{
            nome: io.dispositivo, leitura: io.leituraMBs, escrita: io.escritaMBs,
            latenciaLeitura: io.tempoLeituraMs, latenciaEscrita: io.tempoEscritaMs,
            fila: io.filaMediaOperacoes, iopsLeitura: io.leituraIOPS, iopsEscrita: io.escritaIOPS
        }], redes: [{ nome: rede.interface, ativa: true,
            recebimento: rede.recebimentoMBs, envio: rede.envioMBs,
            errosEntrada: rede.errosRecebimentoPorSegundo, errosSaida: rede.errosEnvioPorSegundo,
            descartesEntrada: rede.descartesRecebimentoPorSegundo, descartesSaida: rede.descartesEnvioPorSegundo
        }] };
    }
    function processos(servidor, coleta) {
        return detalhes.processos(servidor.mac, amostra(servidor, coleta)).map(p => ({
            pid: p.pid, nome: p.nome, estado: p.estado, cpu: p.cpuPercent, memoria: p.ramGb
        }));
    }
    function containers(servidor, coleta) {
        if (!servidor.monitorarDocker || !servidor.mac) return [];
        return detalhes.docker(servidor.mac, amostra(servidor, coleta)).containers.map(c => ({
            id: c.id, nome: c.nome, estado: c.estado, cpu: c.cpuPercent, memoria: c.ramGb,
            leitura: c.leituraBytesSegundo, escrita: c.escritaBytesSegundo
        }));
    }

    function criar(cadastros = cadastrosDemo()) {
        if (!Array.isArray(cadastros)) throw new TypeError('Cadastro de servidores inválido.');
        const registros = [], alertas = [];
        const servidores = [...new Map(cadastros.map(item => [item.id_servidor, item])).values()].map(item => {
            const receita = receitas.get(normalizarMac(item.endereco_mac));
            const componentes = componentesCenario(receita?.perfil);
            const servidor = { id: item.id_servidor, nome: item.nome, endereco_mac: item.endereco_mac,
                statusCadastral: item.status, perfilId: String(item.id_perfil_servidor), perfil: item.nome_perfil,
                sistemaOperacional: item.sistema_operacional, monitorarDocker: Number(item.monitorar_docker) === 1,
                referencia, componentes, coletas: [], incidentes: [], volumes: [], containers: [],
                ultimaColeta: null, situacao: 'sem-dados', cpu: '—', ram: '—', disco: '—', uptime: '—',
                docker: Number(item.monitorar_docker) === 1 ? 'Aguardando dados' : 'Não monitorado' };
            if (!receita) return servidor;
            Object.assign(servidor, { mac: receita.mac, nucleos: receita.nucleos, capacidade: receita.ramGb, coletas: historico(receita.mac) });
            const abertos = new Map();
            for (const coleta of servidor.coletas) {
                const estado = dashboardDados.classificar(componentes, coleta);
                for (const [recurso, dado] of Object.entries(estado.recursos)) {
                    if (dado.comDados) registros.push({ servidor: servidor.id, perfil: servidor.perfilId, recurso, severidade: dado.severidade, timestamp: coleta.instante });
                }
                const ativos = new Map(estado.alertas.map(a => [a.componente, a]));
                for (const [id, incidente] of abertos) if (!ativos.has(id)) {
                    incidente.fim = coleta.instante;
                    incidente.transicoes.push({ instante: coleta.instante, nivel: 'normal' });
                    incidente.severidadeAtual = 'normal';
                    abertos.delete(id);
                }
                for (const [id, alerta] of ativos) {
                    const componente = componentes.find(c => c.id === id);
                    const valor = coleta.valores[componente.coluna];
                    let incidente = abertos.get(id);
                    if (!incidente) {
                        incidente = { componente: id, coluna: componente.coluna, nome: componente.nome, recurso: componente.recurso,
                            unidade: componente.unidade || '', operador: componente.operador,
                            limites: { atencao: componente.atencao, critico: componente.critico },
                            inicio: coleta.instante, fim: null, nivel: alerta.nivel, severidadeMaxima: alerta.nivel, severidadeAtual: alerta.nivel,
                            valorPico: valor, instantePico: coleta.instante, transicoes: [] };
                        servidor.incidentes.push(incidente);
                        abertos.set(id, incidente);
                    }
                    if (incidente.transicoes.at(-1)?.nivel !== alerta.nivel) incidente.transicoes.push({ instante: coleta.instante, nivel: alerta.nivel });
                    if (pesos[alerta.nivel] > pesos[incidente.nivel]) incidente.nivel = alerta.nivel;
                    incidente.severidadeMaxima = incidente.nivel;
                    if (componente.operador.startsWith('<') ? valor < incidente.valorPico : valor > incidente.valorPico) {
                        incidente.valorPico = valor; incidente.instantePico = coleta.instante;
                    }
                    incidente.severidadeAtual = alerta.nivel;
                }
            }
            servidor.ultimaColeta = servidor.coletas.at(-1);
            const valores = servidor.ultimaColeta.valores;
            servidor.situacao = dashboardDados.classificar(componentes, servidor.ultimaColeta).severidade;
            servidor.cpu = `${formatar(valores.cpu_percent)}%`;
            servidor.ram = `${formatar(valores.ram_percent)}%`;
            servidor.disco = `${formatar(valores.disk_percent)}%`;
            servidor.uptime = `${Math.floor(valores.uptimeSegundos / 86400)}d ${Math.floor(valores.uptimeSegundos / 3600) % 24}h`;
            const limite = componentes.find(c => c.coluna === 'disk_percent' && ['>', '>='].includes(c.operador))?.critico ?? null;
            servidor.volumes = amostra(servidor, servidor.ultimaColeta).volumes.map(v => {
                const volume = { nome: v.volume, uso: v.ocupacaoPercent, capacidade: v.totalGb, usado: v.usadoGb, livre: v.disponivelGb,
                    limite: v.volume === '/dados' ? limite : null, minimoCrescimento: 0.25,
                    historico: v.volume === '/dados' ? servidor.coletas.filter((_, i) => i % 60 === 0).map(c => ({ instante: c.instante, uso: c.valores.disk_percent })) : [],
                    inodesUsados: v.inodesUtilizadosPercent, diasInodes: null };
                volume.diasEspaco = dashboardDados.preverVolume(volume)?.dias ?? null;
                return volume;
            });
            servidor.containers = containers(servidor, servidor.ultimaColeta);
            servidor.dadosContainersDisponiveis = servidor.containers.length > 0;
            if (servidor.monitorarDocker && servidor.containers.length) servidor.docker = `${servidor.containers.length} monitorados`;
            for (const incidente of servidor.incidentes) alertas.push({ ...incidente, serverId: servidor.id, servidor: servidor.nome, perfilId: servidor.perfilId, perfil: servidor.perfil });
            return servidor;
        });
        return { referencia, servidores, registros, alertas };
    }
    return { criar, cadastrosDemo, nucleos, tecnica, processos, containers };
})();
