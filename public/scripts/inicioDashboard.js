(() => {
    let servidores = [];
    let carregando = false;
    let carregou = false;
    let referencia = monitoramentoMock.referencia();
    let resumo = dashboardDados.agregar([], [], referencia);
    const situacoes = { critico: "Crítico", atencao: "Atenção", normal: "Sem alertas ativos", "sem-dados": "Dados insuficientes" };
    const filtroPerfil = document.getElementById("filtro-perfil");
    const filtroSituacao = document.getElementById("filtro-situacao");
    const busca = document.querySelector('.dashboard-pesquisa input');
    const lista = document.getElementById("lista-servidores");
    const secao = document.querySelector(".visao-servidores");
    const vazio = document.getElementById("servidores-vazio");
    const erro = document.getElementById("servidores-erro");
    const tentar = document.getElementById("servidores-tentar");
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const normalizar = (valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const servidoresDoPerfil = () => servidores.filter((servidor) => !filtroPerfil.value || servidor.perfilId === filtroPerfil.value);

    function atualizarIndicadores() {
        const selecionados = servidoresDoPerfil();
        resumo = dashboardDados.agregar(selecionados, [], referencia);
        const total = selecionados.length;
        const perfis = new Set(selecionados.map(servidor => servidor.perfilId)).size;
        const indisponivel = carregando || !carregou;
        const previsao = resumo.previsao;
        texto("visao-resumo", indisponivel ? (carregando ? "Preparando a demonstração local..." : "Não foi possível preparar a demonstração.")
            : `${total} ${total === 1 ? "servidor" : "servidores"} em ${perfis} ${perfis === 1 ? "perfil" : "perfis"} · acompanhe a criticidade da infraestrutura.`);
        texto("titulo-servidores", indisponivel ? "Servidores" : `Servidores (${total})`);
        texto("indicador-atencao", indisponivel ? "—" : resumo.atencao);
        texto("indicador-criticos", indisponivel ? "—" : resumo.criticos);
        texto("indicador-alertas", indisponivel ? "—" : resumo.alertas.atencao + resumo.alertas.critico);
        texto("alertas-criticos", `${indisponivel ? "—" : resumo.alertas.critico} críticos`);
        texto("alertas-atencao", `${indisponivel ? "—" : resumo.alertas.atencao} atenção`);
        texto("indicador-previsao", indisponivel ? "—" : previsao ? `${previsao.dias} ${previsao.dias === 1 ? "dia" : "dias"}` : "Dados insuficientes");
        document.getElementById("indicador-previsao").classList.toggle("visao-sem-previsao", !indisponivel && !previsao);
        texto("legenda-previsao", indisponivel ? "Aguardando os dados" : previsao
            ? `${previsao.servidor.nome} · ${previsao.volume} · limite ${previsao.limite}%`
            : total ? "Sem histórico suficiente de crescimento" : "Nenhum servidor no escopo");
        texto("visao-atualizacao", `Métricas simuladas · KPIs e tabela: estado em ${monitoramentoMock.dataHora(referencia)}`);
        texto("demo-referencia", monitoramentoMock.dataHora(referencia));

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
        vazio.hidden = !carregou || carregando || filtrados.length > 0;
        vazio.textContent = servidores.length === 0
            ? "Nenhum servidor cadastrado disponível para seu usuário e suas permissões."
            : "Nenhum servidor encontrado. Tente outro termo ou altere os filtros.";
        texto("servidores-contagem", carregou ? `Mostrando ${filtrados.length} de ${servidores.length} servidores cadastrados` : "");
    }

    function atualizarPerfis() {
        const selecionado = filtroPerfil.value;
        const perfis = new Map(servidores.map((servidor) => [servidor.perfilId, servidor.perfil]));
        filtroPerfil.replaceChildren(new Option("Todos os perfis", ""));
        [...perfis.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).forEach(([id, nome]) => {
            filtroPerfil.add(new Option(nome, id));
        });
        filtroPerfil.value = perfis.has(selecionado) ? selecionado : "";
    }

    async function carregarServidores() {
        if (!sessionStorage.ID_EMPRESA || !sessionStorage.ID_USUARIO) return;
        if (carregando) return;
        carregando = true;
        carregou = false;
        servidores = [];
        secao.setAttribute("aria-busy", "true");
        document.getElementById("servidores-carregando").hidden = false;
        erro.hidden = true;
        tentar.disabled = true;
        filtroPerfil.disabled = true;
        filtroSituacao.disabled = true;
        atualizarIndicadores();
        atualizarTabela();
        try {
            const parametros = new URLSearchParams({empresa:sessionStorage.ID_EMPRESA,usuario:sessionStorage.ID_USUARIO});
            const resposta=await fetch('/servidor/lista?'+parametros);
            if(!resposta.ok) throw new Error('Cadastro indisponível');
            const cadastros=await resposta.json();
            if(!Array.isArray(cadastros))throw new Error('Resposta cadastral inválida');
            const simulacao = dashboardSimulacao.criar(cadastros);
            referencia = simulacao.referencia;
            servidores = simulacao.servidores;
            carregou = true;
        } catch (falha) {
            texto("servidores-mensagem-erro", "Não foi possível carregar o cadastro de servidores. Verifique a sessão e a disponibilidade da rota /servidor/lista e do banco. Nenhum cadastro fictício será utilizado.");
            erro.hidden = false;
        } finally {
            carregando = false;
            document.getElementById("servidores-carregando").hidden = true;
            secao.setAttribute("aria-busy", "false");
            tentar.disabled = false;
            filtroPerfil.disabled = !carregou;
            filtroSituacao.disabled = !carregou;
            atualizarPerfis();
            atualizarIndicadores();
            atualizarTabela();
        }
    }

    filtroPerfil.addEventListener("change", () => { atualizarIndicadores(); atualizarTabela(); });
    filtroSituacao.addEventListener("change", atualizarTabela);
    busca.addEventListener("input", atualizarTabela);
    tentar.addEventListener("click", carregarServidores);
    lista.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-servidor]");
        if (!botao) return;
        const servidor = resumo.servidores.find((item) => item.id === Number(botao.dataset.servidor));
        if (servidor) document.dispatchEvent(new CustomEvent("abrir-detalhes-servidor", { detail: servidor }));
    });
    setTimeout(carregarServidores, 0);
})();
