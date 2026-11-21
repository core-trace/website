(() => {
    const empresa = sessionStorage.getItem("ID_EMPRESA");
    const usuario = sessionStorage.getItem("ID_USUARIO");

    if (!empresa || !usuario) {
        console.warn("Usuário não autenticado (ID_EMPRESA/ID_USUARIO ausentes no sessionStorage).");
        return;
    }

    const state = {
        mac: null,
        inicio: null,
        fim: null,
        pid: null,
        processoNome: null,
        pagina: 1,
        porPagina: 10,
        limites: null,
        charts: { cpu: null, rss: null }
    };

    const $ = (id) => document.getElementById(id);

    function qs(params) {
        const p = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== "") p.set(k, v);
        });
        return p.toString();
    }

    async function api(path, params = {}) {
        const url = `/processos/${path}?${qs({ empresa, usuario, mac: state.mac, inicio: state.inicio, fim: state.fim, ...params })}`;
        const resp = await fetch(url);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.mensagem || `Erro ao carregar ${path}`);
        return data;
    }

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value ?? "--";
    }

    function fmtNum(v, digits = 0) {
        if (v == null || !Number.isFinite(Number(v))) return "--";
        return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function fmtPercent(v) {
        if (v == null || !Number.isFinite(Number(v))) return "--";
        return `${fmtNum(v, 0)}%`;
    }

    function fmtGb(v) {
        if (v == null || !Number.isFinite(Number(v))) return "--";
        return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GB`;
    }

    function fmtHoraLabel(ts) {
        if (!ts) return "--";
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return String(ts);
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }

    function fmtDataHora(ts) {
        if (!ts) return "--";
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return String(ts);
        return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function badgeStatus(status) {
        return status || "Normal";
    }

    function preencherSelect(select, itens, getValue, getLabel, placeholder = "--") {
        if (!select) return;
        select.innerHTML = "";
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = placeholder;
        opt0.disabled = true;
        opt0.selected = true;
        select.appendChild(opt0);
        (itens || []).forEach((item) => {
            const opt = document.createElement("option");
            opt.value = getValue(item);
            opt.textContent = getLabel(item);
            select.appendChild(opt);
        });
        select.disabled = !itens || itens.length === 0;
    }

    function periodoParaIntervalo(id) {
        const fim = new Date();
        const inicio = new Date(fim);
        const horas = { "ultima-hora": 1, "ultimas-6h": 6, "ultimas-24h": 24 }[id] || 1;
        inicio.setHours(inicio.getHours() - horas);
        return { inicio: inicio.toISOString(), fim: fim.toISOString() };
    }

    function atualizarIntervaloUI() {
        const el = $("filtro-intervalo");
        if (!el) return;
        if (!state.inicio || !state.fim) { el.textContent = "--"; return; }
        el.textContent = `${fmtDataHora(state.inicio)} – ${fmtDataHora(state.fim)}`;
        setText("processos-atualizado", `Atualizado: ${fmtDataHora(state.fim)}`);
    }

    async function carregarServidores() {
        try {
            const dados = await api("servidores");
            const sel = $("filtro-servidor");
            if (!sel) return;
            sel.innerHTML = '<option value="" selected disabled hidden>--</option>';
            (dados.servidores || []).forEach((s) => {
                const opt = document.createElement("option");
                opt.value = s.mac;
                opt.textContent = `${s.nome || s.mac} (${s.mac})`;
                sel.appendChild(opt);
            });
            sel.disabled = !(dados.servidores && dados.servidores.length > 0);
            if (dados.servidores && dados.servidores.length > 0) {
                state.mac = dados.servidores[0].mac;
                sel.value = state.mac;
            } else {
                state.mac = null;
            }
        } catch (e) {
            console.error("Erro ao carregar servidores:", e);
        }
    }

    async function carregarContexto() {
        if (!state.mac) {
            const selPeriodo = $("filtro-periodo");
            if (selPeriodo) {
                selPeriodo.innerHTML = '<option value="" selected disabled hidden>--</option>';
                selPeriodo.disabled = true;
            }
            setText("processos-atualizado", "--");
            const elIntervalo = $("filtro-intervalo");
            if (elIntervalo) elIntervalo.textContent = "--";
            state.limites = state.limites || { cpu: { atencao: 60, critico: 80 }, rssGb: { atencao: 2, critico: 2.5 } };
            return;
        }

        const data = await api("contexto").catch(async () => {
            return { periodos: [], limites: null };
        });

        state.limites = data.limites || state.limites;

        const selPeriodo = $("filtro-periodo");
        preencherSelect(selPeriodo, data.periodos || [], (p) => p.id, (p) => p.label || p.id);

        if (!state.inicio || !state.fim) {
            const periodoId = (data.periodos && data.periodos[0] && data.periodos[0].id) || "ultima-hora";
            const intervalo = periodoParaIntervalo(periodoId);
            state.inicio = intervalo.inicio;
            state.fim = intervalo.fim;
            if (selPeriodo) selPeriodo.value = periodoId;
        }
        atualizarIntervaloUI();
        return data;
    }

    function aplicarKpis(data) {
        const mapa = {
            "processos-oom": ["kpi-processos-oom", "kpi-processos-oom-sub"],
            "processos-criticos": ["kpi-processos-criticos", "kpi-processos-criticos-sub"],
            "cpu-elevada": ["kpi-cpu-elevada", "kpi-cpu-elevada-sub"],
            "ram-elevada": ["kpi-ram-elevada", "kpi-ram-elevada-sub"]
        };
        (data.kpis || []).forEach((k) => {
            const ids = mapa[k.id];
            if (!ids) return;
            setText(ids[0], fmtNum(k.valor));
            setText(ids[1], k.subtitulo || "--");
        });
    }

    function criarCanvas(containerId) {
        const container = $(containerId);
        if (!container) return null;
        container.innerHTML = "";
        const canvas = document.createElement("canvas");
        container.appendChild(canvas);
        return canvas.getContext("2d");
    }

    function renderGrafico(tipo, dadosSerie, limites, unidadeLabel) {
        const key = tipo === "cpu" ? "cpu" : "rss";
        const containerId = tipo === "cpu" ? "grafico-cpu-area" : "grafico-memoria-area";
        const ctx = criarCanvas(containerId);
        if (!ctx || typeof Chart === "undefined") return;

        if (state.charts[key]) {
            state.charts[key].destroy();
            state.charts[key] = null;
        }

        const pontos = (dadosSerie.pontos || []).filter((p) => p && p.v != null);
        const labels = pontos.map((p) => fmtHoraLabel(p.t));
        const valores = pontos.map((p) => p.v);
        const cor = tipo === "cpu" ? "#e35d6a" : "#4a90e2";
        const limAt = limites && limites.atencao != null ? limites.atencao : null;
        const limCr = limites && limites.critico != null ? limites.critico : null;

        const datasets = [
            {
                label: unidadeLabel,
                data: valores,
                borderColor: cor,
                backgroundColor: "transparent",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.25
            }
        ];
        if (limAt != null) {
            datasets.push({
                label: "Atenção",
                data: valores.map(() => limAt),
                borderColor: "#f0ad4e",
                borderDash: [6, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false
            });
        }
        if (limCr != null) {
            datasets.push({
                label: "Crítico",
                data: valores.map(() => limCr),
                borderColor: "#d9534f",
                borderDash: [6, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false
            });
        }

        state.charts[key] = new Chart(ctx, {
            type: "line",
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { maxTicksLimit: 6 } },
                    y: { beginAtZero: true, suggestedMax: tipo === "cpu" ? 100 : undefined }
                }
            }
        });

        if (tipo === "cpu") {
            setText("grafico-cpu-valor", fmtPercent(dadosSerie.atual));
            const pico = dadosSerie.pico;
            setText("grafico-cpu-caption", pico ? `Pico: ${fmtPercent(pico.v)} em ${fmtHoraLabel(pico.t)}` : "--");
        } else {
            setText("grafico-memoria-valor", fmtGb(dadosSerie.atual));
            const pico = dadosSerie.pico;
            setText("grafico-memoria-caption", pico ? `Pico: ${fmtGb(pico.v)} em ${fmtHoraLabel(pico.t)}` : "--");
        }
    }

    function aplicarSerieTemporal(data) {
        if (!data || !data.processo) {
            setText("meta-processo", "--");
            setText("meta-usuario", "--");
            setText("meta-status", "--");
            return;
        }
        setText("meta-processo", `${data.processo} · PID ${data.pid}`);
        setText("meta-usuario", data.usuario ? `Usuário: ${data.usuario}` : "--");
        setText("meta-status", data.statusAtual ? `Status: ${data.statusAtual}` : "--");

        const alerta = $("alerta-banner");
        if (data.primeiroDesvio) {
            if (alerta) alerta.hidden = false;
            setText("alerta-texto", `Primeiro desvio identificado em ${fmtHoraLabel(data.primeiroDesvio)} (janela analisada).`);
        } else {
            if (alerta) alerta.hidden = true;
        }

        renderGrafico("cpu", data.cpu || {}, (data.cpu && data.cpu.limites) || (state.limites && state.limites.cpu), "CPU (%)");
        renderGrafico("rss", data.rss || {}, (data.rss && data.rss.limites) || (state.limites && state.limites.rssGb), "Memória (GB)");

        const comp = data.comparativo || {};
        setText("momento-a", comp.cpu ? `CPU: ${comp.cpu}` : "--");
        setText("momento-b", comp.rss ? `RSS: ${comp.rss}` : "--");
    }

    function aplicarVariacao(data) {
        const tbody = $("tbody-variacao");
        if (!tbody) return;
        tbody.innerHTML = "";
        (data.processos || []).forEach((p) => {
            const tr = document.createElement("tr");
            const deltaCpu = p.deltaCpu == null ? "--" : `${p.deltaCpu >= 0 ? "+" : ""}${fmtNum(p.deltaCpu, 0)} p.p.`;
            const deltaRss = p.deltaRssGb == null ? "--" : `${p.deltaRssGb >= 0 ? "+" : ""}${fmtNum(p.deltaRssGb, 2)} GB`;
            tr.innerHTML = `
                <td>${p.processo || "--"}</td>
                <td>${p.pid ?? "--"}</td>
                <td>${fmtPercent(p.cpuAntes)}</td>
                <td>${fmtPercent(p.cpuAtual)}</td>
                <td>${deltaCpu}</td>
                <td>${fmtGb(p.rssAntesGb)}</td>
                <td>${fmtGb(p.rssAtualGb)}</td>
                <td>${deltaRss}</td>
                <td>${badgeStatus(p.status)}</td>`;
            tbody.appendChild(tr);
        });
    }

    function aplicarEventos(data) {
        const lista = $("eventos-lista");
        const vazio = $("eventos-vazio");
        if (!lista) return;
        lista.innerHTML = "";

        const janela = data.janelaInvestigacao;
        setText("janela-intervalo", janela ? (janela.label || `${janela.inicio}–${janela.fim}`) : "--");

        const eventos = data.eventos || [];
        if (vazio) vazio.hidden = eventos.length > 0;

        eventos.forEach((e) => {
            const item = document.createElement("div");
            item.className = "evento-item";
            item.setAttribute("role", "listitem");
            item.innerHTML = `
                <div class="evento-hora">${e.horario || "--"}</div>
                <div class="evento-corpo">
                    <div class="evento-titulo">${e.titulo || "--"} — ${e.processo || ""} (PID ${e.pid ?? "--"})</div>
                    <div class="evento-descricao">${e.descricao || ""}</div>
                </div>
                <div class="evento-severidade">${e.severidade || ""}</div>`;
            lista.appendChild(item);
        });
    }

    function aplicarTodos(data) {
        const tbody = $("tbody-todos");
        if (!tbody) return;
        tbody.innerHTML = "";
        (data.itens || []).forEach((p) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${p.nome || "--"}</td>
                <td>${p.pid ?? "--"}</td>
                <td>${p.usuario || "--"}</td>
                <td>${fmtPercent(p.cpu)}</td>
                <td>${fmtGb(p.memoriaRssGb)}</td>
                <td>${p.threads ?? "--"}</td>
                <td>${badgeStatus(p.status)}</td>
                <td>${p.criacao ? fmtDataHora(p.criacao) : "--"}</td>`;
            tr.addEventListener("click", () => {
                state.pid = p.pid;
                state.processoNome = p.nome;
                carregarSerieTemporal().catch(console.error);
            });
            tbody.appendChild(tr);
        });

        const total = data.total || 0;
        const pagina = data.pagina || state.pagina;
        const porPagina = data.porPagina || state.porPagina;
        const ini = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
        const fim = Math.min(pagina * porPagina, total);
        setText("paginacao-info", `Exibindo ${ini}–${fim} de ${total} processos`);
    }

    function aplicarRecorrencia(data) {
        const tbody = $("tbody-recorrencia");
        if (!tbody) return;
        tbody.innerHTML = "";
        (data.itens || []).forEach((r) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${r.processo || "--"} / PID ${r.pid ?? "--"}</td>
                <td>${r.ocorrencias ?? "--"}</td>
                <td>${r.tipo || "--"}</td>
                <td>${r.ultimaOcorrencia || "--"}</td>
                <td>${r.duracaoMedia || "--"}</td>
                <td>${r.frequencia ?? "--"}</td>`;
            tbody.appendChild(tr);
        });
    }

    async function carregarKpis() { aplicarKpis(await api("kpis")); }
    async function carregarSerieTemporal() {
        const params = {};
        if (state.pid != null) params.pid = state.pid;
        if (state.processoNome) params.processo = state.processoNome;
        aplicarSerieTemporal(await api("serie-temporal", params));
    }
    async function carregarVariacao() { aplicarVariacao(await api("variacao")); }
    async function carregarEventos() { aplicarEventos(await api("eventos")); }
    async function carregarTodos() { aplicarTodos(await api("todos", { pagina: state.pagina, porPagina: state.porPagina })); }
    async function carregarRecorrencia() { aplicarRecorrencia(await api("recorrencia")); }

    async function carregarTudo() {
        if (!state.mac) return;
        try {
            await Promise.all([
                carregarKpis(),
                carregarSerieTemporal(),
                carregarVariacao(),
                carregarEventos(),
                carregarTodos(),
                carregarRecorrencia()
            ]);
        } catch (e) {
            console.error("Erro ao carregar dashboard de processos:", e);
        }
    }

    function bindEventos() {
        const selServidor = $("filtro-servidor");
        if (selServidor) {
            selServidor.addEventListener("change", () => {
                state.mac = selServidor.value || null;
                state.pid = null;
                state.processoNome = null;
                carregarContexto().then(carregarTudo).catch(console.error);
            });
        }

        const selPeriodo = $("filtro-periodo");
        if (selPeriodo) {
            selPeriodo.addEventListener("change", () => {
                if (!selPeriodo.value) return;
                const intervalo = periodoParaIntervalo(selPeriodo.value);
                state.inicio = intervalo.inicio;
                state.fim = intervalo.fim;
                atualizarIntervaloUI();
                carregarTudo();
            });
        }

        const busca = $("busca-todos-processos");
        if (busca) {
            busca.addEventListener("input", () => {
                clearTimeout(window._debounceTodos);
                window._debounceTodos = setTimeout(() => {
                    state.pagina = 1;
                    api("todos", {
                        pagina: 1,
                        porPagina: state.porPagina,
                        busca: busca.value
                    })
                        .then(aplicarTodos)
                        .catch(console.error);
                }, 300);
            });
        }
    }

    async function init() {
        try {
            bindEventos();
            await carregarServidores();
            await carregarContexto();
            await carregarTudo();
        } catch (e) {
            console.error("Falha ao inicializar dashboard de processos:", e);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();