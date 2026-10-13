(() => {
    // Cenário ilustrativo independente da API. A tabela mostra oito exemplos dos 120 servidores.
    const servidores = [
        { nome: "cart-api-12", perfil: "Carrinho", situacao: "sem-comunicacao", cpu: "Sem dados", ram: "Sem dados", disco: "Sem dados", docker: "Sem dados", uptime: "Sem dados" },
        { nome: "cart-api-07", perfil: "Carrinho", situacao: "critico", cpu: "97%", ram: "72%", disco: "63%", docker: "4 em execução", uptime: "12d 4h" },
        { nome: "pay-db-02", perfil: "Financeiro", situacao: "critico", cpu: "63%", ram: "94%", disco: "88%", docker: "3 em execução", uptime: "9d 21h" },
        { nome: "catalog-api-03", perfil: "Catálogo", situacao: "atencao", cpu: "Não monitorado", ram: "87%", disco: "Não monitorado", docker: "Desativado", uptime: "6d 12h" },
        { nome: "cart-api-02", perfil: "Carrinho", situacao: "reportando", cpu: "42%", ram: "68%", disco: "54%", docker: "3 em execução", uptime: "11d 3h" },
        { nome: "pay-api-04", perfil: "Financeiro", situacao: "reportando", cpu: "38%", ram: "62%", disco: "47%", docker: "2 em execução", uptime: "3d 8h" },
        { nome: "catalog-api-05", perfil: "Catálogo", situacao: "reportando", cpu: "Não monitorado", ram: "59%", disco: "Não monitorado", docker: "Desativado", uptime: "14d 2h" },
        { nome: "cart-api-09", perfil: "Carrinho", situacao: "atencao", cpu: "82%", ram: "75%", disco: "71%", docker: "2 em execução · 1 parado", uptime: "5d 9h" }
    ];
    // Os totais por perfil compõem os indicadores gerais do protótipo.
    const perfis = {
        Carrinho: { total: 52, reportando: 50, criticos: 4, alertasCriticos: 6, alertasAtencao: 4, recursos: [[3, 50], [1, 48], [1, 45], [1, 42]], previsao: { dias: 21, servidor: "cart-api-09", volume: "/" } },
        Financeiro: { total: 39, reportando: 38, criticos: 3, alertasCriticos: 4, alertasAtencao: 3, recursos: [[1, 38], [2, 37], [2, 35], [1, 33]], previsao: { dias: 14, servidor: "pay-db-02", volume: "/dados" } },
        "Catálogo": { total: 29, reportando: 28, criticos: 1, alertasCriticos: 1, alertasAtencao: 1, recursos: [[1, 22], [1, 20], [0, 15], [0, 15]], previsao: null }
    };
    const situacoes = { "sem-comunicacao": "Sem comunicação", critico: "Crítico", atencao: "Atenção", reportando: "Reportando" };
    const filtroPerfil = document.getElementById("filtro-perfil");
    const filtroSituacao = document.getElementById("filtro-situacao");
    const busca = document.querySelector('.dashboard-pesquisa input');
    const lista = document.getElementById("lista-servidores");
    const servidoresComDetalhes = new Set(["cart-api-12", "cart-api-07", "pay-db-02"]);
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const normalizar = (valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const percentual = (parte, total) => (parte / total * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    function atualizarIndicadores() {
        const selecionados = filtroPerfil.value ? [perfis[filtroPerfil.value]] : Object.values(perfis);
        const somar = (chave) => selecionados.reduce((total, perfil) => total + perfil[chave], 0);
        const total = somar("total");
        const reportando = somar("reportando");
        const criticos = somar("criticos");
        const previsao = selecionados.map((perfil) => perfil.previsao).filter(Boolean).sort((a, b) => a.dias - b.dias)[0];

        texto("visao-resumo", `${total} servidores em ${filtroPerfil.value || "3 perfis"} · acompanhe recursos, alertas e containers.`);
        texto("indicador-reportando", `${reportando} / ${total}`);
        texto("legenda-reportando", `${percentual(reportando, total)}% · ${total - reportando} sem comunicação recente`);
        texto("indicador-criticos", criticos);
        texto("legenda-criticos", `Servidores únicos · ${percentual(criticos, total)}% dos cadastrados`);
        texto("indicador-alertas", somar("alertasCriticos") + somar("alertasAtencao"));
        texto("legenda-alertas", `${somar("alertasCriticos")} críticos + ${somar("alertasAtencao")} de atenção`);
        texto("indicador-previsao", previsao ? `${previsao.dias} dias` : "Sem previsão");
        texto("legenda-previsao", previsao ? `${previsao.servidor} · ${previsao.volume} · estimativa` : "Histórico insuficiente");
        texto("previsao-descricao", previsao
            ? `${previsao.dias} dias para espaço em ${previsao.volume} · inodes: previsão independente · nunca somar previsões de volumes diferentes.`
            : "Histórico insuficiente para estimar o espaço disponível neste perfil.");
        texto("titulo-servidores", `Servidores (${total})`);

        document.getElementById("recursos-resumo").innerHTML = ["CPU", "RAM", "Disco", "Rede"].map((recurso, indice) => {
            const alertas = selecionados.reduce((soma, perfil) => soma + perfil.recursos[indice][0], 0);
            const monitorados = selecionados.reduce((soma, perfil) => soma + perfil.recursos[indice][1], 0);
            return `<div class="visao-recurso"><h3>${recurso}</h3><p class="visao-recurso-valor">${alertas} ${alertas === 1 ? "servidor" : "servidores"}</p><p class="visao-legenda">Entre ${monitorados} com regra e dados atuais</p></div>`;
        }).join("");
    }

    function atualizarTabela() {
        const termo = normalizar(busca.value.trim());
        const filtrados = servidores.filter((servidor) =>
            (!filtroPerfil.value || servidor.perfil === filtroPerfil.value) &&
            (!filtroSituacao.value || servidor.situacao === filtroSituacao.value) &&
            normalizar(`${servidor.nome} ${servidor.perfil}`).includes(termo)
        );

        // Somente os valores fixos do mock são inseridos no HTML, nunca o texto da busca.
        lista.innerHTML = filtrados.map((servidor) => `<tr>
            <td>${servidor.nome}</td><td>${servidor.perfil}</td>
            <td class="visao-${servidor.situacao}">${situacoes[servidor.situacao]}</td>
            <td>${servidor.cpu}</td><td>${servidor.ram}</td><td>${servidor.disco}</td>
            <td>${servidor.docker}</td><td>${servidor.uptime}</td>
            <td><button class="visao-detalhes-botao" type="button" data-servidor="${servidor.nome}" aria-label="Detalhes de ${servidor.nome}" aria-haspopup="dialog" ${servidoresComDetalhes.has(servidor.nome) ? "" : 'disabled title="Detalhes disponíveis nos três primeiros servidores de exemplo"'}>Detalhes <img src="../assets/icons/seta_vermelha.svg" alt="" width="11" height="11"></button></td>
        </tr>`).join("");

        document.getElementById("servidores-vazio").hidden = filtrados.length > 0;
        const filtrando = filtroPerfil.value || filtroSituacao.value || termo;
        texto("servidores-contagem", filtrando
            ? `${filtrados.length} ${filtrados.length === 1 ? "resultado nos 8 servidores de exemplo" : "resultados nos 8 servidores de exemplo"}`
            : "Mostrando 1–8 de 120 servidores");
    }

    filtroPerfil.addEventListener("change", () => { atualizarIndicadores(); atualizarTabela(); });
    filtroSituacao.addEventListener("change", atualizarTabela);
    busca.addEventListener("input", atualizarTabela);

    lista.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-servidor]");
        if (!botao) return;
        const servidor = servidores.find((item) => item.nome === botao.dataset.servidor);
        if (!servidoresComDetalhes.has(servidor.nome)) return;
        document.dispatchEvent(new CustomEvent("abrir-detalhes-servidor", { detail: servidor }));
    });

    atualizarIndicadores();
    atualizarTabela();
})();
