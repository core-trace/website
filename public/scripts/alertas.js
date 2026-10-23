(async () => {
    const cenario = await dashboardCenario.carregar();
    const filtroPerfil = document.getElementById('alerta-filtro-perfil');
    const filtroNivel = document.getElementById('alerta-filtro-nivel');
    const busca = document.getElementById('busca-alertas');
    const lista = document.getElementById('lista-alertas');
    const vazio = document.getElementById('alertas-vazio');

    const nivelTexto = { critico: 'Crítico', atencao: 'Atenção', normal: 'Normal' };
    const nivelClasse = { critico: 'critico', atencao: 'atencao', normal: 'normal' };

    function preencherFiltros() {
        dashboardCenario.configurarFiltros(filtroPerfil, null, cenario.servidores);
    }

    function servidoresFiltrados() {
        const perfil = filtroPerfil.value;
        return cenario.servidores.filter((servidor) => !perfil || String(servidor.perfilId) === String(perfil));
    }

    function eventosAtivos() {
        return dashboardCenario.alertasAtivos(cenario.servidores);
    }

    function atualizarResumo() {
        const perfil = filtroPerfil.value;
        const selecionados = servidoresFiltrados();
        const resumo = dashboardDados.agregar(selecionados, [], cenario.referencia);
        const eventos = eventosAtivos().filter((alerta) => !perfil || alerta.perfilId === perfil);
        const criticos = eventos.filter((alerta) => alerta.nivel === 'critico').length;
        const atencao = eventos.filter((alerta) => alerta.nivel === 'atencao').length;

        document.getElementById('alertas-resumo').textContent = `${monitoramentoMock.dataHora(cenario.referencia)} BRT · ${resumo.criticos} servidores críticos · ${resumo.atencao} em atenção · ${eventos.length} alertas ativos.`;
        document.getElementById('alerta-total').textContent = eventos.length;
        document.getElementById('alerta-criticos').textContent = criticos;
        document.getElementById('alerta-atencao').textContent = atencao;
        document.getElementById('alerta-foco').textContent = perfil ? cenario.servidores.find(item => item.perfilId === perfil)?.perfil || 'Todos' : 'Todos';
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
            label.textContent = `${alerta.nome}: ${alerta.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${alerta.unidade}`;
            const detalhe = document.createElement('span');
            detalhe.textContent = `Limite ${nivelTexto[alerta.nivel].toLowerCase()}: ${alerta.operador} ${alerta.limite.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${alerta.unidade}`;
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
})().catch(erro => {
    const mensagem = document.getElementById('alertas-resumo');
    mensagem.textContent = erro.message;
    mensagem.setAttribute('role', 'alert');
});
