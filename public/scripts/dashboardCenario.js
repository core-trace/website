// Uma única projeção do histórico alimenta KPIs, tabela, detalhes e página de alertas.
const dashboardCenario = (() => {
    let cache;
    const formatar = valor => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    function criar(referencia = monitoramentoMock.referencia()) {
        if (cache?.referencia === referencia) return cache;
        const registros = dashboardAlertasMock.criarBase(referencia);
        const porServidor = new Map();
        const alertas = [];
        const abertos = new Map();
        for (const registro of registros) {
            if (!porServidor.has(registro.servidor)) {
                porServidor.set(registro.servidor, { perfil: registro.perfil, coletas: new Map() });
            }
            const dados = porServidor.get(registro.servidor);
            if (!dados.coletas.has(registro.timestamp)) dados.coletas.set(registro.timestamp, { instante: registro.timestamp, valores: {} });
            const metrica = dashboardAlertasMock.metricas[registro.recurso];
            dados.coletas.get(registro.timestamp).valores[metrica.coluna] = registro.valor;

            // Um episódio por servidor/recurso/severidade; a mudança encerra o anterior.
            const chave = `${registro.servidor}:${registro.recurso}`;
            let evento = abertos.get(chave);
            if (evento && evento.nivel !== registro.severidade) {
                evento.fim = registro.timestamp;
                abertos.delete(chave);
                evento = null;
            }
            if (registro.severidade === 'normal') continue;
            if (!evento) {
                evento = {
                    id: `ALT-${String(alertas.length + 1).padStart(4, '0')}`,
                    servidor: registro.servidor, perfil: registro.perfil, recurso: registro.recurso,
                    coluna: metrica.coluna, nome: metrica.nome, unidade: metrica.unidade,
                    nivel: registro.severidade, limite: metrica[registro.severidade],
                    inicio: registro.timestamp, fim: null, valor: registro.valor, pico: registro.valor
                };
                alertas.push(evento);
                abertos.set(chave, evento);
            }
            evento.valor = registro.valor;
            evento.pico = Math.max(evento.pico, registro.valor);
        }

        const servidores = [...porServidor].map(([nome, dados], indice) => {
            const capacidade = nome.startsWith('pay-db') ? 32 : 16;
            const coletas = [...dados.coletas.values()];
            // Métricas auxiliares são derivadas das mesmas leituras dos gráficos gerais.
            coletas.forEach(coleta => {
                const v = coleta.valores;
                Object.assign(v, {
                    disk_total: 200, disk_used: 2 * v.disk_percent, disk_free: 200 - 2 * v.disk_percent,
                    ram_total: capacidade, ram_used: capacidade * v.ram_percent / 100,
                    ram_available: capacidade * (1 - v.ram_percent / 100),
                    swap_percent: Math.max(0, (v.ram_percent - 70) * 2),
                    net_drops: Number((v.net_errors * 2).toFixed(2)),
                    load_avg_5: v.cpu_percent / 100 * 8, load_avg_15: v.cpu_percent / 100 * 8 * 0.94,
                    cpu_iowait: Number((0.5 + v.disk_percent / 50).toFixed(2)),
                    swap_sin: Math.round(Math.max(0, v.ram_percent - 85) * 2048),
                    swap_sout: Math.round(Math.max(0, v.ram_percent - 85) * 4096)
                });
            });
            const componentes = dashboardAlertasMock.recursos.map((recurso, i) => ({
                id: i + 1, recurso, operador: '>=', ...dashboardAlertasMock.metricas[recurso]
            }));
            const ultimaColeta = coletas.at(-1);
            const valores = ultimaColeta.valores;
            const containers = ['app', 'worker', 'agent'].map((servico, i) => ({
                id_container: `ct-${indice + 1}-${i + 1}`, nome: `${nome}-${servico}`, status: 'ATIVO'
            }));
            const volumes = ['/dados', '/'].map((volume, i) => {
                const uso = i ? 24 + indice : valores.disk_percent;
                const historico = coletas.filter((_, j) => j % 288 === 0).map(coleta => ({
                    instante: coleta.instante, uso: i ? uso : coleta.valores.disk_percent
                }));
                const resultado = { nome: volume, uso, capacidade: i ? 100 : 200, limite: 90, historico,
                    livre: (i ? 100 : 200) * (1 - uso / 100), inodesUsados: 20 + indice, diasInodes: null };
                resultado.diasEspaco = dashboardDados.preverVolume(resultado)?.dias ?? null;
                return resultado;
            });

            if (nome === 'pay-db-02') {
                ultimaColeta.valores.cpu_percent = 92;
                ultimaColeta.valores.ram_percent = 62;
                ultimaColeta.valores.disk_percent = 72;
                valores.cpu_percent = 92; valores.ram_percent = 62; valores.disk_percent = 72;
                volumes[0].uso = 72; volumes[0].livre = 200 * (1 - 72 / 100);
                volumes[0].historico = [...volumes[0].historico.slice(-6), { instante: referencia, uso: 72 }];
                volumes[0].diasEspaco = 15;
            }

            if (nome === 'pay-api-04') {
                ultimaColeta.valores.cpu_percent = 68;
                ultimaColeta.valores.ram_percent = 92;
                ultimaColeta.valores.disk_percent = 70;
                valores.cpu_percent = 68; valores.ram_percent = 92; valores.disk_percent = 70;
                volumes[0].uso = 70; volumes[0].livre = 200 * (1 - 70 / 100);
                volumes[0].historico = [
                    { instante: referencia - 12 * 24 * 60 * 60 * 1000, uso: 50 },
                    { instante: referencia - 6 * 24 * 60 * 60 * 1000, uso: 60 },
                    { instante: referencia, uso: 70 }
                ];
                volumes[0].diasEspaco = 12;
            }

            if (nome === 'cart-api-07') {
                ultimaColeta.valores.cpu_percent = 79;
                ultimaColeta.valores.ram_percent = 61;
                valores.cpu_percent = 79; valores.ram_percent = 61;
            }

            if (nome === 'cart-api-12') {
                ultimaColeta.valores.ram_percent = 81;
                ultimaColeta.valores.cpu_percent = 62;
                valores.ram_percent = 81; valores.cpu_percent = 62;
            }

            if (nome === 'cart-api-02') {
                ultimaColeta.valores.ram_percent = 78;
                ultimaColeta.valores.cpu_percent = 64;
                valores.ram_percent = 78; valores.cpu_percent = 64;
            }

            if (nome === 'cart-api-09') {
                ultimaColeta.valores.cpu_percent = 80;
                ultimaColeta.valores.ram_percent = 63;
                valores.cpu_percent = 80; valores.ram_percent = 63;
            }

            if (nome === 'pay-api-06') {
                ultimaColeta.valores.cpu_percent = 83;
                ultimaColeta.valores.ram_percent = 64;
                valores.cpu_percent = 83; valores.ram_percent = 64;
            }

            if (nome === 'catalog-api-03') {
                ultimaColeta.valores.disk_percent = 82;
                ultimaColeta.valores.ram_percent = 66;
                valores.disk_percent = 82; valores.ram_percent = 66;
            }

            if (nome === 'catalog-api-05') {
                ultimaColeta.valores.ram_percent = 70;
                ultimaColeta.valores.disk_percent = 72;
                valores.ram_percent = 70; valores.disk_percent = 72;
            }

            return {
                id: indice + 1, nome, perfilId: dados.perfil,
                perfil: dashboardAlertasMock.perfis.find(perfil => perfil.id === dados.perfil).nome,
                referencia, sistemaOperacional: 'linux', nucleos: 8, capacidade, fase: indice,
                incidente: nome.startsWith('pay-db') ? 'ram' : 'cpu', uptime: '9d 4h',
                coletas, ultimaColeta, componentes, volumes,
                incidentes: alertas.filter(alerta => alerta.servidor === nome),
                monitorarDocker: true, dadosContainersDisponiveis: true, containers,
                cpu: `${formatar(valores.cpu_percent)}%`, ram: `${formatar(valores.ram_percent)}%`, disco: `${formatar(valores.disk_percent)}%`,
                docker: `${containers.length} monitorados`, situacao: dashboardDados.classificar(componentes, ultimaColeta).severidade
            };
        });
        cache = { referencia, registros, servidores, alertas };
        return cache;
    }

    function configurarFiltros(perfil, periodo) {
        dashboardAlertasMock.perfis.forEach(item => perfil.add(new Option(item.nome, item.id)));
        const salvo = sessionStorage.getItem('CORETRACE_PERFIL');
        perfil.value = dashboardAlertasMock.perfis.some(item => item.id === salvo) ? salvo : '';
        const minutos = sessionStorage.getItem('CORETRACE_PERIODO');
        periodo.value = ['60', '360', '720', '1440', '10080'].includes(minutos) ? minutos : '1440';
        perfil.addEventListener('change', () => sessionStorage.setItem('CORETRACE_PERFIL', perfil.value));
        periodo.addEventListener('change', () => sessionStorage.setItem('CORETRACE_PERIODO', periodo.value));
    }

    return { criar, configurarFiltros };
})();
