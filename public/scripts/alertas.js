(() => {
    const cenario = dashboardCenario.criar();
    const filtroPerfil = document.getElementById('alerta-filtro-perfil');
    const filtroNivel = document.getElementById('alerta-filtro-nivel');
    const busca = document.querySelector('.dashboard-pesquisa input');
    const lista = document.getElementById('lista-alertas');
    const vazio = document.getElementById('alertas-vazio');

    const nivelTexto = { critico: 'Crítico', atencao: 'Atenção', normal: 'Normal' };
    const nivelClasse = { critico: 'critico', atencao: 'atencao', normal: 'normal' };

    function preencherFiltros() {
        dashboardAlertasMock.perfis.forEach(perfil => {
            filtroPerfil.add(new Option(perfil.nome, perfil.id));
        });
    }

    function servidoresFiltrados() {
        const perfil = filtroPerfil.value;
        return cenario.servidores.filter((servidor) => !perfil || String(servidor.perfilId) === String(perfil));
    }

    function eventosAtivos() {
        return cenario.servidores.flatMap((servidor) => {
            const ultimaColeta = servidor.ultimaColeta;
            const estado = dashboardDados.classificar(servidor.componentes, ultimaColeta);
            return estado.alertas.map((alerta) => {
                const componente = servidor.componentes.find((item) => item.id === alerta.componente) || {};
                const valor = ultimaColeta?.valores?.[componente.coluna];
                return {
                    id: `${servidor.id}-${alerta.componente}`,
                    serverId: servidor.id,
                    servidor: servidor.nome,
                    perfilId: String(servidor.perfilId),
                    perfil: servidor.perfil,
                    recurso: alerta.recurso,
                    nome: alerta.nome,
                    nivel: alerta.nivel,
                    limite: componente.critico ?? componente.atencao ?? 0,
                    valor: Number.isFinite(valor) ? Number(valor) : 0,
                    inicio: ultimaColeta?.instante ?? cenario.referencia,
                    monitorarDocker: servidor.monitorarDocker,
                    docker: servidor.docker
                };
            });
        }).sort((a, b) => {
            if (a.nivel !== b.nivel) return a.nivel === 'critico' ? -1 : 1;
            return a.servidor.localeCompare(b.servidor, 'pt-BR');
        });
    }

    function atualizarResumo() {
        const perfil = filtroPerfil.value;
        const selecionados = servidoresFiltrados();
        const resumo = dashboardDados.agregar(selecionados, [], cenario.referencia);
        const eventos = eventosAtivos().filter((alerta) => !perfil || alerta.perfilId === perfil);
        const criticos = eventos.filter((alerta) => alerta.nivel === 'critico').length;
        const atencao = eventos.filter((alerta) => alerta.nivel === 'atencao').length;

        document.getElementById('demo-referencia').textContent = monitoramentoMock.dataHora(cenario.referencia);
        document.getElementById('alertas-resumo').textContent = `Última atualização ${monitoramentoMock.dataHora(cenario.referencia)} · ${resumo.alertas.critico} crítico(s) e ${resumo.alertas.atencao} alerta(s) em atenção.`;
        document.getElementById('alerta-total').textContent = eventos.length;
        document.getElementById('alerta-criticos').textContent = criticos;
        document.getElementById('alerta-atencao').textContent = atencao;
        document.getElementById('alerta-foco').textContent = perfil ? dashboardAlertasMock.perfis.find((item) => item.id === perfil)?.nome || 'Todos' : 'Todos';
        document.getElementById('alerta-foco-legenda').textContent = perfil ? 'Perfil com foco atual em alertas' : 'Cenário principal em operação';
    }

    function atualizarLista() {
        const termo = (busca.value || '').trim().toLowerCase();
        const nivel = filtroNivel.value;
        const perfil = filtroPerfil.value;
        const eventos = eventosAtivos().filter((alerta) => {
            const passaPerfil = !perfil || alerta.perfilId === perfil;
            const passaNivel = !nivel || alerta.nivel === nivel;
            const passaBusca = !termo || [alerta.servidor, alerta.perfil, alerta.recurso, alerta.nome].join(' ').toLowerCase().includes(termo);
            return passaPerfil && passaNivel && passaBusca;
        });

        document.getElementById('alerta-quantidade').textContent = `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}`;
        lista.innerHTML = '';

        if (!eventos.length) {
            vazio.hidden = false;
            return;
        }

        vazio.hidden = true;

        eventos.forEach((alerta) => {
            const card = document.createElement('article');
            card.className = 'alerta-card';

            const principal = document.createElement('div');
            const titulo = document.createElement('h3');
            titulo.textContent = alerta.servidor;
            const meta = document.createElement('p');
            meta.textContent = `${alerta.perfil} · ${alerta.recurso}`;
            principal.append(titulo, meta);

            const metrica = document.createElement('div');
            metrica.className = 'alerta-metrica';
            const label = document.createElement('strong');
            label.textContent = `${alerta.nome}: ${Number(alerta.valor).toFixed(2)}${alerta.nome.includes('%') ? '%' : ''}`;
            const detalhe = document.createElement('span');
            detalhe.textContent = `Limite ${nivelTexto[alerta.nivel].toLowerCase()}: ${Number(alerta.limite).toFixed(2)}${alerta.nome.includes('%') ? '%' : ''}`;
            metrica.append(label, detalhe);

            const estado = document.createElement('div');
            const badge = document.createElement('span');
            badge.className = `alerta-badge ${nivelClasse[alerta.nivel]}`;
            badge.textContent = nivelTexto[alerta.nivel];
            const horario = document.createElement('p');
            horario.textContent = `${monitoramentoMock.dataHora(alerta.inicio)} · ${alerta.monitorarDocker ? alerta.docker : 'Docker não monitorado'}`;
            estado.append(badge, horario);

            card.append(principal, metrica, estado);
            lista.append(card);
        });
    }

    preencherFiltros();
    atualizarResumo();
    atualizarLista();

    filtroPerfil.addEventListener('change', () => {
        atualizarResumo();
        atualizarLista();
    });
    filtroNivel.addEventListener('change', () => {
        atualizarResumo();
        atualizarLista();
    });
    busca.addEventListener('input', atualizarLista);
})();
