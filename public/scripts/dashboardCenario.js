// Demonstração local: cadastro, métricas e limites vêm do cenário do README.
const dashboardCenario = (() => {
    let cenario;
    function carregar() {
        if (cenario) return cenario;
        cenario = CoreTraceResumo;
        for (const servidor of cenario.servidores) {
            let coletas;
            Object.defineProperty(servidor, 'coletas', { get() {
                // Só calcula o histórico quando o detalhamento realmente o utiliza.
                if (!coletas) coletas = dashboardSimulacao.criar(
                    dashboardSimulacao.cadastrosDemo().filter(s => s.id_servidor === servidor.id)
                ).servidores[0].coletas;
                return coletas;
            } });
        }
        return cenario;
    }

    function configurarFiltros(perfil, periodo, servidores) {
        const perfis = new Map(servidores.map(s => [s.perfilId, s.perfil]));
        for (const [id, nome] of perfis) perfil.add(new Option(nome, id));
        const salvo = sessionStorage.getItem('CORETRACE_PERFIL');
        perfil.value = perfis.has(salvo) ? salvo : '';
        perfil.addEventListener('change', () => sessionStorage.setItem('CORETRACE_PERFIL', perfil.value));
        if (!periodo) return;
        const minutos = sessionStorage.getItem('CORETRACE_PERIODO');
        periodo.value = monitoramentoMock.periodos.includes(Number(minutos)) ? minutos : '1440';
        periodo.addEventListener('change', () => sessionStorage.setItem('CORETRACE_PERIODO', periodo.value));
    }

    function alertasAtivos(servidores) {
        return servidores.flatMap(servidor => {
            const estado = dashboardDados.classificar(servidor.componentes, servidor.ultimaColeta);
            return estado.alertas.map(alerta => {
                const componente = servidor.componentes.find(c => c.id === alerta.componente);
                const incidente = servidor.incidentes.find(i => i.componente === alerta.componente && i.fim === null);
                return {
                    id: `${servidor.id}-${alerta.componente}`, serverId: servidor.id,
                    servidor: servidor.nome, perfilId: servidor.perfilId, perfil: servidor.perfil,
                    recurso: alerta.recurso, nome: alerta.nome, nivel: alerta.nivel,
                    limite: componente[alerta.nivel], operador: componente.operador,
                    unidade: componente.unidade || (componente.coluna.endsWith('_percent') ? '%' : ''),
                    valor: servidor.ultimaColeta.valores[componente.coluna],
                    inicio: incidente?.inicio ?? servidor.ultimaColeta.instante,
                    monitorarDocker: servidor.monitorarDocker, docker: servidor.docker
                };
            });
        }).sort((a, b) => a.nivel !== b.nivel ? (a.nivel === 'critico' ? -1 : 1) : a.servidor.localeCompare(b.servidor, 'pt-BR'));
    }
    return { carregar, criar: cadastros => dashboardSimulacao.criar(cadastros), configurarFiltros, alertasAtivos };
})();
