(() => {
    let servidores = [];
    let carregando = false;
    let carregou = false;
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
        const total = selecionados.length;
        const semComunicacao = selecionados.filter((servidor) => servidor.situacao === "sem-comunicacao").length;
        const criticos = selecionados.filter((servidor) => monitoramentoMock.cenario(servidor.modelo).alertas.some((alerta) => alerta.nivel === "critico")).length;
        const previsao = monitoramentoMock.menorPrevisao(selecionados);
        const perfis = new Set(selecionados.map((servidor) => servidor.perfilId)).size;
        const cpu = selecionados.filter((servidor) => servidor.modelo === "cpu").length;
        const ram = total - cpu;
        const alertasSelecionados = selecionados.flatMap((servidor) => monitoramentoMock.cenario(servidor.modelo).alertas);
        const alertasCriticos = alertasSelecionados.filter((alerta) => alerta.nivel === "critico").length;
        const indisponivel = carregando || !carregou;

        texto("visao-resumo", indisponivel ? (carregando ? "Carregando os servidores da sua empresa..." : "Não foi possível carregar os servidores.")
            : `${total} ${total === 1 ? "servidor" : "servidores"} em ${perfis} ${perfis === 1 ? "perfil" : "perfis"} · acompanhe recursos, alertas e containers.`);
        texto("titulo-servidores", indisponivel ? "Servidores" : `Servidores (${total})`);
        texto("indicador-reportando", indisponivel ? "—" : `${total - semComunicacao}/${total}`);
        texto("legenda-reportando", indisponivel ? "Aguardando a lista de servidores" : `${semComunicacao} sem comunicação`);
        texto("indicador-criticos", indisponivel ? "—" : criticos);
        texto("legenda-criticos", "Prioridade de investigação");
        texto("indicador-alertas", indisponivel ? "—" : alertasSelecionados.length);
        texto("legenda-alertas", indisponivel ? "Dados ilustrativos" : `${alertasCriticos} críticos · ${alertasSelecionados.length - alertasCriticos} atenção`);
        texto("indicador-previsao", indisponivel ? "—" : previsao ? `${previsao.dias} ${previsao.dias === 1 ? "dia" : "dias"}` : "Sem previsão");
        texto("legenda-previsao", indisponivel ? "Aguardando a lista de servidores" : previsao
            ? `${previsao.servidor.nome} · ${previsao.volume}${previsao.recurso === "inodes" ? " · inodes" : ""}`
            : total ? "Sem estimativa disponível para os volumes" : "Nenhum servidor selecionado");
        document.getElementById("recursos-resumo").innerHTML = ["CPU", "RAM", "Disco", "Rede"].map((recurso, indice) => {
            const alertas = [cpu, ram, ram, 0][indice];
            return `<div class="visao-recurso"><h3>${recurso}</h3><p class="visao-recurso-valor">${indisponivel ? "—" : alertas} ${alertas === 1 ? "servidor" : "servidores"}</p><p class="visao-legenda">Simulação entre ${total} servidores</p></div>`;
        }).join("");
    }

    function atualizarTabela() {
        const termo = normalizar(busca.value.trim());
        const selecionados = servidoresDoPerfil();
        const filtrados = selecionados.filter((servidor) =>
            (!filtroSituacao.value || servidor.situacao === filtroSituacao.value) &&
            normalizar(`${servidor.nome} ${servidor.perfil}`).includes(termo)
        );
        // Nomes e perfis do banco são texto, nunca HTML; a seleção usa o ID, não o nome.
        const linhas = filtrados.map((servidor) => {
            const linha = document.createElement("tr");
            [servidor.nome, servidor.perfil, "Crítico", servidor.cpu, servidor.ram, servidor.disco, servidor.docker, servidor.uptime].forEach((valor, indice) => {
                const celula = document.createElement("td");
                celula.textContent = valor;
                if (indice === 2) celula.className = "visao-critico";
                linha.append(celula);
            });
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
            ? "Nenhum servidor cadastrado na sua empresa. Os servidores aparecerão aqui após a ativação do agente."
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
            const empresa = Number(sessionStorage.ID_EMPRESA);
            if (!Number.isSafeInteger(empresa) || empresa <= 0) throw new Error("Faça login para visualizar os servidores da sua empresa.");
            const resposta = await fetch(`/servidor/lista?empresa=${empresa}`, { signal: AbortSignal.timeout(15000) });
            if (!resposta.ok) throw new Error("Não foi possível consultar os servidores. Tente novamente em instantes.");
            const dados = await resposta.json();
            if (!Array.isArray(dados) || dados.some((servidor) => !servidor
                || !Number.isSafeInteger(servidor.id_servidor) || servidor.id_servidor <= 0
                || !Number.isSafeInteger(servidor.id_perfil_servidor) || servidor.id_perfil_servidor <= 0
                || (servidor.nome !== null && typeof servidor.nome !== "string")
                || typeof servidor.nome_perfil !== "string")
                || new Set(dados.map((servidor) => servidor.id_servidor)).size !== dados.length) {
                throw new Error("Não foi possível carregar a lista de servidores.");
            }
            servidores = dados.map(monitoramentoMock.aplicar);
            carregou = true;
        } catch (falha) {
            texto("servidores-mensagem-erro", falha.name === "TimeoutError"
                ? "A consulta demorou mais que o esperado. Tente novamente."
                : falha instanceof TypeError ? "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente." : falha.message);
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
        const servidor = servidores.find((item) => item.id === Number(botao.dataset.servidor));
        if (servidor) document.dispatchEvent(new CustomEvent("abrir-detalhes-servidor", { detail: servidor }));
    });
    carregarServidores();
})();
