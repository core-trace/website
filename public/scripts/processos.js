(() => {
    // ------------------------------------------------------------------
    // Elementos do DOM
    // ------------------------------------------------------------------
    const filtroServidor = document.getElementById("filtro-servidor");
    const btnComparar = document.getElementById("btn-comparar-momentos");
    const tbodyRecorrencia = document.getElementById("tbody-recorrencia");

    // KPIs
    const kpiLoop = document.getElementById("kpi-loop");
    const kpiLoopSub = document.getElementById("kpi-loop-sub");
    const kpiMemoria = document.getElementById("kpi-pico-memoria");
    const kpiMemoriaSub = document.getElementById("kpi-pico-memoria-sub");
    const kpiCpu = document.getElementById("kpi-pico-cpu");
    const kpiCpuSub = document.getElementById("kpi-pico-cpu-sub");

    const cardsKpi = {
        loop: document.getElementById("kpi-card-loop"),
        memoria: document.getElementById("kpi-card-pico-memoria"),
        cpu: document.getElementById("kpi-card-pico-cpu")
    };

    // Meta chips do histórico
    const metaProcesso = document.getElementById("meta-processo");
    const metaUsuario = document.getElementById("meta-usuario");
    const metaStatus = document.getElementById("meta-status");

    // Banner de alerta
    const alertaBanner = document.getElementById("alerta-banner");
    const alertaTexto = document.getElementById("alerta-texto");

    // Valores dos gráficos
    const cpuValor = document.getElementById("grafico-cpu-valor");
    const cpuCaption = document.getElementById("grafico-cpu-caption");
    const memoriaValor = document.getElementById("grafico-memoria-valor");
    const memoriaCaption = document.getElementById("grafico-memoria-caption");

    // Comparativo de momentos
    const momentoA = document.getElementById("momento-a");
    const momentoB = document.getElementById("momento-b");

    // A API não usa sessão por cookie: identidade vem do sessionStorage.
    const idEmpresa = sessionStorage.getItem("ID_EMPRESA");
    const idUsuario = sessionStorage.getItem("ID_USUARIO");

    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------
    let graficoCpu = null;
    let graficoMemoria = null;
    let processosDoDia = [];
    let servidorSelecionado = "";
    let dataSelecionada = "";
    let momentoASelecionado = null;
    let momentoBSelecionado = null;

    // ------------------------------------------------------------------
    // Utilitários
    // ------------------------------------------------------------------
    function formatoBrasileiro(dataIso) {
        if (!dataIso) return "--";
        try {
            const d = new Date(dataIso);
            return d.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        } catch (e) {
            return dataIso;
        }
    }

    function dataHojeSaoPaulo() {
        return new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo"
        });
    }

    function urlComAcesso(caminho, filtros = {}) {
        const params = new URLSearchParams();
        if (idEmpresa) {
            params.set("empresa", idEmpresa);
            params.set("idEmpresa", idEmpresa);
        }
        if (idUsuario) {
            params.set("usuario", idUsuario);
            params.set("idUsuario", idUsuario);
        }
        for (const [chave, valor] of Object.entries(filtros)) {
            params.set(chave, valor);
        }
        return `${caminho}?${params.toString()}`;
    }

    function extrairValorLeitura(leitura) {
        if (leitura == null) return null;
        if (typeof leitura === "number") return leitura;
        if (typeof leitura === "object" && leitura.valor !== undefined) return leitura.valor;
        return null;
    }

    function formatarPercentual(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return "--";
        return `${numero.toFixed(1).replace(".", ",")}%`;
    }

    function formatarBytes(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero <= 0) return null;
        const gib = numero / (1024 ** 3);
        if (gib >= 1) return `${gib.toFixed(1).replace(".", ",")} GiB`;
        return `${Math.round(numero / (1024 ** 2))} MiB`;
    }

    function identidadeProcesso(item) {
        if (!item || !item.nome) return "processo não identificado";
        return `${item.nome} (PID ${item.pid != null ? item.pid : "--"})`;
    }

    function definirTexto(elemento, texto) {
        if (elemento) elemento.textContent = texto;
    }

    // Os rótulos são cortados com elipse no CSS; o título guarda o texto completo.
    function definirSubtitulo(elemento, texto) {
        definirTexto(elemento, texto);
        if (elemento) elemento.title = texto;
    }

    function definirEstadoCard(card, estado) {
        if (!card) return;
        card.classList.remove(
            "kpi-card--carregando",
            "kpi-card--sem-dado",
            "kpi-card--erro"
        );
        if (estado) card.classList.add(`kpi-card--${estado}`);
    }

    function definirEstadoKpis(estado) {
        Object.values(cardsKpi).forEach(card => definirEstadoCard(card, estado));
    }

    function marcarErroKpis() {
        definirEstadoKpis("erro");
        definirSubtitulo(kpiLoopSub, "erro ao carregar capturas");
        definirSubtitulo(kpiMemoriaSub, "erro ao carregar capturas");
        definirSubtitulo(kpiCpuSub, "erro ao carregar capturas");
        definirTexto(kpiLoop, "--");
        definirTexto(kpiMemoria, "--");
        definirTexto(kpiCpu, "--");
    }

    function mostrarErro(mensagem) {
        alertaTexto.textContent = mensagem;
        alertaBanner.hidden = false;
    }

    function esconderErro() {
        alertaBanner.hidden = true;
    }

    function limparTabela() {
        tbodyRecorrencia.innerHTML = "";
    }

    function limparGraficos() {
        definirTexto(cpuValor, "--");
        definirTexto(cpuCaption, "--");
        definirTexto(memoriaValor, "--");
        definirTexto(memoriaCaption, "--");
        atualizarGrafico(graficoCpu, [], "CPU");
        atualizarGrafico(graficoMemoria, [], "RAM");
    }

    // ------------------------------------------------------------------
    // Inicialização dos gráficos Chart.js
    // ------------------------------------------------------------------
    function inicializarGraficos() {
        const configuracaoComum = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    type: "category",
                    title: { display: true, text: "Horário" },
                    ticks: { maxRotation: 45, minRotation: 45 }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "%" },
                    ticks: { stepSize: 25 }
                }
            }
        };

        graficoCpu = new Chart(document.getElementById("grafico-cpu-area"), {
            type: "line",
            data: { labels: [], datasets: [] },
            options: {
                ...configuracaoComum,
                scales: {
                    ...configuracaoComum.scales,
                    // CPU de processo pode ultrapassar 100% em servidor multinúcleo.
                    y: { ...configuracaoComum.scales.y, suggestedMax: 100 }
                }
            }
        });

        graficoMemoria = new Chart(document.getElementById("grafico-memoria-area"), {
            type: "line",
            data: { labels: [], datasets: [] },
            options: configuracaoComum
        });
    }

    function atualizarGrafico(grafico, pontos, rotuloY) {
        if (!grafico) return;

        const labels = pontos.map(p => p.t);
        const valores = pontos.map(p => p.v);

        grafico.data.labels = labels;
        grafico.data.datasets = [{
            label: rotuloY,
            data: valores,
            borderColor: rotuloY === "CPU" ? "#cc0301" : "#2563eb",
            backgroundColor: rotuloY === "CPU" ? "rgba(204, 3, 1, 0.15)" : "rgba(37, 99, 235, 0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 0
        }];

        grafico.update();
    }

    // ------------------------------------------------------------------
    // KPIs (calculados no service, a partir das capturas reais)
    // ------------------------------------------------------------------
    function renderizarKpis(kpis, semCapturas) {
        if (!kpis) {
            definirEstadoKpis("sem-dado");
            definirTexto(kpiLoop, "--");
            definirTexto(kpiMemoria, "--");
            definirTexto(kpiCpu, "--");
            definirSubtitulo(kpiLoopSub, "sem capturas no período");
            definirSubtitulo(kpiMemoriaSub, "sem capturas no período");
            definirSubtitulo(kpiCpuSub, "sem capturas no período");
            return;
        }

        const reiniciando = kpis.reiniciandoLoop || { total: 0, processos: [] };
        const primeiroLoop = Array.isArray(reiniciando.processos) && reiniciando.processos.length > 0
            ? reiniciando.processos[0]
            : null;

        definirTexto(kpiLoop, String(reiniciando.total != null ? reiniciando.total : 0));
        definirSubtitulo(kpiLoopSub, primeiroLoop
            ? `${identidadeProcesso(primeiroLoop)} · ${primeiroLoop.reinicios} reinícios`
            : "nenhum reinício recorrente no período");
        definirEstadoCard(cardsKpi.loop, semCapturas ? "sem-dado" : null);

        const picoMemoria = kpis.picoMemoria;
        definirTexto(kpiMemoria, picoMemoria ? formatarPercentual(picoMemoria.valor) : "--");
        const detalheMemoria = picoMemoria
            ? `${identidadeProcesso(picoMemoria)} · ${formatoBrasileiro(picoMemoria.timestamp)}`
            : "sem leitura válida de memória";
        definirSubtitulo(kpiMemoriaSub,
            picoMemoria && picoMemoria.rssBytes != null
                ? `${detalheMemoria} · ${formatarBytes(picoMemoria.rssBytes)}`
                : detalheMemoria);
        definirEstadoCard(cardsKpi.memoria, !picoMemoria || semCapturas ? "sem-dado" : null);

        const picoCpu = kpis.picoCpu;
        definirTexto(kpiCpu, picoCpu ? formatarPercentual(picoCpu.valor) : "--");
        definirSubtitulo(kpiCpuSub, picoCpu
            ? `${identidadeProcesso(picoCpu)} · ${formatoBrasileiro(picoCpu.timestamp)}`
            : "sem leitura válida de CPU");
        definirEstadoCard(cardsKpi.cpu, !picoCpu || semCapturas ? "sem-dado" : null);
    }

    // ------------------------------------------------------------------
    // Recorrência (linhas do service)
    // ------------------------------------------------------------------
    function novaCelula(texto) {
        const td = document.createElement("td");
        td.textContent = texto != null ? texto : "--";
        return td;
    }

    function renderizarTabelaRecorrencia(lista) {
        limparTabela();

        if (!lista || lista.length === 0) {
            const tr = document.createElement("tr");
            const td = novaCelula("Nenhum processo encontrado.");
            td.colSpan = 6;
            td.style.textAlign = "center";
            tr.appendChild(td);
            tbodyRecorrencia.appendChild(tr);
            return;
        }

        for (const item of lista) {
            const tr = document.createElement("tr");
            tr.appendChild(novaCelula(`${item.nome || "desconhecido"} (PID ${item.pid != null ? item.pid : "--"})`));
            tr.appendChild(novaCelula(item.ocorrencias));
            tr.appendChild(novaCelula(String(item.tipo || "").toUpperCase() || "--"));
            tr.appendChild(novaCelula(formatoBrasileiro(item.ultima)));
            tr.appendChild(novaCelula(item.duracaoMedia || "--"));
            tr.appendChild(novaCelula(item.frequencia));
            tbodyRecorrencia.appendChild(tr);
        }
    }

    // ------------------------------------------------------------------
    // Renderização principal
    // ------------------------------------------------------------------
    function renderizar(dados) {
        esconderErro();

        processosDoDia = Array.isArray(dados.processos) ? dados.processos : [];
        const kpis = dados.kpis;
        renderizarKpis(kpis, processosDoDia.length === 0);

        const recorrencia = Array.isArray(dados.recorrencia)
            ? [...dados.recorrencia].sort(
                (a, b) => (b.ocorrencias || 0) - (a.ocorrencias || 0)
            )
            : [];
        renderizarTabelaRecorrencia(recorrencia);

        // Plota automaticamente o processo com mais ocorrências.
        if (recorrencia.length > 0) {
            carregarHistoricoProcesso(recorrencia[0].nome, recorrencia[0].pid);
        } else {
            limparGraficos();
        }

        // Meta chips do histórico usam o mesmo pico de memória do KPI.
        const picoMemoria = kpis && kpis.picoMemoria;
        definirTexto(metaProcesso, picoMemoria ? identidadeProcesso(picoMemoria) : "--");
        definirTexto(metaUsuario, picoMemoria && picoMemoria.usuario ? picoMemoria.usuario : "--");
        definirTexto(metaStatus, picoMemoria
            ? (picoMemoria.valor >= 90 ? "crítico" : "estável")
            : "--");

        // Comparativo de momentos: usa o cálculo do service, com fallback local.
        const comparacao = dados.comparacao;
        if (comparacao && comparacao.momentoA && comparacao.momentoB) {
            momentoASelecionado = comparacao.momentoA;
            momentoBSelecionado = comparacao.momentoB;
        } else {
            const temposUnicos = [...new Set(processosDoDia.map(p => p.timestamp))].sort();
            momentoASelecionado = temposUnicos.length >= 2 ? temposUnicos[temposUnicos.length - 2] : null;
            momentoBSelecionado = temposUnicos.length >= 2 ? temposUnicos[temposUnicos.length - 1] : null;
        }
        definirTexto(momentoA, momentoASelecionado ? formatoBrasileiro(momentoASelecionado) : "--");
        definirTexto(momentoB, momentoBSelecionado ? formatoBrasileiro(momentoBSelecionado) : "--");
    }

    // ------------------------------------------------------------------
    // Carregamento de dados
    // ------------------------------------------------------------------
    async function carregarServidores() {
        if (!idEmpresa || !idUsuario) {
            marcarErroKpis();
            mostrarErro("Sessão inválida. Faça login novamente para ver os dados.");
            return;
        }

        try {
            const resposta = await fetch(urlComAcesso("/processos/servidores"));
            if (!resposta.ok) throw new Error("Falha ao listar servidores");

            const dados = await resposta.json();
            const servidores = Array.isArray(dados.servidores) ? dados.servidores : [];

            filtroServidor.innerHTML = '<option value="" selected disabled hidden>--</option>';

            for (const servidor of servidores) {
                const mac = typeof servidor === "string" ? servidor : servidor.mac;
                if (!mac) continue;

                const option = document.createElement("option");
                option.value = mac;
                option.textContent = typeof servidor === "string" ? mac : (servidor.nome || mac);
                filtroServidor.appendChild(option);
            }

            if (servidores.length > 0) {
                filtroServidor.value = typeof servidores[0] === "string"
                    ? servidores[0]
                    : servidores[0].mac;
                servidorSelecionado = filtroServidor.value;
                dataSelecionada = dataHojeSaoPaulo();
                await carregarDados();
            } else {
                renderizar({ processos: [], recorrencia: [], kpis: null, comparacao: null });
            }
        } catch (erro) {
            console.error(erro);
            marcarErroKpis();
            mostrarErro("Não foi possível carregar a lista de servidores.");
        }
    }

    /**
     * Busca o dashboard na API em até 7 dias, do dia selecionado para trás.
     * Capturas antigas continuam aparecendo quando o dia atual ainda não tem lote.
     */
    async function buscarDashboardNoPeriodo() {
        const [ano, mes, dia] = dataSelecionada.split("-").map(Number);
        const referencia = Date.UTC(ano, mes - 1, dia);

        for (let i = 0; i < 7; i++) {
            const data = new Date(referencia - i * 86400000).toISOString().slice(0, 10);
            const resposta = await fetch(urlComAcesso("/processos/dashboard", {
                mac: servidorSelecionado,
                data
            }));

            if (!resposta.ok) {
                const corpo = await resposta.json().catch(() => ({}));
                throw new Error(corpo.erro || `Falha ao consultar capturas (${resposta.status}).`);
            }

            const dados = await resposta.json();
            if ((dados.total || 0) > 0) return dados;
        }

        return null;
    }

    async function carregarDados() {
        if (!servidorSelecionado || !dataSelecionada) return;

        definirEstadoKpis("carregando");
        try {
            const dados = await buscarDashboardNoPeriodo();

            if (!dados) {
                renderizar({ processos: [], recorrencia: [], kpis: null, comparacao: null });
                mostrarErro("Nenhuma captura encontrada para este servidor nos últimos 7 dias.");
                return;
            }

            renderizar(dados);
        } catch (erro) {
            console.error(erro);
            marcarErroKpis();
            renderizarTabelaRecorrencia([]);
            limparGraficos();
            mostrarErro(`Não foi possível carregar os dados de processos. ${erro.message || ""}`.trim());
        }
    }

    function carregarHistoricoProcesso(nomeProcesso, pid) {
        const filtrados = processosDoDia.filter(
            p => (p.nome || "") === nomeProcesso && String(p.pid) === String(pid)
        );

        if (filtrados.length === 0) {
            limparGraficos();
            return;
        }

        const pontosCpu = [];
        const pontosMem = [];

        for (const p of filtrados) {
            const cpu = extrairValorLeitura(p.cpu);
            const mem = extrairValorLeitura(p.memoria);

            if (cpu != null && p.valido !== false) pontosCpu.push({ t: p.timestamp, v: cpu });
            if (mem != null && p.memoriaValida !== false) pontosMem.push({ t: p.timestamp, v: mem });
        }

        const ultimoCpu = pontosCpu[pontosCpu.length - 1];
        const ultimoMem = pontosMem[pontosMem.length - 1];

        definirTexto(cpuValor, ultimoCpu ? formatarPercentual(ultimoCpu.v) : "--");
        definirTexto(cpuCaption, ultimoCpu
            ? `Última leitura: ${formatoBrasileiro(ultimoCpu.t)}`
            : "--");

        definirTexto(memoriaValor, ultimoMem ? formatarPercentual(ultimoMem.v) : "--");
        definirTexto(memoriaCaption, ultimoMem
            ? `Última leitura: ${formatoBrasileiro(ultimoMem.t)}`
            : "--");

        atualizarGrafico(graficoCpu, pontosCpu, "CPU");
        atualizarGrafico(graficoMemoria, pontosMem, "RAM");
    }

    // ------------------------------------------------------------------
    // Eventos
    // ------------------------------------------------------------------
    filtroServidor.addEventListener("change", async function () {
        servidorSelecionado = this.value;
        if (!servidorSelecionado) return;
        dataSelecionada = dataHojeSaoPaulo();
        await carregarDados();
    });

    btnComparar.addEventListener("click", function () {
        if (!momentoASelecionado || !momentoBSelecionado) return;
        alertaTexto.textContent = `Comparando ${formatoBrasileiro(momentoASelecionado)} → ${formatoBrasileiro(momentoBSelecionado)}`;
        alertaBanner.hidden = false;
    });

    // Seleção de processo na tabela de recorrência (clique na linha)
    tbodyRecorrencia.addEventListener("click", function (evento) {
        const linha = evento.target.closest("tr");
        if (!linha) return;

        const celulaNome = linha.querySelector("td");
        if (!celulaNome) return;

        const textoNome = celulaNome.textContent.trim();
        const pidMatch = textoNome.match(/PID\s+(\S+)/);
        const nomeProcesso = textoNome.replace(/\s*\(PID.*/, "").trim();
        const pid = pidMatch ? pidMatch[1] : null;

        if (pid) {
            carregarHistoricoProcesso(nomeProcesso, pid);
        }
    });

    // ------------------------------------------------------------------
    // Inicialização
    // ------------------------------------------------------------------
    inicializarGraficos();
    carregarServidores();
})();
