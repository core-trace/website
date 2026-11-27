(() => {
    // ------------------------------------------------------------------
    // Elementos do DOM
    // ------------------------------------------------------------------
    const filtroServidor = document.getElementById("filtro-servidor");
    const filtroPeriodo = document.getElementById("periodo-graficos-processos");
    const tbodyTop5Recursos = document.getElementById("tbody-top5-recursos");

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
    let kpisDoDia = null;
    let servidorSelecionado = "";
    let dataSelecionada = "";
    // TEMPORÁRIO: force uma data específica para validar com AWS.
    // Comente esta linha para voltar ao comportamento padrão (dia atual).
    let momentoASelecionado = null;
    let momentoBSelecionado = null;
    // Em minutos. null = sem recorte (todos os pontos disponíveis).
    let periodoAtual = 10080;
    let processoEmFoco = null;

    // Passo dos gráficos: cada filtro define de quanto em quanto tempo é a variação.
    const PASSOS_GRAFICO = {
        60: { minutos: 60, rotulo: "1h" },
        360: { minutos: 120, rotulo: "2h" },
        1440: { minutos: 360, rotulo: "6h" },
        10080: { minutos: 720, rotulo: "12h" }
    };

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
    let dataHojeDoServidor = null;

    function dataHojeSaoPaulo() {
        return dataHojeDoServidor || new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo"
        });
    }

    /**
     * Recorte dos gráficos: últimos N minutos a partir da última captura carregada.
     * Null significa período inteiro. Os KPIs e a tabela não usam este limite.
     */
    function limiteDoPeriodo() {
        if (periodoAtual == null) return null;
        const instantes = processosDoDia
            .map(p => Date.parse(p.timestamp))
            .filter(Number.isFinite);
        if (instantes.length === 0) return null;
        return Math.max(...instantes) - periodoAtual * 60000;
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

    // Mesma chave usada no service: nome + PID e criação quando o lote a traz.
    function chaveProcesso(item) {
        const nome = item && item.nome ? item.nome : "desconhecido";
        const pid = item && item.pid != null ? item.pid : "--";
        const createTime = item && item.createTime ? item.createTime : "";
        return `${nome}|${pid}|${createTime}`;
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
        tbodyTop5Recursos.innerHTML = "";
    }

    function limparGraficos() {
        processoEmFoco = null;
        definirTexto(cpuValor, "--");
        definirTexto(cpuCaption, "--");
        definirTexto(memoriaValor, "--");
        definirTexto(memoriaCaption, "--");
        definirTexto(metaProcesso, "--");
        definirTexto(metaUsuario, "--");
        definirTexto(metaStatus, "--");
        tbodyTop5Recursos.querySelectorAll("tr.linha-ativa").forEach(linha => {
            linha.classList.remove("linha-ativa");
        });
        atualizarGrafico("grafico-cpu-area", [], "Variação CPU", COR_GRAFICO.cpu, null, null, true);
        atualizarGrafico("grafico-memoria-area", [], "Variação RAM", COR_GRAFICO.memoria, null, null, true);
    }

    // ------------------------------------------------------------------
    // Gráficos Chart.js (mesmo padrão de detalheServidor.js, com dados reais)
    // ------------------------------------------------------------------
    const FONTE_GRAFICO = { family: "Poppins", size: 12 };
    const COR_TEXTO_GRAFICO = "#4b4350";
    const COR_GRAFICO = { cpu: "#cc0301", memoria: "#477da7" };

    function numeroGrafico(valor) {
        return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }

    function horarioGrafico(instante) {
        return new Date(instante).toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function dataHoraGrafico(instante) {
        return new Date(instante).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function pontosDoGrafico(pontos) {
        return pontos
            .map(p => ({ x: Date.parse(p.t), y: Number(p.v) }))
            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
            .sort((a, b) => a.x - b.x);
    }

    function configuracaoComum(serie, limiares = {}, modoDelta = false) {
        const instantes = serie.map(p => p.x);
        const inicio = instantes[0];
        const fim = instantes[instantes.length - 1];
        const valores = serie.map(p => p.y);
        const margemEixo = modoDelta ? 1800000 : 30000;
        // Eixo linear precisa de limites distintos; uma leitura única ganha margem para cada lado.
        const mesmoInstante = inicio != null && inicio === fim;
        const maisDeUmDia = inicio != null && (fim - inicio) >= 86400000;
        const sufixo = modoDelta ? "p.p." : "%";

        const pluginLimites = {
            id: "limitesGrafico",
            afterDraw: grafico => {
                const ctx = grafico.ctx;
                const yAxe = grafico.scales.y;
                const xAxe = grafico.scales.x;
                if (!yAxe || !xAxe) return;

                ctx.save();
                ctx.font = "600 11px Poppins, sans-serif";
                ctx.textBaseline = "middle";
                ctx.textAlign = "left";

                const desenharLinhaLabel = (valor, texto, cor) => {
                    if (valor == null) return;
                    const yPixel = yAxe.getPixelForValue(valor);
                    const xPixel = xAxe.getPixelForValue(xAxe.min) + 6;
                    if (yPixel == null || xPixel == null) return;

                    // Fundo branco para legibilidade
                    const medida = ctx.measureText(texto);
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(xPixel - 3, yPixel - 8, medida.width + 6, 16);

                    // Texto
                    ctx.fillStyle = cor;
                    ctx.fillText(texto, xPixel, yPixel);
                    ctx.restore();
                };

                if (limiares.critico != null) {
                    ctx.save();
                    desenharLinhaLabel(limiares.critico, "Uso Severo (Critico)", "#cc0301");
                    ctx.restore();
                }
                if (limiares.atencao != null) {
                    ctx.save();
                    desenharLinhaLabel(limiares.atencao, "Uso medio-alto (Atencao)", "#e8a100");
                    ctx.restore();
                }

                ctx.restore();
            }
        };

        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            locale: "pt-BR",
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleFont: { size: 13, family: "Poppins" },
                    bodyFont: { size: 13, family: "Poppins" },
                    padding: 10,
                    callbacks: {
                        title: itens => dataHoraGrafico(itens[0].parsed.x),
                        label: contexto => `${contexto.dataset.label}: ${numeroGrafico(contexto.parsed.y)} ${sufixo}`
                    }
                },
                ...(limiares && (limiares.atencao != null || limiares.critico != null)
                    ? { limitesGrafico: pluginLimites }
                    : {})
            },
            scales: {
                x: {
                    type: "linear",
                    ...(inicio != null
                        ? { min: mesmoInstante ? inicio - margemEixo : inicio, max: mesmoInstante ? fim + margemEixo : fim }
                        : {}),
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        maxTicksLimit: 4,
                        maxRotation: 0,
                        callback: valor => maisDeUmDia ? dataHoraGrafico(valor) : horarioGrafico(valor),
                        color: COR_TEXTO_GRAFICO,
                        font: FONTE_GRAFICO
                    }
                },
                y: {
                    // Variação pode ser negativa; valor absoluto continua começando em zero.
                    min: modoDelta ? valores.reduce((menor, v) => Math.min(menor, v), 0) : 0,
                    // CPU de processo pode ultrapassar 100% em servidor multinúcleo.
                    suggestedMax: modoDelta ? Math.max(10, valores.reduce((maior, v) => Math.max(maior, v), 0)) : 100,
                    border: { display: false },
                    grid: { color: "#d6dbe3" },
                    ticks: {
                        maxTicksLimit: 4,
                        callback: valor => `${numeroGrafico(valor)} ${sufixo}`,
                        color: COR_TEXTO_GRAFICO,
                        font: FONTE_GRAFICO
                    }
                }
            }
        };
    }

    function destruirGraficos() {
        for (const grafico of [graficoCpu, graficoMemoria]) {
            if (grafico) grafico.destroy();
        }
        graficoCpu = null;
        graficoMemoria = null;
    }

    function atualizarGrafico(id, pontos, rotuloY, cor, pico = null, limiares = null, modoDelta = false) {
        if (typeof Chart === "undefined") return;

        const canvas = document.getElementById(id);
        if (!canvas) return;

        if (id === "grafico-cpu-area" && graficoCpu) {
            graficoCpu.destroy();
            graficoCpu = null;
        } else if (id === "grafico-memoria-area" && graficoMemoria) {
            graficoMemoria.destroy();
            graficoMemoria = null;
        }

        const serie = pontosDoGrafico(pontos);
        const primeiroX = serie.length > 0 ? serie[0].x : 0;
        const ultimoX = serie.length > 0 ? serie[serie.length - 1].x : 0;

        const datasets = [];

        // Limites de atenção e crítico são de uso absoluto e não se aplicam à variação horária.
        const atencao = !modoDelta && limiares && limiares.atencao != null ? Number(limiares.atencao) : null;
        const critico = !modoDelta && limiares && limiares.critico != null ? Number(limiares.critico) : null;

        // Área sombreada acima do crítico: preenche entre o valor e o crítico apenas quando acima.
        if (critico != null) {
            const pontosSombra = serie.map(p => ({
                x: p.x,
                y: p.y > critico ? p.y : critico
            }));
            datasets.push({
                label: "Área acima do crítico",
                data: pontosSombra,
                borderColor: "transparent",
                backgroundColor: "rgba(204, 3, 1, 0.08)",
                borderWidth: 0,
                pointRadius: 0,
                fill: "-1",
                tension: 0,
                spanGaps: false,
                order: 0
            });
        }

        // Linha horizontal do crítico
        if (critico != null) {
            datasets.push({
                label: "Uso Severo (Critico)",
                data: [{ x: primeiroX, y: critico }, { x: ultimoX, y: critico }],
                borderColor: "#cc0301",
                backgroundColor: "#cc0301",
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
                tension: 0,
                spanGaps: true,
                order: 1
            });
        }

        // Linha horizontal de atenção
        if (atencao != null) {
            datasets.push({
                label: "Uso medio-alto (Atencao)",
                data: [{ x: primeiroX, y: atencao }, { x: ultimoX, y: atencao }],
                borderColor: "#a96808",
                backgroundColor: "#a96808",
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
                tension: 0,
                spanGaps: true,
                order: 2
            });
        }

        // Série principal do processo
        datasets.push({
            label: rotuloY,
            data: serie,
            borderColor: cor,
            backgroundColor: cor,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0,
            spanGaps: false,
            order: 3
        });

        // Ponto destacado da Gold: só entra se o instante existir na série aberta.
        // Em modo de variação, o pico absoluto da Gold não corresponde ao delta.
        const instantePico = !modoDelta && pico ? Date.parse(pico.timestamp) : NaN;
        const valorPico = !modoDelta && pico ? Number(pico.valor) : NaN;
        if (Number.isFinite(instantePico) && Number.isFinite(valorPico) &&
            serie.some(p => p.x === instantePico)) {
            datasets.push({
                label: `Pico ${rotuloY} · ${identidadeProcesso(pico)}`,
                data: [{ x: instantePico, y: valorPico }],
                borderColor: cor,
                backgroundColor: cor,
                pointRadius: 6,
                pointHoverRadius: 7,
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                showLine: false,
                order: -1
            });
        }

        const grafico = new Chart(canvas, {
            type: "line",
            data: { datasets },
            options: configuracaoComum(serie, { atencao, critico }, modoDelta)
        });

        if (id === "grafico-cpu-area") graficoCpu = grafico;
        else graficoMemoria = grafico;
    }

    function inicializarGraficos() {
        if (typeof Chart === "undefined") {
            mostrarErro("Não foi possível carregar os gráficos. Recarregue a página.");
            return;
        }
        destruirGraficos();
        atualizarGrafico("grafico-cpu-area", [], "Variação CPU", COR_GRAFICO.cpu, null, null, true);
        atualizarGrafico("grafico-memoria-area", [], "Variação RAM", COR_GRAFICO.memoria, null, null, true);
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

    function renderizarTabelaTop5Recursos(lista) {
        limparTabela();

        if (!lista || lista.length === 0) {
            const tr = document.createElement("tr");
            const td = novaCelula("Nenhum processo encontrado.");
            td.colSpan = 4;
            td.style.textAlign = "center";
            tr.appendChild(td);
            tbodyTop5Recursos.appendChild(tr);
            return;
        }

        for (const item of lista) {
            const tr = document.createElement("tr");
            // A identidade vem do dado do ranking, não da célula exibida: o PID
            // dentro do texto termina com ")" e não pode ser reaproveitado.
            tr.dataset.chave = chaveProcesso(item);
            tr.dataset.nome = item.nome || "desconhecido";
            tr.dataset.pid = item.pid != null ? String(item.pid) : "--";
            if (item.createTime != null) tr.dataset.createTime = String(item.createTime);
            tr.appendChild(novaCelula(identidadeProcesso(item)));
            tr.appendChild(novaCelula(item.cpuMax != null ? item.cpuMax.toFixed(1) : "--"));
            tr.appendChild(novaCelula(item.memoriaMax != null ? item.memoriaMax.toFixed(1) : "--"));
            tr.appendChild(novaCelula(formatoBrasileiro(item.ultimoPico)));
            tbodyTop5Recursos.appendChild(tr);
        }
    }

    // ------------------------------------------------------------------
    // Renderização principal
    // ------------------------------------------------------------------
    function renderizar(dados) {
        esconderErro();

        processosDoDia = Array.isArray(dados.processos) ? dados.processos : [];
        const kpis = dados.kpis;
        kpisDoDia = kpis || null;
        if (dados.limiares && kpisDoDia) kpisDoDia.limiares = dados.limiares;
        renderizarKpis(kpis, processosDoDia.length === 0);

        const top5Recursos = Array.isArray(dados.top5Recursos)
            ? [...dados.top5Recursos]
            : [];
        renderizarTabelaTop5Recursos(top5Recursos);

        // Plota automaticamente o processo com maior CPU máxima.
        if (top5Recursos.length > 0) {
            const primeiro = top5Recursos[0];
            carregarHistoricoProcesso(primeiro.nome, primeiro.pid, primeiro.createTime || null);
        } else {
            limparGraficos();
        }

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
            if (dados.hoje) dataHojeDoServidor = dados.hoje;
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
                renderizar({ processos: [], top5Recursos: [], kpis: null, comparacao: null });
            }
        } catch (erro) {
            console.error(erro);
            marcarErroKpis();
            mostrarErro("Não foi possível carregar a lista de servidores.");
        }
    }

    /**
     * Busca o dashboard nos últimos 7 dias, do dia selecionado para trás.
     * Dia sem captura é ignorado; as amostras dos dias com dados são reunidas
     * para que os gráficos possam usar passos de até 12 horas.
     */
    async function buscarDashboardsDoPeriodo(aoReceberDados = null) {
        const [ano, mes, dia] = dataSelecionada.split("-").map(Number);
        const referencia = Date.UTC(ano, mes - 1, dia);
        const datas = [];

        for (let i = 0; i < 7; i++) {
            datas.push(new Date(referencia - i * 86400000).toISOString().slice(0, 10));
        }

        // Busca os 7 dias em paralelo: o tempo total é o do dia mais lento,
        // não a soma de sete requisições sequenciais.
        const resultados = await Promise.allSettled(datas.map(async data => {
            const resposta = await fetch(urlComAcesso("/processos/dashboard", {
                mac: servidorSelecionado,
                data
            }));

            if (!resposta.ok) {
                const corpo = await resposta.json().catch(() => ({}));
                throw new Error(corpo.erro || `Falha ao consultar capturas (${resposta.status}).`);
            }

            const dados = await resposta.json();
            // Permite renderizar o dia selecionado antes de os outros terminarem.
            if (aoReceberDados) aoReceberDados(data, dados);
            return dados;
        }));

        const dashboards = [];
        let primeiroErro = null;

        for (const resultado of resultados) {
            if (resultado.status === "fulfilled") {
                if ((resultado.value.total || 0) > 0) dashboards.push(resultado.value);
            } else if (!primeiroErro) {
                primeiroErro = resultado.reason;
            }
        }

        if (dashboards.length === 0) {
            if (primeiroErro) throw primeiroErro;
            return null;
        }

        // KPIs, Top 5 e comparativo continuam referentes ao dia mais recente.
        const maisRecente = dashboards[0];
        const processos = dashboards
            .flatMap(dados => Array.isArray(dados.processos) ? dados.processos : [])
            .sort((a, b) =>
                new Date(a.timestamp || 0).getTime() -
                new Date(b.timestamp || 0).getTime()
            );

        return {
            ...maisRecente,
            processos,
            total: processos.length,
            ultimaColeta: processos.length > 0
                ? processos[processos.length - 1].timestamp
                : null
        };
    }

    async function carregarDados() {
        if (!servidorSelecionado || !dataSelecionada) return;

        definirEstadoKpis("carregando");
        try {
            const dados = await buscarDashboardsDoPeriodo();

            if (!dados) {
                renderizar({ processos: [], top5Recursos: [], kpis: null, comparacao: null });
                mostrarErro("Nenhuma captura encontrada para este servidor nos últimos 7 dias.");
                return;
            }

            renderizar(dados);
        } catch (erro) {
            console.error(erro);
            marcarErroKpis();
            renderizarTabelaTop5Recursos([]);
            limparGraficos();
            mostrarErro(`Não foi possível carregar os dados de processos. ${erro.message || ""}`.trim());
        }
    }

    // ------------------------------------------------------------------
    // Séries de variação por passo (diferença entre passos consecutivos)
    // ------------------------------------------------------------------
    function serieVariacaoHoraria(pontos, passoMinutos) {
        const passoMs = passoMinutos * 60000;
        const porPasso = new Map();

        // As amostras já chegam ordenadas; a última leitura de cada passo prevalece.
        for (const ponto of pontos) {
            const instante = Date.parse(ponto.t);
            if (!Number.isFinite(instante)) continue;
            porPasso.set(Math.floor(instante / passoMs), ponto);
        }

        const passos = Array.from(porPasso.keys()).sort((a, b) => a - b);
        const serie = [];

        for (let i = 1; i < passos.length; i++) {
            const atual = porPasso.get(passos[i]);
            const anterior = porPasso.get(passos[i - 1]);
            serie.push({ t: atual.t, v: atual.v - anterior.v });
        }

        return serie;
    }

    function formatarVariacao(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return "--";
        const sinal = numero > 0 ? "+" : "";
        return `${sinal}${numero.toFixed(1).replace(".", ",")} p.p.`;
    }

    function carregarHistoricoProcesso(nomeProcesso, pid, createTime = null) {
        const filtrados = processosDoDia.filter(
            p => (p.nome || "") === nomeProcesso &&
                String(p.pid) === String(pid) &&
                (createTime == null || String(p.createTime || "") === String(createTime))
        );

        if (filtrados.length === 0) {
            limparGraficos();
            return;
        }

        processoEmFoco = { nome: nomeProcesso, pid, createTime };
        const chaveSelecionada = chaveProcesso(processoEmFoco);
        tbodyTop5Recursos.querySelectorAll("tr").forEach(linha => {
            linha.classList.toggle("linha-ativa", linha.dataset.chave === chaveSelecionada);
        });

        // Indicadores do mesmo processo das séries: usuario e pico de memoria
        // das proprias amostras, nao do pico global do KPI.
        const usuario = filtrados
            .map(p => p.usuario)
            .find(u => u != null && String(u).trim() !== "") || "--";
        const picoMemoria = filtrados.reduce((maior, p) => {
            if (p.memoriaValida === false || p.memoria == null) return maior;
            return maior == null || p.memoria > maior ? p.memoria : maior;
        }, null);
        definirTexto(metaProcesso, identidadeProcesso({ nome: nomeProcesso, pid }));
        definirTexto(metaUsuario, usuario);
        definirTexto(metaStatus, picoMemoria != null && picoMemoria >= 90 ? "crítico" : "estável");

        const passo = PASSOS_GRAFICO[periodoAtual] || PASSOS_GRAFICO[10080];

        // Agrupa pelo passo antes de recortar o período para não perder o passo de referência.
        const leiturasCpu = [];
        const leiturasMem = [];

        for (const p of filtrados) {
            const cpu = extrairValorLeitura(p.cpu);
            const mem = extrairValorLeitura(p.memoria);

            if (cpu != null && p.valido !== false) leiturasCpu.push({ t: p.timestamp, v: cpu });
            if (mem != null && p.memoriaValida !== false) leiturasMem.push({ t: p.timestamp, v: mem });
        }

        const limite = limiteDoPeriodo();
        const dentroDoPeriodo = serie => {
            if (limite === null) return serie;
            return serie.filter(p => {
                const instante = Date.parse(p.t);
                return Number.isFinite(instante) && instante >= limite;
            });
        };

        const pontosCpu = dentroDoPeriodo(serieVariacaoHoraria(leiturasCpu, passo.minutos));
        const pontosMem = dentroDoPeriodo(serieVariacaoHoraria(leiturasMem, passo.minutos));
        const semLeitura = limite !== null ? "sem variação no período" : "--";

        const ultimoCpu = pontosCpu[pontosCpu.length - 1];
        const ultimoMem = pontosMem[pontosMem.length - 1];

        definirTexto(cpuValor, ultimoCpu ? formatarVariacao(ultimoCpu.v) : "--");
        definirTexto(cpuCaption, ultimoCpu
            ? `Última variação (${passo.rotulo}): ${formatoBrasileiro(ultimoCpu.t)}`
            : semLeitura);

        definirTexto(memoriaValor, ultimoMem ? formatarVariacao(ultimoMem.v) : "--");
        definirTexto(memoriaCaption, ultimoMem
            ? `Última variação (${passo.rotulo}): ${formatoBrasileiro(ultimoMem.t)}`
            : semLeitura);

        atualizarGrafico(
            "grafico-cpu-area", pontosCpu, `Variação CPU (${passo.rotulo})`, COR_GRAFICO.cpu,
            null, null, true
        );
        atualizarGrafico(
            "grafico-memoria-area", pontosMem, `Variação RAM (${passo.rotulo})`, COR_GRAFICO.memoria,
            null, null, true
        );
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

    filtroPeriodo.addEventListener("change", function () {
        periodoAtual = Number(this.value);
        if (!processoEmFoco) {
            limparGraficos();
            return;
        }
        carregarHistoricoProcesso(processoEmFoco.nome, processoEmFoco.pid, processoEmFoco.createTime);
    });

    // Seleção de processo no ranking: usa a identidade gravada na linha, sem
    // depender do texto exibido (que inclui o ")" do PID).
    tbodyTop5Recursos.addEventListener("click", function (evento) {
        const linha = evento.target.closest("tr");
        if (!linha || !linha.dataset.chave) return;

        carregarHistoricoProcesso(
            linha.dataset.nome,
            linha.dataset.pid,
            linha.dataset.createTime || null
        );
    });

    // ------------------------------------------------------------------
    // Inicialização
    // ------------------------------------------------------------------
    inicializarGraficos();
    carregarServidores();
})();