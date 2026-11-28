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
    const cpuTempoElevado = document.getElementById("cpu-tempo-elevado");
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

    // A granularidade vem do módulo de agregação; aqui fica só o rótulo.
    const ROTULOS_PASSO = { 1: "1 min", 5: "5 min", 15: "15 min", 60: "1 h" };

    // ------------------------------------------------------------------
    // Utilitários
    // ------------------------------------------------------------------
    function formatoBrasileiro(dataIso) {
        if (!dataIso) return "--";
        try {
            const d = new Date(dataIso);
            return d.toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
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

    function formatarPercentual(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return "--";
        return `${numero.toFixed(1).replace(".", ",")}%`;
    }

    // Durações vêm da agregação em milissegundos; aqui ausência não é zero.
    function formatarDuracao(milisegundos) {
        const numero = Number(milisegundos);
        if (!Number.isFinite(numero)) return "--";
        const totalSegundos = Math.max(0, Math.round(numero / 1000));
        if (totalSegundos === 0) return "0 min";

        const dias = Math.floor(totalSegundos / 86400);
        const horas = Math.floor((totalSegundos % 86400) / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60);
        const segundos = totalSegundos % 60;
        const partes = [];
        if (dias) partes.push(`${dias} d`);
        if (horas) partes.push(`${horas} h`);
        if (minutos) partes.push(`${minutos} min`);
        if (segundos) partes.push(`${segundos} s`);
        return partes.join(" ");
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
        definirTexto(cpuTempoElevado, "--");
        definirTexto(memoriaValor, "--");
        definirTexto(memoriaCaption, "--");
        definirTexto(metaProcesso, "--");
        definirTexto(metaUsuario, "--");
        definirTexto(metaStatus, "--");
        tbodyTop5Recursos.querySelectorAll("tr.linha-ativa").forEach(linha => {
            linha.classList.remove("linha-ativa");
        });
        atualizarGraficoCpu([], "--");
        atualizarGraficoMemoria([], [], "--", null);
    }

    // ------------------------------------------------------------------
    // Gráficos Chart.js (mesmo padrão de detalheServidor.js, com dados reais)
    // ------------------------------------------------------------------
    const FONTE_GRAFICO = { family: "Poppins", size: 12 };
    const COR_TEXTO_GRAFICO = "#4b4350";
    const COR_GRAFICO = { memoria: "#477da7" };

    // Ordem e chaves vêm da agregação; cores e rótulos são só apresentação.
    const FAIXAS_CPU_VISUAL = {
        ate25: { rotulo: "Até 25%", cor: "#c9d2dc" },
        ate50: { rotulo: "25% a 50%", cor: "#e8a100" },
        ate75: { rotulo: "50% a 75%", cor: "#a96808" },
        acima75: { rotulo: "Acima de 75%", cor: "#cc0301" }
    };

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

    function destruirGraficos() {
        for (const grafico of [graficoCpu, graficoMemoria]) {
            if (grafico) grafico.destroy();
        }
        graficoCpu = null;
        graficoMemoria = null;
    }

    /**
     * Barras empilhadas da distribuição temporal de CPU. Cada segmento é a
     * proporção do tempo observado em uma faixa; os dados vêm da Etapa 2.
     */
    function atualizarGraficoCpu(distribuicao, rotulo) {
        if (typeof Chart === "undefined") return;

        const canvas = document.getElementById("grafico-cpu-area");
        if (!canvas) return;

        if (graficoCpu) {
            graficoCpu.destroy();
            graficoCpu = null;
        }

        const buckets = Array.isArray(distribuicao) ? distribuicao : [];
        const labels = buckets.map(bucket => bucket.inicio);
        const ordemFaixas = ProcessosAgregacao.FAIXAS_CPU;

        const datasets = ordemFaixas.map(chave => ({
            label: FAIXAS_CPU_VISUAL[chave].rotulo,
            faixa: chave,
            data: buckets.map(bucket => bucket.proporcoes
                ? Number(bucket.proporcoes[chave] || 0) * 100
                : null),
            backgroundColor: FAIXAS_CPU_VISUAL[chave].cor,
            borderColor: "#ffffff",
            borderWidth: 1,
            borderSkipped: false,
            barPercentage: 1,
            categoryPercentage: 0.95
        }));

        graficoCpu = new Chart(canvas, {
            type: "bar",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                locale: "pt-BR",
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: "top",
                        align: "start",
                        labels: {
                            usePointStyle: true,
                            pointStyle: "rect",
                            boxWidth: 10,
                            boxHeight: 10,
                            padding: 12,
                            color: COR_TEXTO_GRAFICO,
                            font: FONTE_GRAFICO
                        }
                    },
                    tooltip: {
                        titleFont: { size: 13, family: "Poppins" },
                        bodyFont: { size: 12, family: "Poppins" },
                        padding: 10,
                        filter: item => item.parsed && item.parsed.y > 0,
                        callbacks: {
                            title: itens => {
                                if (!itens || itens.length === 0) return "";
                                const bucket = buckets[itens[0].dataIndex];
                                if (!bucket) return "";
                                return `${formatoBrasileiro(new Date(bucket.inicio).toISOString())} – ${horarioGrafico(bucket.fim)}`;
                            },
                            label: contexto => {
                                const bucket = buckets[contexto.dataIndex];
                                if (!bucket || !bucket.proporcoes) return "Sem dados no intervalo";

                                const faixa = contexto.dataset.faixa;
                                return [
                                    `Faixa: ${FAIXAS_CPU_VISUAL[faixa].rotulo}`,
                                    `Proporção: ${formatarPercentual(bucket.proporcoes[faixa] * 100)} do tempo observado`,
                                    `Tempo na faixa: ${formatarDuracao(bucket.temposMs[faixa])}`,
                                    `Total observado: ${formatarDuracao(bucket.observadoMs)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            maxTicksLimit: 6,
                            maxRotation: 0,
                            autoSkip: true,
                            callback: function (valor) {
                                const bruto = typeof this.getLabelForValue === "function"
                                    ? this.getLabelForValue(valor)
                                    : valor;
                                const instante = Number(bruto);
                                return Number.isFinite(instante) ? horarioGrafico(instante) : "";
                            },
                            color: COR_TEXTO_GRAFICO,
                            font: FONTE_GRAFICO
                        }
                    },
                    y: {
                        stacked: true,
                        min: 0,
                        max: 100,
                        border: { display: false },
                        grid: { color: "#d6dbe3" },
                        ticks: {
                            stepSize: 25,
                            callback: valor => `${numeroGrafico(valor)}%`,
                            color: COR_TEXTO_GRAFICO,
                            font: FONTE_GRAFICO
                        }
                    }
                }
            }
        });

        // Referência da distribuição exibida, útil para inspeção e testes.
        graficoCpu.configuracaoDistribuicao = { distribuicao, rotulo };
        return graficoCpu;
    }

    /**
     * Área de evolução da RAM. Pontos sem leitura entram como null para quebrar
     * a linha: ausência de dado nunca é desenhada como consumo zero.
     */
    function atualizarGraficoMemoria(pontos, eventos, rotulo, passoMinutos) {
        if (typeof Chart === "undefined") return;

        const canvas = document.getElementById("grafico-memoria-area");
        if (!canvas) return;

        if (graficoMemoria) {
            graficoMemoria.destroy();
            graficoMemoria = null;
        }

        const serie = (Array.isArray(pontos) ? pontos : [])
            .map(ponto => {
                // Intervalo sem leitura não tem `t`: usa o início para manter a
                // posição temporal e desenhar a lacuna como ponto null.
                let instante = typeof ponto.t === "number" ? ponto.t : Date.parse(ponto.t);
                if (!Number.isFinite(instante) && ponto.inicio != null) {
                    instante = typeof ponto.inicio === "number"
                        ? ponto.inicio
                        : Date.parse(ponto.inicio);
                }
                const valor = ponto.v == null || !Number.isFinite(Number(ponto.v))
                    ? null
                    : Number(ponto.v);
                const rss = ponto.rssBytes == null || !Number.isFinite(Number(ponto.rssBytes))
                    ? null
                    : Number(ponto.rssBytes);
                return {
                    x: instante,
                    y: valor,
                    t: ponto.t,
                    rssBytes: rss
                };
            })
            .filter(ponto => Number.isFinite(ponto.x))
            .sort((a, b) => a.x - b.x);

        const eventosValidos = (Array.isArray(eventos) ? eventos : [])
            .map(evento => ({
                tempo: typeof evento.tempo === "number" ? evento.tempo : Date.parse(evento.tempo),
                rotulo: evento.rotulo
            }))
            .filter(evento => Number.isFinite(evento.tempo) && evento.rotulo)
            .sort((a, b) => a.tempo - b.tempo);

        const instantesComDado = serie.filter(ponto => ponto.y != null).map(ponto => ponto.x);
        const inicio = instantesComDado[0];
        const fim = instantesComDado[instantesComDado.length - 1];
        const mesmoInstante = inicio != null && inicio === fim;
        const maisDeUmDia = inicio != null && fim != null && (fim - inicio) >= 86400000;
        const margemEixo = 1800000;

        // Mudanças são destacadas pela direção real entre leituras observadas,
        // sem limite fixo inventado: crescimento em coral, redução em verde.
        function estadoPonto(indice) {
            const atual = serie[indice];
            if (!atual || atual.y == null) return { cor: COR_GRAFICO.memoria, raio: 0 };
            let anterior = null;
            for (let i = indice - 1; i >= 0; i--) {
                if (serie[i].y != null) {
                    anterior = serie[i].y;
                    break;
                }
            }
            if (anterior == null) return { cor: COR_GRAFICO.memoria, raio: 2 };
            if (atual.y > anterior) return { cor: "#cc0301", raio: 4 };
            if (atual.y < anterior) return { cor: "#17885e", raio: 4 };
            return { cor: COR_GRAFICO.memoria, raio: 2 };
        }

        const pluginMarcadores = {
            id: "marcadoresEventosRam",
            afterDatasetsDraw: grafico => {
                if (eventosValidos.length === 0) return;
                const area = grafico.chartArea;
                const eixoX = grafico.scales.x;
                const ctx = grafico.ctx;
                if (!area || !eixoX || !ctx) return;

                ctx.save();
                ctx.font = "600 10px Poppins, sans-serif";
                ctx.textBaseline = "middle";
                for (const evento of eventosValidos) {
                    const pixel = eixoX.getPixelForValue(evento.tempo);
                    if (pixel == null || pixel < area.left || pixel > area.right) continue;

                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = "rgba(204, 3, 1, 0.45)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pixel, area.top);
                    ctx.lineTo(pixel, area.bottom);
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.fillStyle = "rgba(204, 3, 1, 0.85)";
                    const aDireita = pixel > area.right - 52;
                    ctx.textAlign = aDireita ? "right" : "left";
                    ctx.fillText("reinício", pixel + (aDireita ? -4 : 4), area.top + 12);
                }
                ctx.restore();
            }
        };

        const dataset = {
            label: `Utilização de RAM (${rotulo})`,
            data: serie.map(ponto => ({ x: ponto.x, y: ponto.y })),
            borderColor: COR_GRAFICO.memoria,
            backgroundColor: contexto => {
                const area = contexto.chart.chartArea;
                if (!area) return "rgba(71, 125, 167, 0.18)";
                const gradiente = contexto.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                gradiente.addColorStop(0, "rgba(71, 125, 167, 0.32)");
                gradiente.addColorStop(1, "rgba(71, 125, 167, 0.02)");
                return gradiente;
            },
            borderWidth: 2,
            tension: 0.25,
            fill: "origin",
            spanGaps: false,
            pointRadius: contexto => estadoPonto(contexto.dataIndex).raio,
            pointHoverRadius: 5,
            pointBackgroundColor: contexto => estadoPonto(contexto.dataIndex).cor,
            pointBorderColor: "#ffffff",
            pointBorderWidth: 1
        };

        const configuracao = {
            type: "line",
            data: { datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                locale: "pt-BR",
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        titleFont: { size: 13, family: "Poppins" },
                        bodyFont: { size: 12, family: "Poppins" },
                        padding: 10,
                        filter: item => item.parsed && item.parsed.y != null,
                        callbacks: {
                            title: itens => {
                                if (!itens || itens.length === 0) return "";
                                const ponto = serie[itens[0].dataIndex];
                                return ponto && ponto.t ? formatoBrasileiro(ponto.t) : "";
                            },
                            label: contexto => {
                                const ponto = serie[contexto.dataIndex];
                                if (!ponto || ponto.y == null) return [];
                                const linhas = [`Utilização: ${formatarPercentual(ponto.y)}`];
                                if (ponto.rssBytes != null) {
                                    linhas.push(`Memória utilizada: ${formatarBytes(ponto.rssBytes)}`);
                                }
                                return linhas;
                            },
                            afterBody: itens => {
                                if (!itens || itens.length === 0 || eventosValidos.length === 0) return [];
                                const instante = Number(itens[0].parsed.x);
                                const tolerancia = Math.max(1, Number(passoMinutos) || 1) * 60000;
                                const evento = eventosValidos.find(
                                    item => Math.abs(item.tempo - instante) <= tolerancia
                                );
                                return evento ? ["", `Evento: ${evento.rotulo}`] : [];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        ...(inicio != null
                            ? {
                                min: mesmoInstante ? inicio - margemEixo : inicio,
                                max: mesmoInstante ? fim + margemEixo : fim
                            }
                            : {}),
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            maxTicksLimit: 6,
                            maxRotation: 0,
                            callback: valor => maisDeUmDia ? dataHoraGrafico(valor) : horarioGrafico(valor),
                            color: COR_TEXTO_GRAFICO,
                            font: FONTE_GRAFICO
                        }
                    },
                    y: {
                        min: 0,
                        suggestedMax: 100,
                        border: { display: false },
                        grid: { color: "#d6dbe3" },
                        ticks: {
                            maxTicksLimit: 5,
                            callback: valor => `${numeroGrafico(valor)}%`,
                            color: COR_TEXTO_GRAFICO,
                            font: FONTE_GRAFICO
                        }
                    }
                }
            },
            plugins: [pluginMarcadores]
        };

        graficoMemoria = new Chart(canvas, configuracao);
        // Série e eventos usados pelos callbacks, disponíveis para inspeção.
        graficoMemoria.configuracaoMemoria = { serie, eventos: eventosValidos, rotulo, passoMinutos };
        return graficoMemoria;
    }

    function inicializarGraficos() {
        if (typeof Chart === "undefined") {
            mostrarErro("Não foi possível carregar os gráficos. Recarregue a página.");
            return;
        }
        destruirGraficos();
        atualizarGraficoCpu([], "--");
        atualizarGraficoMemoria([], [], "--", null);
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

        // Uma única passagem prepara a distribuição de CPU e a série de RAM.
        const historico = ProcessosAgregacao.prepararHistorico(filtrados, periodoAtual);
        const rotulo = ROTULOS_PASSO[historico.passoMinutos] || `${historico.passoMinutos} min`;

        // Agrega antes de recortar para não perder o intervalo de referência.
        const limite = limiteDoPeriodo();

        const distribuicaoCpu = (historico.cpu.distribuicao || []).filter(
            bucket => limite == null || bucket.inicio >= limite
        );
        const bucketsComDados = distribuicaoCpu.filter(bucket => bucket.observadoMs > 0);
        const tempoObservado = bucketsComDados.reduce((soma, bucket) => soma + bucket.observadoMs, 0);
        const tempoElevado = bucketsComDados.reduce(
            (soma, bucket) => soma + Number(bucket.temposMs.acima75 || 0), 0
        );

        const pontosMemoria = (historico.memoria.pontos || []).filter(
            ponto => limite == null || (ponto.inicio != null && ponto.inicio >= limite)
        );
        const ultimaMemoria = [...pontosMemoria].reverse().find(ponto => ponto.v != null);

        // Eventos reais do serviço: reinícios detectados para o processo em foco.
        const processosEmLoop =
            (kpisDoDia && kpisDoDia.reiniciandoLoop && kpisDoDia.reiniciandoLoop.processos) || [];
        const eventosMemoria = processosEmLoop
            .filter(evento =>
                (evento.nome || "") === nomeProcesso && String(evento.pid) === String(pid))
            .map(evento => ({
                // O serviço devolve ISO; aceitar número mantém compatibilidade
                // com chamadas internas que já passam epoch.
                tempo: typeof evento.ultimoReinicio === "number"
                    ? evento.ultimoReinicio
                    : Date.parse(evento.ultimoReinicio),
                rotulo: evento.metodo === "create_time"
                    ? "Reinício do processo (CREATE_TIME)"
                    : "Reinício do processo (troca de PID)"
            }))
            .filter(evento =>
                Number.isFinite(evento.tempo) &&
                (limite == null || evento.tempo >= limite));

        definirTexto(cpuValor, bucketsComDados.length
            ? `Tempo observado: ${formatarDuracao(tempoObservado)}`
            : "sem dados no período");
        definirTexto(cpuCaption, bucketsComDados.length
            ? `Intervalos de ${rotulo} · ${bucketsComDados.length} com dados`
            : "--");
        definirTexto(cpuTempoElevado, bucketsComDados.length
            ? `Acima de 75%: ${formatarDuracao(tempoElevado)}`
            : "--");

        definirTexto(memoriaValor, ultimaMemoria ? formatarPercentual(ultimaMemoria.v) : "--");
        definirTexto(memoriaCaption, ultimaMemoria
            ? `Última leitura (${rotulo}): ${formatoBrasileiro(ultimaMemoria.t)}`
            : "sem dados no período");

        atualizarGraficoCpu(distribuicaoCpu, rotulo);
        atualizarGraficoMemoria(pontosMemoria, eventosMemoria, rotulo, historico.passoMinutos);
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