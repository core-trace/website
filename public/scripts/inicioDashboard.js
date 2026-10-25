(async () => {
    const cenario = await dashboardCenario.carregar();
    const { servidores, referencia } = cenario;
    let resumo;
    const situacoes = { critico: "Crítico", atencao: "Atenção", normal: "Normal", "sem-dados": "Dados insuficientes" };
    const filtroPerfil = document.getElementById("filtro-perfil");
    const filtroPeriodo = document.getElementById("filtro-periodo");
    dashboardCenario.configurarFiltros(filtroPerfil, filtroPeriodo, servidores);
    const filtroSituacao = document.getElementById("filtro-situacao");
    const busca = document.getElementById('busca-servidores');
    const lista = document.getElementById("lista-servidores");
    const vazio = document.getElementById("servidores-vazio");
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const normalizar = (valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const servidoresDoPerfil = () => servidores.filter((servidor) => !filtroPerfil.value || servidor.perfilId === filtroPerfil.value);

    function periodoAtual() {
        return { inicio: referencia - Number(filtroPeriodo.value) * 60_000, fim: referencia };
    }

    function atualizarGraficos() {
        const { inicio, fim } = periodoAtual();
        dashboardGraficos.renderizar(cenario.resumos?.[filtroPerfil.value]?.[filtroPeriodo.value]?.graficos || dashboardAlertasMock.agregar(cenario.registros, {
            inicio,
            fim,
            perfil: filtroPerfil.value
        }));
    }

    function atualizarIndicadores() {
        const selecionados = servidoresDoPerfil();
        resumo = dashboardDados.agregar(selecionados, [], referencia);
        const { inicio, fim } = periodoAtual();
        const indicadores = cenario.resumos?.[filtroPerfil.value]?.[filtroPeriodo.value]?.indicadores
            || dashboardDados.indicadoresNoPeriodo(selecionados, inicio, fim);
        const total = selecionados.length;
        const previsao = indicadores.previsao;
        texto("visao-resumo", `${total} servidores · ${monitoramentoMock.dataHora(inicio)} a ${monitoramentoMock.dataHora(fim)} BRT`);
        texto("titulo-servidores", `Servidores (${total})`);
        texto("indicador-atencao", indicadores.atencao);
        texto("indicador-criticos", indicadores.criticos);
        texto("indicador-alertas", indicadores.alertas.atencao + indicadores.alertas.critico);
        texto("alertas-criticos", `${indicadores.alertas.critico} críticos`);
        texto("alertas-atencao", `${indicadores.alertas.atencao} atenção`);
        const periodoCurto = fim - inicio < 86400000;
        texto("indicador-previsao", previsao ? `${previsao.dias} ${previsao.dias === 1 ? "dia" : "dias"}` : periodoCurto ? "Dados insuficientes" : "Sem tendência");
        document.getElementById("indicador-previsao").classList.toggle("visao-sem-previsao", !previsao);
        const volume = previsao && selecionados.find(servidor => servidor.id === previsao.servidor.id)
            ?.volumes.find(item => item.nome === previsao.volume);
        texto("legenda-previsao", previsao ? `${previsao.servidor.nome} · ${previsao.volume} · ${volume.uso.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% utilizado` : periodoCurto ? "Selecione ao menos 24 horas para estimar a tendência" : "Sem tendência de crescimento no período");
    }

    function atualizarTabela() {
        const termo = normalizar(busca.value.trim());
        const selecionados = resumo.servidores;
        const filtrados = selecionados.filter((servidor) =>
            (!filtroSituacao.value || servidor.situacao === filtroSituacao.value) &&
            normalizar(`${servidor.nome} ${servidor.perfil}`).includes(termo)
        );
        // Nomes e perfis do banco são texto, nunca HTML; a seleção usa o ID, não o nome.
        const linhas = filtrados.map((servidor) => {
            const linha = document.createElement("tr");
            [servidor.nome, servidor.perfil, situacoes[servidor.situacao], servidor.cpu, servidor.ram, servidor.disco, servidor.docker].forEach((valor, indice) => {
                const celula = document.createElement("td");
                celula.textContent = valor;
                if (indice === 2) celula.className = `visao-${servidor.situacao}`;
                linha.append(celula);
            });
            const coleta = document.createElement("td");
            if (servidor.ultimaColeta) {
                const horario = document.createElement("time");
                horario.dateTime = new Date(servidor.ultimaColeta.instante).toISOString();
                horario.textContent = monitoramentoMock.dataHora(servidor.ultimaColeta.instante);
                coleta.append(horario);
                if (servidor.desatualizado) {
                    const aviso = document.createElement("span");
                    aviso.className = "visao-coleta-aviso";
                    aviso.textContent = "Possivelmente desatualizada";
                    coleta.append(aviso);
                }
            } else coleta.textContent = "Sem coleta válida";
            linha.append(coleta);
            const acao = document.createElement("td");
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "visao-detalhes-botao";
            botao.dataset.servidor = servidor.id;
            botao.textContent = "Detalhes ";
            botao.setAttribute("aria-label", `Detalhes de ${servidor.nome}`);
            botao.setAttribute("aria-haspopup", "dialog");
            const seta = document.createElement("img");
            seta.src = "../assets/icons/seta_vermelha.svg";
            seta.alt = "";
            seta.width = 11;
            seta.height = 11;
            botao.append(seta);
            acao.append(botao);
            linha.append(acao);
            return linha;
        });
        lista.replaceChildren(...linhas);
        vazio.hidden = filtrados.length > 0;
    }

    filtroPerfil.addEventListener("change", () => { atualizarIndicadores(); atualizarTabela(); atualizarGraficos(); });
    filtroPeriodo.addEventListener("change", () => { atualizarIndicadores(); atualizarTabela(); atualizarGraficos(); });
    filtroSituacao.addEventListener("change", atualizarTabela);
    busca.addEventListener("input", atualizarTabela);
    lista.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-servidor]");
        if (!botao) return;
        const servidor = resumo.servidores.find((item) => String(item.id) === botao.dataset.servidor);
        if (servidor) document.dispatchEvent(new CustomEvent("abrir-detalhes-servidor", { detail: servidor }));
    });
    atualizarIndicadores();
    atualizarTabela();
    atualizarGraficos();
})().catch(erro => {
    const mensagem = document.getElementById('visao-resumo');
    mensagem.textContent = erro.message;
    mensagem.setAttribute('role', 'alert');
});
