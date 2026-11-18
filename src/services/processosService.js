const fs = require("fs/promises");
const path = require("path");
const servidorModel = require("../models/servidorModel");

const LIMIARES_PADRAO = {
    cpu: { atencao: 60, critico: 80 },
    rssGb: { atencao: 2.0, critico: 2.5 }
};

function getClientDir() {
    const dir = process.env.GOLD_CLIENT_DIR;
    if (!dir) {
        throw new Error("GOLD_CLIENT_DIR não configurado.");
    }
    return dir;
}

function extrairValor(medida) {
    if (!medida || typeof medida !== "object") return null;
    if (medida.valor !== undefined) return medida.valor;
    if (medida.ultimo_valor !== undefined) return medida.ultimo_valor;
    if (medida.media !== undefined) return medida.media;
    return null;
}

function toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function normalizarAmostraProcesso(registro) {
    const cpu = toNumber(extrairValor(registro.cpu && registro.cpu.uso));
    const memoriaPercent = toNumber(
        extrairValor(
            registro.memoria && (registro.memoria.uso_percentual || registro.memoria.uso)
        )
    );
    const rssBytes = toNumber(extrairValor(registro.memoria && registro.memoria.rss));
    const threads = toNumber(extrairValor(registro.threads && registro.threads.quantidade));
    const rssGb = rssBytes != null ? rssBytes / (1024 ** 3) : null;

    return {
        timestamp: registro.timestamp,
        pid: toNumber(registro.pid),
        nome: registro.nome || null,
        usuario: registro.usuario || null,
        cpu,
        memoriaPercent,
        rssBytes,
        rssGb,
        threads: threads != null ? threads : toNumber(registro.num_threads),
        createTime: registro.create_time || registro.createTime || null,
        statusProcesso: registro.status_processo || registro.status || null
    };
}

function classificar(cpu, rssGb, limites = LIMIARES_PADRAO) {
    const limitesCpu = limites.cpu || LIMIARES_PADRAO.cpu;
    const limitesRss = limites.rssGb || LIMIARES_PADRAO.rssGb;

    const cpuCritico = cpu != null && limitesCpu.critico != null && cpu >= limitesCpu.critico;
    const rssCritico = rssGb != null && limitesRss.critico != null && rssGb >= limitesRss.critico;
    if (cpuCritico || rssCritico) return "Crítico";

    const cpuAtencao = cpu != null && limitesCpu.atencao != null && cpu >= limitesCpu.atencao;
    const rssAtencao = rssGb != null && limitesRss.atencao != null && rssGb >= limitesRss.atencao;
    if (cpuAtencao || rssAtencao) return "Atenção";

    return "Normal";
}

function formatarDeltaCpu(a, b) {
    if (a == null || b == null) return null;
    const delta = b - a;
    const sinal = delta >= 0 ? "+" : "";
    return `${a.toFixed(0)}% → ${b.toFixed(0)}% (${sinal}${delta.toFixed(0)} p.p.)`;
}

function formatarDeltaRss(a, b) {
    if (a == null || b == null) return null;
    const delta = b - a;
    const sinal = delta >= 0 ? "+" : "";
    const fmt = (v) => v.toFixed(2).replace(".", ",");
    return `${fmt(a)} → ${fmt(b)} GB (${sinal}${fmt(delta)} GB)`;
}

function chaveProcesso(p) {
    return `${p.pid}|${p.nome}`;
}

function extrairLimite(componentes, colunasPossiveis) {
    const componente = (componentes || []).find((c) =>
        colunasPossiveis.includes(String(c.coluna || "").toLowerCase())
    );
    if (!componente) return null;

    const atencao = componente.atencao != null ? Number(componente.atencao) : null;
    const critico = componente.critico != null ? Number(componente.critico) : null;
    if (atencao == null || critico == null) return null;

    return {
        atencao,
        critico,
        operador: componente.operador || ">=",
        operador2: componente.operador2 || null,
        atencao2: componente.atencao2 != null ? Number(componente.atencao2) : null,
        critico2: componente.critico2 != null ? Number(componente.critico2) : null,
        unidade: componente.unidade || null
    };
}

async function resolverLimites(filtros) {
    const mac = String(filtros.mac || filtros.servidor || "").trim().toUpperCase();
    const empresa = Number(filtros.empresa);
    const usuario = Number(filtros.usuario);

    if (!mac || !Number.isSafeInteger(empresa) || !Number.isSafeInteger(usuario)) {
        return { ...LIMIARES_PADRAO };
    }

    const servidores = await servidorModel.listarServidoresPorEmpresa(empresa, usuario);
    const servidor = servidores.find(
        (s) => String(s.endereco_mac || "").trim().toUpperCase() === mac
    );

    if (!servidor) {
        throw new Error("Servidor não encontrado ou sem acesso.");
    }

    const componentes = servidor.componentes || [];
    const cpu = extrairLimite(componentes, ["cpu_percent", "process_cpu_percent"]) || LIMIARES_PADRAO.cpu;
    const rssGb = extrairLimite(componentes, ["process_rss", "ram_used", "ram_percent"]) || LIMIARES_PADRAO.rssGb;

    return { cpu, rssGb };
}

async function listarLotes(mac, dataInicio, dataFim) {
    const base = path.join(getClientDir(), "lotes", `maquina=${mac}`);
    let datas;
    try {
        datas = await fs.readdir(base);
    } catch (erro) {
        if (erro.code === "ENOENT") return [];
        throw erro;
    }

    const inicio = dataInicio ? String(dataInicio).slice(0, 10) : null;
    const fim = dataFim ? String(dataFim).slice(0, 10) : null;
    const lotes = [];

    for (const entrada of datas) {
        if (!entrada.startsWith("data=")) continue;
        const data = entrada.slice("data=".length);
        if (inicio && data < inicio) continue;
        if (fim && data > fim) continue;

        const dirData = path.join(base, entrada);
        let pastasLote;
        try {
            pastasLote = await fs.readdir(dirData);
        } catch (erro) {
            if (erro.code === "ENOENT") continue;
            throw erro;
        }

        for (const pastaLote of pastasLote) {
            if (!pastaLote.startsWith("lote=")) continue;
            const arquivo = path.join(dirData, pastaLote, "capturas.json");
            try {
                await fs.access(arquivo);
                lotes.push(arquivo);
            } catch (_) {
                // lote sem capturas.json, ignora
            }
        }
    }
    return lotes;
}

async function lerJson(arquivo) {
    const conteudo = await fs.readFile(arquivo, "utf-8");
    return JSON.parse(conteudo);
}

async function carregarAmostras(filtros) {
    const mac = String(filtros.mac || filtros.servidor || "").trim().toUpperCase();
    if (!mac) throw new Error("Informe o servidor (mac).");

    const dataInicio = filtros.inicio || filtros.dataInicio || null;
    const dataFim = filtros.fim || filtros.dataFim || null;
    const arquivos = await listarLotes(mac, dataInicio, dataFim);
    const amostras = [];

    for (const arquivo of arquivos) {
        const lote = await lerJson(arquivo);
        const processos = Array.isArray(lote.processos) ? lote.processos : [];
        for (const registro of processos) {
            const amostra = normalizarAmostraProcesso(registro);
            if (dataInicio && amostra.timestamp < dataInicio) continue;
            if (dataFim && amostra.timestamp > dataFim) continue;
            amostras.push(amostra);
        }
    }

    amostras.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    return amostras;
}

function ultimaPorProcesso(amostras) {
    const mapa = new Map();
    for (const a of amostras) {
        mapa.set(chaveProcesso(a), a);
    }
    return Array.from(mapa.values());
}

function primeiraUltimaPorProcesso(amostras) {
    const mapa = new Map();
    for (const a of amostras) {
        const chave = chaveProcesso(a);
        if (!mapa.has(chave)) {
            mapa.set(chave, { primeira: a, ultima: a });
        } else {
            mapa.get(chave).ultima = a;
        }
    }
    return mapa;
}

function pico(pontos) {
    let melhor = null;
    for (const p of pontos) {
        if (p.v == null) continue;
        if (!melhor || p.v > melhor.v) melhor = p;
    }
    return melhor;
}

function parseTs(ts) {
    const d = new Date(ts);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
}

function fmtHora(ts) {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return String(ts || "");
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtHoraMin(ts) {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return String(ts || "");
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuracao(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
    const totalSeg = Math.round(ms / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    if (min > 0) return `${min} min ${seg} s`;
    return `${seg} s`;
}

function estadoCpu(cpu, limites) {
    const l = (limites && limites.cpu) || LIMIARES_PADRAO.cpu;
    if (cpu == null) return "Normal";
    if (l.critico != null && cpu >= l.critico) return "Crítico";
    if (l.atencao != null && cpu >= l.atencao) return "Atenção";
    return "Normal";
}

function estadoRss(rssGb, limites) {
    const l = (limites && limites.rssGb) || LIMIARES_PADRAO.rssGb;
    if (rssGb == null) return "Normal";
    if (l.critico != null && rssGb >= l.critico) return "Crítico";
    if (l.atencao != null && rssGb >= l.atencao) return "Atenção";
    return "Normal";
}

function agruparSeriesPorProcesso(amostras) {
    const mapa = new Map();
    for (const a of amostras) {
        const chave = chaveProcesso(a);
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(a);
    }
    for (const serie of mapa.values()) {
        serie.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    }
    return mapa;
}

function estimarIntervaloMs(series) {
    for (const serie of series.values()) {
        for (let i = 1; i < serie.length; i++) {
            const diff = parseTs(serie[i].timestamp) - parseTs(serie[i - 1].timestamp);
            if (Number.isFinite(diff) && diff > 0) return diff;
        }
    }
    return 60000; // fallback 60s
}

function frequenciaNivel(ocorrencias) {
    if (ocorrencias <= 1) return 1;
    if (ocorrencias === 2) return 2;
    if (ocorrencias <= 4) return 3;
    if (ocorrencias <= 7) return 4;
    return 5;
}

function severidadeRank(s) {
    if (s === "Crítico") return 2;
    if (s === "Atenção") return 1;
    return 0;
}

function analisarProcessos(amostras, limites, filtros) {
    const series = agruparSeriesPorProcesso(amostras);
    const eventos = [];
    const incidentes = []; // { processo, pid, tipo, inicioMs, fimMs|null, ultimaMs }

    const fimJanelaMs = parseTs(filtros.fim) || parseTs(filtros.dataFim);
    const intervaloMs = estimarIntervaloMs(series);

    for (const serie of series.values()) {
        if (serie.length === 0) continue;
        const proc = serie[0];
        const nome = proc.nome;
        const pid = proc.pid;

        let cpuAnt = "Normal";
        let rssAnt = "Normal";
        let primeiroLimite = false;

        const aberto = {
            cpu: null, // { inicioMs, ultimaMs }
            rss: null
        };

        function abrirIncidente(tipo, tsMs) {
            if (!aberto[tipo]) aberto[tipo] = { inicioMs: tsMs, ultimaMs: tsMs };
            else aberto[tipo].ultimaMs = tsMs;
        }

        function fecharIncidente(tipo, tsFimMs) {
            if (aberto[tipo]) {
                incidentes.push({
                    processo: nome,
                    pid,
                    tipo: tipo === "cpu" ? "CPU elevada" : "Memória elevada",
                    inicioMs: aberto[tipo].inicioMs,
                    fimMs: tsFimMs,
                    ultimaMs: tsFimMs
                });
                aberto[tipo] = null;
            }
        }

        function atualizarIncidente(tipo, estadoAtual, tsMs) {
            if (estadoAtual === "Normal") {
                fecharIncidente(tipo, tsMs);
            } else {
                abrirIncidente(tipo, tsMs);
            }
        }

        for (let i = 0; i < serie.length; i++) {
            const s = serie[i];
            const ts = s.timestamp;
            const tsMs = parseTs(ts);
            const cpuEstado = estadoCpu(s.cpu, limites);
            const rssEstado = estadoRss(s.rssGb, limites);
            const geral = classificar(s.cpu, s.rssGb, limites);

            if (i === 0) {
                eventos.push({
                    horario: fmtHora(ts),
                    timestamp: ts,
                    processo: nome,
                    pid,
                    titulo: "Processo iniciado",
                    descricao: "Processo observado na janela de análise.",
                    severidade: "Informativo"
                });
            }

            // CPU
            if (cpuEstado === "Atenção" && cpuAnt === "Normal") {
                const antes = serie[i - 1] ? serie[i - 1].cpu : null;
                eventos.push({
                    horario: fmtHora(ts),
                    timestamp: ts,
                    processo: nome,
                    pid,
                    titulo: "CPU em atenção",
                    descricao: `${antes ?? "-"}% → ${s.cpu ?? "-"}% · limite atenção: ${limites.cpu.atencao}%`,
                    severidade: "Atenção"
                });
            }
            if (cpuEstado === "Crítico" && severidadeRank(cpuAnt) < severidadeRank("Crítico")) {
                const antes = serie[i - 1] ? serie[i - 1].cpu : null;
                eventos.push({
                    horario: fmtHora(ts),
                    timestamp: ts,
                    processo: nome,
                    pid,
                    titulo: "CPU ultrapassou limite crítico",
                    descricao: `${antes ?? "-"}% → ${s.cpu ?? "-"}% · limite crítico: ${limites.cpu.critico}%`,
                    severidade: "Crítico"
                });
            }

            // Memória/RSS
            if (rssEstado !== "Normal" && rssAnt === "Normal") {
                const antes = serie[i - 1] ? serie[i - 1].rssGb : null;
                const fmtGb = (v) => (v == null ? "-" : Number(v).toFixed(2).replace(".", ","));
                const limite = rssEstado === "Crítico" ? limites.rssGb.critico : limites.rssGb.atencao;
                eventos.push({
                    horario: fmtHora(ts),
                    timestamp: ts,
                    processo: nome,
                    pid,
                    titulo: "Aumento de memória",
                    descricao: `${fmtGb(antes)} → ${fmtGb(s.rssGb)} GB · limite ${rssEstado === "Crítico" ? "crítico" : "atenção"}: ${fmtGb(limite)} GB`,
                    severidade: rssEstado
                });
            }

            // Primeiro limite excedido (geral)
            if (!primeiroLimite && geral !== "Normal" && i > 0) {
                primeiroLimite = true;
                const motivoCpu = cpuEstado !== "Normal";
                const antes = motivoCpu ? serie[i - 1].cpu : serie[i - 1].rssGb;
                const atual = motivoCpu ? s.cpu : s.rssGb;
                const limite = motivoCpu
                    ? (cpuEstado === "Crítico" ? limites.cpu.critico : limites.cpu.atencao)
                    : (rssEstado === "Crítico" ? limites.rssGb.critico : limites.rssGb.atencao);
                const unidade = motivoCpu ? "%" : " GB";
                const fmt = (v) => {
                    if (v == null) return "-";
                    return motivoCpu ? Number(v).toFixed(0) : Number(v).toFixed(2).replace(".", ",");
                };
                eventos.push({
                    horario: fmtHora(ts),
                    timestamp: ts,
                    processo: nome,
                    pid,
                    titulo: "Primeiro limite excedido",
                    descricao: `${fmt(antes)}${unidade} → ${fmt(atual)}${unidade} · limite ${geral === "Crítico" ? "crítico" : "atenção"}: ${fmt(limite)}${unidade}`,
                    severidade: geral
                });
            }

            // Incidentes para recorrência
            atualizarIncidente("cpu", cpuEstado, tsMs);
            atualizarIncidente("rss", rssEstado, tsMs);

            cpuAnt = cpuEstado;
            rssAnt = rssEstado;
        }

        // Encerramento de processo (heurística): última observação bem antes do fim da janela
        const ultimo = serie[serie.length - 1];
        const ultimoMs = parseTs(ultimo.timestamp);
        if (Number.isFinite(fimJanelaMs) && Number.isFinite(ultimoMs) && fimJanelaMs - ultimoMs > intervaloMs * 2) {
            eventos.push({
                horario: fmtHora(ultimo.timestamp),
                timestamp: ultimo.timestamp,
                processo: nome,
                pid,
                titulo: "Processo encerrado",
                descricao: "Processo não observado nas amostras seguintes da janela.",
                severidade: "Informativo"
            });
            fecharIncidente("cpu", ultimoMs);
            fecharIncidente("rss", ultimoMs);
        } else {
            // Incidentes ainda abertos ao final da janela: contam ocorrência/última, mas não duração média
            for (const tipo of ["cpu", "rss"]) {
                if (aberto[tipo]) {
                    incidentes.push({
                        processo: nome,
                        pid,
                        tipo: tipo === "cpu" ? "CPU elevada" : "Memória elevada",
                        inicioMs: aberto[tipo].inicioMs,
                        fimMs: null,
                        ultimaMs: aberto[tipo].ultimaMs
                    });
                }
            }
        }
    }

    eventos.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

    const relevantes = eventos.filter((e) => e.severidade !== "Informativo");
    let janelaInvestigacao = null;
    if (relevantes.length > 0) {
        janelaInvestigacao = {
            inicio: fmtHoraMin(relevantes[0].timestamp),
            fim: fmtHoraMin(relevantes[relevantes.length - 1].timestamp),
            label: `${fmtHoraMin(relevantes[0].timestamp)}–${fmtHoraMin(relevantes[relevantes.length - 1].timestamp)}`
        };
    }

    return { eventos, incidentes, janelaInvestigacao };
}

function obterContexto(filtros) {
    return resolverLimites(filtros).then(function (limites) {
        return {
            servidores: filtros.mac ? [{ mac: String(filtros.mac).trim().toUpperCase() }] : [],
            periodos: [
                { id: "ultima-hora", label: "Última hora" },
                { id: "ultimas-6h", label: "Últimas 6 horas" },
                { id: "ultimas-24h", label: "Últimas 24 horas" }
            ],
            intervalo: { inicio: filtros.inicio || null, fim: filtros.fim || null },
            limites
        };
    });
}

function obterKpis(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const atuais = ultimaPorProcesso(amostras);
            let criticos = 0;
            let cpuAtencao = 0;
            let cpuCritico = 0;
            let ramAtencao = 0;
            let ramCritico = 0;
            let threadsTotal = 0;

            for (const p of atuais) {
                const status = classificar(p.cpu, p.rssGb, limites);
                if (status === "Crítico") criticos++;

                if (p.cpu != null && limites.cpu.critico != null && p.cpu >= limites.cpu.critico) cpuCritico++;
                else if (p.cpu != null && limites.cpu.atencao != null && p.cpu >= limites.cpu.atencao) cpuAtencao++;

                if (p.rssGb != null && limites.rssGb.critico != null && p.rssGb >= limites.rssGb.critico) ramCritico++;
                else if (p.rssGb != null && limites.rssGb.atencao != null && p.rssGb >= limites.rssGb.atencao) ramAtencao++;

                if (p.threads != null) threadsTotal += p.threads;
            }

            return {
                kpis: [
                    { id: "processos-identificados", valor: atuais.length, subtitulo: "No servidor selecionado" },
                    { id: "processos-criticos", valor: criticos, subtitulo: "Limite crítico excedido" },
                    { id: "cpu-elevada", valor: cpuAtencao + cpuCritico, subtitulo: `${cpuAtencao} em atenção · ${cpuCritico} críticos` },
                    { id: "ram-elevada", valor: ramAtencao + ramCritico, subtitulo: `${ramAtencao} em atenção · ${ramCritico} críticos` },
                    { id: "threads-identificadas", valor: threadsTotal, subtitulo: "Dos processos monitorados" },
                    { id: "eventos-registrados", valor: 0, subtitulo: "Implementar na etapa de eventos" }
                ]
            };
        });
}

function obterSerieTemporal(filtros) {
    const pidFiltro = filtros.pid != null ? Number(filtros.pid) : null;
    const nomeFiltro = filtros.processo || filtros.nome || null;

    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            let serie = amostras;
            if (pidFiltro != null) serie = serie.filter((a) => a.pid === pidFiltro);
            if (nomeFiltro) serie = serie.filter((a) => a.nome === nomeFiltro);

            if (serie.length === 0) {
                return {
                    processo: null,
                    cpu: { pontos: [], limites: limites.cpu },
                    rss: { pontos: [], limites: limites.rssGb },
                    comparativo: null,
                    primeiroDesvio: null
                };
            }

            serie.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

            const pontosCpu = serie.map((a) => ({ t: a.timestamp, v: a.cpu }));
            const pontosRss = serie.map((a) => ({ t: a.timestamp, v: a.rssGb }));
            const primeiro = serie[0];
            const ultimo = serie[serie.length - 1];

            let primeiroDesvio = null;
            for (const a of serie) {
                if (classificar(a.cpu, a.rssGb, limites) !== "Normal") {
                    primeiroDesvio = a.timestamp;
                    break;
                }
            }

            return {
                processo: ultimo.nome,
                pid: ultimo.pid,
                usuario: ultimo.usuario,
                statusAtual: classificar(ultimo.cpu, ultimo.rssGb, limites),
                primeiroDesvio,
                cpu: {
                    atual: ultimo.cpu,
                    unidade: "%",
                    limites: limites.cpu,
                    pico: pico(pontosCpu),
                    pontos: pontosCpu
                },
                rss: {
                    atual: ultimo.rssGb,
                    unidade: "GB",
                    limites: limites.rssGb,
                    pico: pico(pontosRss),
                    pontos: pontosRss
                },
                comparativo: {
                    cpu: formatarDeltaCpu(primeiro.cpu, ultimo.cpu),
                    rss: formatarDeltaRss(primeiro.rssGb, ultimo.rssGb)
                }
            };
        });
}

function obterVariacao(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const mapa = primeiraUltimaPorProcesso(amostras);
            const processos = [];

            for (const { primeira, ultima } of mapa.values()) {
                const deltaCpu = (primeira.cpu != null && ultima.cpu != null) ? (ultima.cpu - primeira.cpu) : null;
                const deltaRss = (primeira.rssGb != null && ultima.rssGb != null) ? (ultima.rssGb - primeira.rssGb) : null;
                processos.push({
                    processo: ultima.nome,
                    pid: ultima.pid,
                    cpuAntes: primeira.cpu,
                    cpuAtual: ultima.cpu,
                    deltaCpu,
                    rssAntesGb: primeira.rssGb,
                    rssAtualGb: ultima.rssGb,
                    deltaRssGb: deltaRss,
                    status: classificar(ultima.cpu, ultima.rssGb, limites)
                });
            }

            processos.sort((a, b) => Math.abs(b.deltaCpu || 0) - Math.abs(a.deltaCpu || 0));
            return { processos };
        });
}

function obterEventos(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const { eventos, janelaInvestigacao } = analisarProcessos(amostras, limites, filtros);
            const lista = eventos.map((e) => ({
                horario: e.horario,
                processo: e.processo,
                pid: e.pid,
                titulo: e.titulo,
                descricao: e.descricao,
                severidade: e.severidade
            }));
            return { janelaInvestigacao, eventos: lista };
        });
}

function listarTodos(filtros) {
    const pagina = Math.max(1, Number(filtros.pagina) || 1);
    const porPagina = Math.max(1, Math.min(100, Number(filtros.porPagina) || 10));

    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            let itens = ultimaPorProcesso(amostras).map((p) => ({
                nome: p.nome,
                pid: p.pid,
                usuario: p.usuario,
                cpu: p.cpu,
                memoriaRssGb: p.rssGb,
                threads: p.threads,
                status: classificar(p.cpu, p.rssGb, limites),
                criacao: p.createTime
            }));

            const busca = String(filtros.busca || "").toLowerCase();
            if (busca) {
                itens = itens.filter(
                    (i) => String(i.nome || "").toLowerCase().includes(busca) || String(i.pid).includes(busca)
                );
            }
            if (filtros.status) {
                itens = itens.filter((i) => i.status === filtros.status);
            }

            const total = itens.length;
            const inicioIdx = (pagina - 1) * porPagina;
            itens = itens.slice(inicioIdx, inicioIdx + porPagina);

            return { itens, total, pagina, porPagina };
        });
}

function obterRecorrencia(filtros) {
    return Promise.all([carregarAmostras(filtros), resolverLimites(filtros)])
        .then(function ([amostras, limites]) {
            const { incidentes } = analisarProcessos(amostras, limites, filtros);
            const grupos = new Map();

            for (const inc of incidentes) {
                const chave = `${inc.processo}|${inc.pid}|${inc.tipo}`;
                if (!grupos.has(chave)) {
                    grupos.set(chave, {
                        processo: inc.processo,
                        pid: inc.pid,
                        tipo: inc.tipo,
                        ocorrencias: 0,
                        ultimaMs: null,
                        duracoes: []
                    });
                }
                const g = grupos.get(chave);
                g.ocorrencias += 1;
                if (g.ultimaMs == null || inc.ultimaMs > g.ultimaMs) g.ultimaMs = inc.ultimaMs;
                if (inc.fimMs != null && inc.inicioMs != null) {
                    g.duracoes.push(inc.fimMs - inc.inicioMs);
                }
            }

            const itens = Array.from(grupos.values()).map((g) => {
                let duracaoMedia = null;
                if (g.duracoes.length > 0) {
                    const soma = g.duracoes.reduce((a, b) => a + b, 0);
                    duracaoMedia = fmtDuracao(soma / g.duracoes.length);
                }
                return {
                    processo: g.processo,
                    pid: g.pid,
                    tipo: g.tipo,
                    ocorrencias: g.ocorrencias,
                    ultimaOcorrencia: g.ultimaMs != null ? fmtHora(g.ultimaMs) : null,
                    duracaoMedia,
                    frequencia: frequenciaNivel(g.ocorrencias)
                };
            });

            itens.sort((a, b) => b.ocorrencias - a.ocorrencias);
            return { itens };
        });
}

module.exports = {
    obterContexto,
    obterKpis,
    obterSerieTemporal,
    obterVariacao,
    obterEventos,
    listarTodos,
    obterRecorrencia,
    _internos: {
        carregarAmostras,
        normalizarAmostraProcesso,
        classificar,
        resolverLimites,
        extrairLimite,
        analisarProcessos
    }
};