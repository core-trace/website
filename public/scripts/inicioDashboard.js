(() => {
    const cenario = dashboardCenario.criar();
    const { servidores, referencia, registros: historicoAlertas } = cenario;
    let resumo;
    const situacoes = { critico: "Crítico", atencao: "Atenção", normal: "Normal" };
    const filtroPerfil = document.getElementById("filtro-perfil");
    const filtroPeriodo = document.getElementById("filtro-periodo");
    dashboardCenario.configurarFiltros(filtroPerfil, filtroPeriodo);
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
        dashboardGraficos.renderizar(dashboardAlertasMock.agregar(historicoAlertas, {
            inicio,
            fim,
            perfil: filtroPerfil.value
        }));
    }

    function atualizarIndicadores() {
        const selecionados = servidoresDoPerfil();
        const { inicio, fim } = periodoAtual();
        const severidades = { critico: 0, atencao: 0 };

        for (const servidor of selecionados) {
            let maiorNivel = "normal";
            for (const coleta of servidor.coletas) {
                if (coleta.instante < inicio || coleta.instante > fim) continue;
                const estado = dashboardDados.classificar(servidor.componentes, coleta);
                if (estado.severidade === "critico") {
                    maiorNivel = "critico";
                    break;
                }
                if (estado.severidade === "atencao") maiorNivel = "atencao";
            }
            if (maiorNivel === "critico") severidades.critico++;
            else if (maiorNivel === "atencao") severidades.atencao++;
        }

        resumo = dashboardDados.agregar(selecionados, [], referencia);
        const total = selecionados.length;
        const previsao = resumo.previsao;
        texto("visao-resumo", `iFood · ${total} servidores · ${monitoramentoMock.dataHora(referencia)}`);
        texto("titulo-servidores", `Servidores (${total})`);
        texto("indicador-atencao", severidades.atencao);
        texto("indicador-criticos", severidades.critico);
        texto("indicador-alertas", severidades.atencao + severidades.critico);
        texto("alertas-criticos", `${severidades.critico} críticos`);
        texto("alertas-atencao", `${severidades.atencao} atenção`);
        texto("indicador-previsao", previsao ? `${previsao.dias} ${previsao.dias === 1 ? "dia" : "dias"}` : "Sem tendência");
        document.getElementById("indicador-previsao").classList.toggle("visao-sem-previsao", !previsao);
        texto("legenda-previsao", previsao ? `${previsao.servidor.nome} · ${previsao.volume}` : "Armazenamento estável");
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
            [servidor.nome, servidor.perfil, situacoes[servidor.situacao], servidor.cpu, servidor.ram, servidor.disco, servidor.docker, servidor.uptime].forEach((valor, indice) => {
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
        const servidor = resumo.servidores.find((item) => item.id === Number(botao.dataset.servidor));
        if (servidor) document.dispatchEvent(new CustomEvent("abrir-detalhes-servidor", { detail: servidor }));
    });
    atualizarIndicadores();
    atualizarTabela();
    atualizarGraficos();
})();
