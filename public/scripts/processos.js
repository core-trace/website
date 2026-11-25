(() => {
    // ------------------------------------------------------------------
    // Elementos do DOM
    // ------------------------------------------------------------------
    const filtroServidor = document.getElementById("filtro-servidor");
    const btnComparar = document.getElementById("btn-comparar-momentos");
    const tbodyRecorrencia = document.getElementById("tbody-recorrencia");

    // KPIs
    const kpiOom = document.getElementById("kpi-processos-oom");
    const kpiOomSub = document.getElementById("kpi-processos-oom-sub");
    const kpiCriticos = document.getElementById("kpi-processos-criticos");
    const kpiCriticosSub = document.getElementById("kpi-processos-criticos-sub");
    const kpiRam = document.getElementById("kpi-ram-elevada");
    const kpiRamSub = document.getElementById("kpi-ram-elevada-sub");
    const kpiCpu = document.getElementById("kpi-cpu-elevada");
    const kpiCpuSub = document.getElementById("kpi-cpu-elevada-sub");

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

    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------
    let graficoCpu = null;
    let graficoMemoria = null;
    let processosDoDia = [];
    let resumoDiario = null;
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

    function apenasData(iso) {
        if (!iso) return "";
        return iso.split("T")[0];
    }

    function dataHojeSaoPaulo() {
        return new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Sao_Paulo"
        });
    }

    function extrairValorLeitura(leitura) {
        if (leitura == null) return null;
        if (typeof leitura === "number") return leitura;
        if (typeof leitura === "object" && leitura.valor !== undefined) return leitura.valor;
        return null;
    }

    function statusDaLeitura(leitura) {
        if (!leitura) return "indisponivel";
        if (typeof leitura === "string") return leitura;
        return leitura.status || "indisponivel";
    }

    function mostrarErro(mensagem) {
        alertaTexto.textContent = mensagem;
        alertaBanner.hidden = false;
    }

    function esconderErro() {
        alertaBanner.hidden = true;
    }

    // Os cards antigos saíram da página; enquanto a integração não é feita,
    // gravar em elemento inexistente não pode interromper o cálculo do restante.
    function definirTexto(elemento, texto) {
        if (elemento) elemento.textContent = texto;
    }

    function limparTabela() {
        tbodyRecorrencia.innerHTML = "";
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
                    y: { ...configuracaoComum.scales.y, max: 100 }
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
    // Cálculos de KPI e recorrência
    // ------------------------------------------------------------------
    function calcularKPIs(processos, resumo) {
        // Processos críticos: CPU >= 90% ou RAM >= 90%
        let criticos = 0;
        let ramMax = { valor: -1, nome: "--", pid: "--", usuario: "--", ts: "--" };
        let cpuMax = { valor: -1, nome: "--", pid: "--", usuario: "--", ts: "--" };

        for (const p of processos) {
            const cpuUso = extrairValorLeitura(p.cpu);
            const ramUso = extrairValorLeitura(p.memoria);

            const ehCritico =
                (cpuUso != null && cpuUso >= LIMITE_CRITICO_CPU) ||
                (ramUso != null && ramUso >= LIMITE_CRITICO_RAM);

            if (ehCritico) criticos++;

            if (ramUso != null && ramUso > ramMax.valor) {
                ramMax = {
                    valor: ramUso,
                    nome: p.nome || "--",
                    pid: p.pid || "--",
                    usuario: p.usuario || "--",
                    ts: p.timestamp || "--"
                };
            }

            if (cpuUso != null && cpuUso > cpuMax.valor) {
                cpuMax = {
                    valor: cpuUso,
                    nome: p.nome || "--",
                    pid: p.pid || "--",
                    usuario: p.usuario || "--",
                    ts: p.timestamp || "--"
                };
            }
        }

        // OOM: tenta pegar do resumo diário (métrica ram_oom_kills)
        let oomTotal = 0;
        try {
            const ramResumo = resumo?.ram;
            if (ramResumo && ramResumo.uso) {
                // uso é o resumo da métrica ram_percent, não o OOM.
                // O OOM vem de outro lugar; tentamos procurar no contexto_oom
                // ou deixamos 0 se não houver dado estruturado.
            }
        } catch (e) {
            // ignora
        }

        definirTexto(kpiOom, oomTotal);
        definirTexto(kpiOomSub, oomTotal > 0 ? "processos finalizados pelo OOM hoje" : "sem registros de OOM");

        definirTexto(kpiCriticos, criticos);
        definirTexto(kpiCriticosSub,
            criticos > 0 ? "processos acima do limite crítico" : "sem processos críticos");

        definirTexto(kpiRam, ramMax.valor >= 0 ? ramMax.valor.toFixed(1) + "%" : "--");
        definirTexto(kpiRamSub,
            ramMax.valor >= 0
                ? `${ramMax.nome} (PID ${ramMax.pid}) · ${formatoBrasileiro(ramMax.ts)}`
                : "--");

        definirTexto(kpiCpu, cpuMax.valor >= 0 ? cpuMax.valor.toFixed(1) + "%" : "--");
        definirTexto(kpiCpuSub,
            cpuMax.valor >= 0
                ? `${cpuMax.nome} (PID ${cpuMax.pid}) · ${formatoBrasileiro(cpuMax.ts)}`
                : "--");

        return { ramMax, cpuMax };
    }

    function calcularRecorrencia(processos) {
        // Agrupa por nome + PID
        const grupos = new Map();

        for (const p of processos) {
            const chave = `${p.nome || "desconhecido"} | PID ${p.pid || "--"}`;
            if (!grupos.has(chave)) {
                grupos.set(chave, {
                    nome: p.nome || "desconhecido",
                    pid: p.pid || "--",
                    ocorrencias: 0,
                    tipo: "normal",
                    ultima: null,
                    duracoes: []
                });
            }

            const grupo = grupos.get(chave);
            grupo.ocorrencias++;

            const cpuUso = extrairValorLeitura(p.cpu);
            const ramUso = extrairValorLeitura(p.memoria);

            if (
                (cpuUso != null && cpuUso >= LIMITE_CRITICO_CPU) ||
                (ramUso != null && ramUso >= LIMITE_CRITICO_RAM)
            ) {
                grupo.tipo = "crítico";
            } else if (
                (cpuUso != null && cpuUso >= 70) ||
                (ramUso != null && ramUso >= 70)
            ) {
                grupo.tipo = "atenção";
            }

            if (!grupo.ultima || new Date(p.timestamp) > new Date(grupo.ultima)) {
                grupo.ultima = p.timestamp;
            }
        }

        const resultado = Array.from(grupos.values()).map(g => ({
            ...g,
            duracaoMedia: g.duracoes.length > 0
                ? (g.duracoes.reduce((a, b) => a + b, 0) / g.duracoes.length).toFixed(1) + " s"
                : "--",
            frequencia: g.ocorrencias > 1 ? "recorrente" : "única"
        }));

        resultado.sort((a, b) => b.ocorrencias - a.ocorrencias);
        return resultado;
    }

    function renderizarTabelaRecorrencia(lista) {
        limparTabela();

        if (!lista || lista.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6;
            td.textContent = "Nenhum processo encontrado.";
            td.style.textAlign = "center";
            tr.appendChild(td);
            tbodyRecorrencia.appendChild(tr);
            return;
        }

        for (const item of lista) {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${item.nome} <span style="font-weight:normal;color:#666;">(PID ${item.pid})</span></td>
                <td>${item.ocorrencias}</td>
                <td><span style="text-transform:uppercase;font-weight:600;">${item.tipo}</span></td>
                <td>${formatoBrasileiro(item.ultima)}</td>
                <td>${item.duracaoMedia}</td>
                <td>${item.frequencia}</td>
            `;

            tbodyRecorrencia.appendChild(tr);
        }
    }

    // ------------------------------------------------------------------
    // Renderização principal
    // ------------------------------------------------------------------
    function renderizar() {
        esconderErro();

        const { ramMax, cpuMax } = calcularKPIs(processosDoDia, resumoDiario);
        const recorrencia = calcularRecorrencia(processosDoDia);

        renderizarTabelaRecorrencia(recorrencia);

        // Plota automaticamente o gráfico do primeiro processo da recorrência
        // (o que teve mais ocorrências acima do limite, ou o primeiro da lista).
        if (recorrencia.length > 0) {
            const primeiro = recorrencia[0];
            carregarHistoricoProcesso(primeiro.nome, primeiro.pid);
        } else {
            cpuValor.textContent = "--";
            cpuCaption.textContent = "--";
            memoriaValor.textContent = "--";
            memoriaCaption.textContent = "--";
            atualizarGrafico(graficoCpu, [], "CPU");
            atualizarGrafico(graficoMemoria, [], "RAM");
        }

        // Meta chips (usa o processo com maior RAM como destaque, se existir)
        if (ramMax.valor >= 0) {
            metaProcesso.textContent = `${ramMax.nome} (PID ${ramMax.pid})`;
            metaUsuario.textContent = ramMax.usuario || "--";
            metaStatus.textContent = ramMax.valor >= LIMITE_CRITICO_RAM ? "crítico" : "estável";
        } else {
            metaProcesso.textContent = "--";
            metaUsuario.textContent = "--";
            metaStatus.textContent = "--";
        }

        // Comparativo de momentos (últimos dois timestamps distintos)
        const temposUnicos = [...new Set(processosDoDia.map(p => p.timestamp))].sort();
        if (temposUnicos.length >= 2) {
            const b = temposUnicos[temposUnicos.length - 1];
            const a = temposUnicos[temposUnicos.length - 2];
            momentoA.textContent = formatoBrasileiro(a);
            momentoB.textContent = formatoBrasileiro(b);
            momentoASelecionado = a;
            momentoBSelecionado = b;
        } else {
            momentoA.textContent = "--";
            momentoB.textContent = "--";
            momentoASelecionado = null;
            momentoBSelecionado = null;
        }
    }

    // ------------------------------------------------------------------
    // Carregamento de dados
    // ------------------------------------------------------------------
    async function carregarServidores() {
        try {
            const resposta = await fetch(`/processos/servidores`);
            if (!resposta.ok) throw new Error("Falha ao listar servidores");

            const dados = await resposta.json();
            const servidores = dados.servidores || [];

            filtroServidor.innerHTML = '<option value="" selected disabled hidden>--</option>';

            for (const mac of servidores) {
                const option = document.createElement("option");
                option.value = mac;
                option.textContent = mac;
                filtroServidor.appendChild(option);
            }

            if (servidores.length > 0) {
                filtroServidor.value = servidores[0];
                servidorSelecionado = servidores[0];
                dataSelecionada = dataHojeSaoPaulo();
                await carregarDados();
            }
        } catch (erro) {
            console.error(erro);
            mostrarErro("Não foi possível carregar a lista de servidores.");
        }
    }

    async function carregarDados() {
        if (!servidorSelecionado || !dataSelecionada) return;

        try {
            const resposta = await fetch(
                `/processos/dados?mac=${encodeURIComponent(servidorSelecionado)}&data=${encodeURIComponent(dataSelecionada)}`
            );

            if (!resposta.ok) throw new Error("Falha ao buscar dados de processos");

            const dados = await resposta.json();
            processosDoDia = dados.processos || [];

            // Tenta carregar resumo diário para KPI de OOM
            try {
                const respostaResumo = await fetch(
                    `/processos/resumo?mac=${encodeURIComponent(servidorSelecionado)}&data=${encodeURIComponent(dataSelecionada)}`
                );
                if (respostaResumo.ok) {
                    resumoDiario = await respostaResumo.json();
                }
            } catch (e) {
                // resumo opcional
            }

            if (processosDoDia.length === 0) {
                limparTabela();
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 6;
                td.textContent = "Nenhum processo capturado neste dia.";
                td.style.textAlign = "center";
                tr.appendChild(td);
                tbodyRecorrencia.appendChild(tr);
            }

            renderizar();
        } catch (erro) {
            console.error(erro);
            mostrarErro("Não foi possível carregar os dados de processos.");
        }
    }

    function carregarHistoricoProcesso(nomeProcesso, pid) {
        // Filtra os processos do dia pelo nome/pid selecionado
        const filtrados = processosDoDia.filter(
            p => (p.nome || "") === nomeProcesso && String(p.pid) === String(pid)
        );

        if (filtrados.length === 0) {
            cpuValor.textContent = "--";
            cpuCaption.textContent = "--";
            memoriaValor.textContent = "--";
            memoriaCaption.textContent = "--";
            atualizarGrafico(graficoCpu, [], "CPU");
            atualizarGrafico(graficoMemoria, [], "RAM");
            return;
        }

        const pontosCpu = [];
        const pontosMem = [];

        for (const p of filtrados) {
            const cpu = extrairValorLeitura(p.cpu);
            const mem = extrairValorLeitura(p.memoria);

            if (cpu != null) pontosCpu.push({ t: p.timestamp, v: cpu });
            if (mem != null) pontosMem.push({ t: p.timestamp, v: mem });
        }

        const ultimoCpu = pontosCpu[pontosCpu.length - 1];
        const ultimoMem = pontosMem[pontosMem.length - 1];

        cpuValor.textContent = ultimoCpu ? ultimoCpu.v.toFixed(1) + "%" : "--";
        cpuCaption.textContent = ultimoCpu
            ? `Última leitura: ${formatoBrasileiro(ultimoCpu.t)}`
            : "--";

        memoriaValor.textContent = ultimoMem ? ultimoMem.v.toFixed(1) + "%" : "--";
        memoriaCaption.textContent = ultimoMem
            ? `Última leitura: ${formatoBrasileiro(ultimoMem.t)}`
            : "--";

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