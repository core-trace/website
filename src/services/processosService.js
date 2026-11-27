const processosModel = require("../models/processosModel");
const servidorModel = require("../models/servidorModel");

/**
 * Limiares padrão quando não há perfil de servidor no banco (ou não foram
 * informados idEmpresa/idUsuario). CPU de processo NÃO é limitada a 100%:
 * pode passar de 100% em servidor multinúcleo. RAM fica em 0..100.
 */
const LIMIARES_PADRAO = {
    cpu: { atencao: 60, critico: 90 },
    rssGb: { atencao: 2.0, critico: 2.5 }
};

// Os lotes do Gold podem ter vários MB; sem cache cada recarga da tela
// baixaria novamente o mesmo JSON do S3.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheAmostras = new Map();
const cacheKpisGold = new Map();

function chaveCache(mac, data) {
    return `${processosModel.normalizarMac(mac)}|${data}`;
}

function lerCache(cache, chave) {
    const item = cache.get(chave);
    if (!item) return undefined;
    if (Date.now() - item.tempo > CACHE_TTL_MS) {
        cache.delete(chave);
        return undefined;
    }
    return item.valor;
}

function gravarCache(cache, chave, valor) {
    cache.set(chave, { tempo: Date.now(), valor });
}

function extrairValor(leitura) {
    if (!leitura || typeof leitura !== "object") return null;
    if (leitura.valor !== undefined) return leitura.valor;
    if (leitura.ultimo_valor !== undefined) return leitura.ultimo_valor;
    if (leitura.media !== undefined) return leitura.media;
    return null;
}

function statusDaLeitura(leitura) {
    if (!leitura) return "indisponivel";
    return leitura.status || "indisponivel";
}

function toNumber(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

/**
 * O Gold guarda em "extras" as colunas que não tem métrica no catálogo
 * (CREATE_TIME, RSS_BYTES etc.). Capturas mais antigas podem trazer o campo
 * direto na raiz do registro, então os dois formatos são aceitos.
 */
function campoAuxiliar(registro, nomes) {
    for (const nome of nomes) {
        if (registro[nome] !== undefined && registro[nome] !== null) {
            return registro[nome];
        }
    }

    if (Array.isArray(registro.extras)) {
        const procurados = nomes.map(nome => String(nome).toUpperCase());
        for (const extra of registro.extras) {
            const origem = String((extra && extra.campo_origem) || "").toUpperCase();
            if (procurados.includes(origem)) {
                return extra.valor;
            }
        }
    }

    return null;
}

/**
 * Normaliza uma amostra de processo vinda do lote JSON do Gold.
 * O Gold grava: cpu.uso (metrica/valor/status) e
 * memoria.uso_percentual (metrica/valor/status).
 */
function normalizarAmostra(registro) {
    if (!registro) return null;

    const cpuLeitura = registro.cpu && registro.cpu.uso;
    const memoriaLeitura =
        registro.memoria &&
        (registro.memoria.uso_percentual || registro.memoria.uso);

    const cpu = toNumber(extrairValor(cpuLeitura));
    const memoriaPercent = toNumber(extrairValor(memoriaLeitura));
    const cpuStatus = statusDaLeitura(cpuLeitura);
    const memoriaStatus = statusDaLeitura(memoriaLeitura);
    const createTimeBruto = campoAuxiliar(registro, ["CREATE_TIME", "create_time"]);
    const rssBruto = campoAuxiliar(registro, ["RSS_BYTES", "rss_bytes"]);

    // Limita RAM a 0..100; CPU de processo não tem teto (multinúcleo).
    let memoriaLimitada = memoriaPercent;
    if (memoriaLimitada != null) {
        memoriaLimitada = Math.max(0, Math.min(100, memoriaLimitada));
    }

    return {
        timestamp: registro.timestamp || null,
        pid: toNumber(registro.pid),
        nome: registro.nome || null,
        usuario: registro.usuario || null,
        cpu: cpu != null ? cpu : null,
        memoria: memoriaLimitada != null ? memoriaLimitada : null,
        cpuStatus,
        memoriaStatus,
        createTime: createTimeBruto != null && String(createTimeBruto).trim()
            ? String(createTimeBruto).trim()
            : null,
        rssBytes: rssBruto == null ? null : toNumber(rssBruto),
        valido: cpuLeitura ? cpuLeitura.status === "ok" : false,
        memoriaValida: memoriaLeitura ? memoriaLeitura.status === "ok" : false
    };
}

/**
 * Carrega todas as amostras de processo de um servidor em um dia,
 * juntando todos os lotes (capturas.json) e ordenando por timestamp.
 */
async function carregarAmostras(mac, data) {
    const chaveCacheLocal = chaveCache(mac, data);
    const emCache = lerCache(cacheAmostras, chaveCacheLocal);
    if (emCache !== undefined) return emCache;

    const macNormalizado = processosModel.normalizarMac(mac);
    const chaves = (await processosModel.listarLotesDoDia(macNormalizado, data))
        .filter(chave => chave.endsWith("capturas.json"));

    // Lê os lotes em paralelo: o tempo total deixa de ser a soma de um
    // GetObject por captura. Um lote que falha é ignorado, como antes.
    const lotes = await Promise.all(chaves.map(chave =>
        processosModel.buscarConteudoLote(chave).catch(erro => {
            console.warn(`Não foi possível ler lote ${chave}:`, erro.message);
            return null;
        })
    ));

    const amostras = [];
    for (const lote of lotes) {
        if (!lote || !Array.isArray(lote.processos)) continue;

        for (const registro of lote.processos) {
            const amostra = normalizarAmostra(registro);
            if (amostra) amostras.push(amostra);
        }
    }

    amostras.sort(
        (a, b) =>
            new Date(a.timestamp || 0).getTime() -
            new Date(b.timestamp || 0).getTime()
    );

    gravarCache(cacheAmostras, chaveCacheLocal, amostras);
    return amostras;
}

/**
 * Resolve os limiares a usar: do perfil do servidor no banco, se disponível;
 * senão, os padrões.
 */
async function resolverLimites(filtros = {}) {
    const mac = String(filtros.mac || filtros.servidor || "").trim();
    const empresa = Number(filtros.empresa);
    const usuario = Number(filtros.usuario);

    if (
        mac &&
        Number.isSafeInteger(empresa) &&
        Number.isSafeInteger(usuario)
    ) {
        try {
            const servidores = await servidorModel.listarServidoresPorEmpresa(
                empresa,
                usuario
            );
            const servidor = servidores.find(
                (s) =>
                    String(s.endereco_mac || "").trim().toUpperCase() ===
                    mac.toUpperCase()
            );
            if (servidor && servidor.componentes) {
                const cpuComp = servidor.componentes.find(
                    (c) =>
                        String(c.coluna || "").toLowerCase() ===
                        "p_cpu_percent"
                );
                const ramComp = servidor.componentes.find(
                    (c) =>
                        String(c.coluna || "").toLowerCase() ===
                        "p_memory_percent"
                );
                const limiares = {
                    cpu: { ...LIMIARES_PADRAO.cpu },
                    rssGb: { ...LIMIARES_PADRAO.rssGb }
                };
                if (cpuComp) {
                    if (cpuComp.atencao != null)
                        limiares.cpu.atencao = Number(cpuComp.atencao);
                    if (cpuComp.critico != null)
                        limiares.cpu.critico = Number(cpuComp.critico);
                }
                if (ramComp) {
                    if (ramComp.atencao != null)
                        limiares.rssGb.atencao = Number(ramComp.atencao);
                    if (ramComp.critico != null)
                        limiares.rssGb.critico = Number(ramComp.critico);
                }
                return limiares;
            }
        } catch (e) {
            // falha ao ler perfil -> usa padrões
        }
    }

    return { ...LIMIARES_PADRAO };
}

function ehCritico(cpu, memoria, limiares) {
    const cpuCritico =
        cpu != null && limiares.cpu.critico != null && cpu >= limiares.cpu.critico;
    const ramCritico =
        memoria != null &&
        limiares.rssGb.critico != null &&
        memoria >= limiares.rssGb.critico;
    return cpuCritico || ramCritico;
}

function ehAtencao(cpu, memoria, limiares) {
    const cpuAtencao =
        cpu != null && limiares.cpu.atencao != null && cpu >= limiares.cpu.atencao;
    const ramAtencao =
        memoria != null &&
        limiares.rssGb.atencao != null &&
        memoria >= limiares.rssGb.atencao;
    return cpuAtencao || ramAtencao;
}

/**
 * Identifica processos que reiniciaram em loop no período.
 *
 * Quando o lote traz CREATE_TIME (campo do psutil preservado em "extras"), uma
 * mudança entre janelas consecutivas da mesma chave nome+PID é um reinício.
 * Nos lotes atuais o agente não grava CREATE_TIME; nesse caso usamos o fallback
 * por troca de PID entre janelas, apenas para nomes com um PID por janela —
 * assim não confundimos reinício com processos multi-instância (ex.: navegador).
 */
function calcularReiniciandoLoop(amostras) {
    const porIdentidade = new Map();
    const porNome = new Map();

    for (const amostra of amostras) {
        if (!amostra.nome || amostra.pid == null) continue;

        const chave = `${amostra.nome} | PID ${amostra.pid}`;
        if (!porIdentidade.has(chave)) porIdentidade.set(chave, []);
        porIdentidade.get(chave).push(amostra);

        if (!porNome.has(amostra.nome)) porNome.set(amostra.nome, new Map());
        const janelas = porNome.get(amostra.nome);
        if (!janelas.has(amostra.timestamp)) janelas.set(amostra.timestamp, new Set());
        janelas.get(amostra.timestamp).add(String(amostra.pid));
    }

    const candidatos = [];

    for (const lista of porIdentidade.values()) {
        let primeiroCreate = null;
        let ultimoCreate = null;
        let reinicios = 0;
        let ultimoReinicio = null;

        for (const amostra of lista) {
            if (!amostra.createTime) continue;
            if (primeiroCreate === null) primeiroCreate = amostra.createTime;
            if (ultimoCreate !== null && amostra.createTime !== ultimoCreate) {
                reinicios++;
                ultimoReinicio = amostra.timestamp;
            }
            ultimoCreate = amostra.createTime;
        }

        if (reinicios > 0) {
            candidatos.push({
                nome: lista[0].nome,
                pid: lista[lista.length - 1].pid,
                reinicios,
                metodo: "create_time",
                ultimoReinicio,
                createTimeInicial: primeiroCreate,
                createTimeAtual: ultimoCreate,
                pidsObservados: []
            });
        }
    }

    for (const [nome, janelas] of porNome) {
        // Nomes com mais de um PID na mesma janela não permitem distinguir
        // reinício de concorrência sem CREATE_TIME.
        let multiInstancia = false;
        for (const pids of janelas.values()) {
            if (pids.size > 1) {
                multiInstancia = true;
                break;
            }
        }
        if (multiInstancia) continue;
        if (candidatos.some(c => c.nome === nome && c.metodo === "create_time")) continue;

        const tempos = Array.from(janelas.keys()).sort();
        const pids = tempos.map(tempo => Array.from(janelas.get(tempo))[0]);
        let reinicios = 0;
        let ultimoReinicio = null;

        for (let i = 1; i < pids.length; i++) {
            if (pids[i] !== pids[i - 1]) {
                reinicios++;
                ultimoReinicio = tempos[i];
            }
        }

        if (reinicios > 0) {
            candidatos.push({
                nome,
                pid: toNumber(pids[pids.length - 1]),
                reinicios,
                metodo: "troca_de_pid",
                ultimoReinicio,
                createTimeInicial: null,
                createTimeAtual: null,
                pidsObservados: Array.from(new Set(pids)).map(pid => toNumber(pid))
            });
        }
    }

    // Troca de PID isolada pode ser só substituição eventual; uma variação de
    // CREATE_TIME, por ser medida direta da criação, já basta para sinalizar.
    const emLoop = candidatos.filter(
        c => c.reinicios >= 2 || (c.metodo === "create_time" && c.reinicios >= 1)
    );

    emLoop.sort(
        (a, b) => b.reinicios - a.reinicios || String(a.nome).localeCompare(String(b.nome))
    );

    return { total: emLoop.length, processos: emLoop };
}

/**
 * Os picos de CPU/RAM são consolidados na Gold e gravados em resumo.json.
 * O service apenas converte para o formato da tela; não recalcula os picos.
 * Quando o resumo ainda não tem kpis_processos, os picos ficam vazios.
 */
async function carregarKpisGold(mac, data) {
    const chaveCacheLocal = chaveCache(mac, data);
    const emCache = lerCache(cacheKpisGold, chaveCacheLocal);
    if (emCache !== undefined) return emCache;

    try {
        const resumo = await processosModel.buscarResumoDiario(
            processosModel.normalizarMac(mac),
            data
        );
        const valor = resumo && resumo.kpis_processos ? resumo.kpis_processos : null;
        gravarCache(cacheKpisGold, chaveCacheLocal, valor);
        return valor;
    } catch (erro) {
        console.warn("Não foi possível ler kpis_processos do resumo diário:", erro.message);
        return null;
    }
}

function campoGold(destaque, nome) {
    if (!destaque || destaque[nome] === undefined || destaque[nome] === null) return null;
    const numero = Number(destaque[nome]);
    return Number.isFinite(numero) ? numero : null;
}

/**
 * O resumo Gold não repete o usuário nem o RSS do pico; quando o lote da mesma
 * captura traz esses campos, usamos apenas para completar o que a tela mostra.
 */
function amostraDoPico(amostras, destaque) {
    if (!destaque) return null;
    const instante = Date.parse(destaque.instante_pico);
    return amostras.find((amostra) =>
        String(amostra.pid) === String(destaque.pid) &&
        Number.isFinite(instante) &&
        Date.parse(amostra.timestamp) === instante
    ) || amostras.find((amostra) =>
        String(amostra.pid) === String(destaque.pid)
    ) || null;
}

function picoDaGold(destaque, amostras, campoValor, comRss = false) {
    const valor = campoGold(destaque, campoValor);
    if (valor === null) return null;

    const amostra = amostraDoPico(amostras, destaque);
    const pico = {
        valor,
        unidade: "%",
        nome: (destaque && destaque.nome) || (amostra && amostra.nome) || null,
        pid: campoGold(destaque, "pid"),
        usuario: (amostra && amostra.usuario) || null,
        timestamp: (destaque && destaque.instante_pico) || null
    };
    if (comRss && amostra && amostra.rssBytes != null) {
        pico.rssBytes = amostra.rssBytes;
    }
    return pico;
}

function picosDaGold(kpisGold, amostras) {
    if (!kpisGold || typeof kpisGold !== "object") return { memoria: null, cpu: null };

    return {
        memoria: picoDaGold(
            kpisGold.pico_memoria && kpisGold.pico_memoria.destaque,
            amostras,
            "pico_memoria_percent",
            true
        ),
        cpu: picoDaGold(
            kpisGold.pico_cpu && kpisGold.pico_cpu.destaque,
            amostras,
            "pico_cpu_percent"
        )
    };
}

/**
 * Calcula os KPIs da tela: loop vem das amostras; picos vêm da Gold.
 */
function calcularKpis(amostras, kpisGold = null) {
    const picos = picosDaGold(kpisGold, amostras);

    return {
        reiniciandoLoop: calcularReiniciandoLoop(amostras),
        picoMemoria: picos.memoria,
        picoCpu: picos.cpu
    };
}

/**
 * Identidade da instância do processo: nome + PID e, quando o lote traz
 * CREATE_TIME, o instante de criação. O PID pode ser reaproveitado pelo
 * sistema operacional após um reinício, então sozinho não distingue
 * instâncias diferentes com o mesmo nome.
 */
function chaveIdentidadeProcesso(amostra) {
    const nome = amostra.nome || "desconhecido";
    const pid = amostra.pid != null ? amostra.pid : "--";
    const createTime = amostra.createTime || "";
    return `${nome} | PID ${pid} | CREATE ${createTime}`;
}

/**
 * Agrupa amostras pela identidade da instância (nome + PID + criação, quando
 * disponível) e calcula o Top 5 processos que mais utilizam recursos no dia,
 * com base no valor máximo observado de CPU e memória. Não depende de
 * limiares de atenção/crítico.
 */
function calcularTop5Recursos(amostras) {
    const grupos = new Map();

    for (const a of amostras) {
        const chave = chaveIdentidadeProcesso(a);
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                nome: a.nome || "desconhecido",
                pid: a.pid != null ? a.pid : "--",
                createTime: a.createTime || null,
                cpuMax: 0,
                memoriaMax: 0,
                ultimoPico: null
            });
        }

        const grupo = grupos.get(chave);

        if (a.cpu != null && a.valido !== false) {
            grupo.cpuMax = Math.max(grupo.cpuMax, a.cpu);
        }
        if (a.memoria != null && a.memoriaValida !== false) {
            grupo.memoriaMax = Math.max(grupo.memoriaMax, a.memoria);
        }

        if (
            a.cpu != null && a.valido !== false &&
            (!grupo.ultimoPico || a.cpu >= grupo.cpuMax)
        ) {
            grupo.ultimoPico = a.timestamp;
        }
    }

    const resultado = Array.from(grupos.values()).map((g) => ({
        nome: g.nome,
        pid: g.pid,
        createTime: g.createTime,
        cpuMax: g.cpuMax,
        memoriaMax: g.memoriaMax,
        ultimoPico: g.ultimoPico
    }));

    // Ordena por CPU máxima descrescente; desempate por memória máxima.
    resultado.sort((a, b) => b.cpuMax - a.cpuMax || b.memoriaMax - a.memoriaMax);
    return resultado.slice(0, 5);
}

/**
 * Extrai a série temporal (pontos {t, v}) de um processo específico.
 * Só entra leitura com status "ok".
 */
function obterSerie(amostras, nomeProcesso, pid, metrica = "cpu") {
    const filtrados = amostras.filter(
        (p) =>
            (p.nome || "") === nomeProcesso &&
            String(p.pid) === String(pid)
    );

    const pontos = [];
    for (const p of filtrados) {
        const valor = metrica === "cpu" ? p.cpu : p.memoria;
        const valido = metrica === "cpu" ? p.valido : p.memoriaValida;
        if (valor != null && valido) {
            pontos.push({ t: p.timestamp, v: valor });
        }
    }

    return pontos;
}

/**
 * Compara os dois últimos instantes distintos (momento A → momento B).
 */
function compararMomentos(amostras) {
    const temposUnicos = [
        ...new Set(amostras.map((p) => p.timestamp).filter(Boolean))
    ].sort();

    if (temposUnicos.length < 2) return null;

    const a = temposUnicos[temposUnicos.length - 2];
    const b = temposUnicos[temposUnicos.length - 1];

    const grupoA = amostras.filter((p) => p.timestamp === a);
    const grupoB = amostras.filter((p) => p.timestamp === b);

    const mediaCpuA = mediaValores(grupoA, "cpu");
    const mediaCpuB = mediaValores(grupoB, "cpu");
    const mediaMemA = mediaValores(grupoA, "memoria");
    const mediaMemB = mediaValores(grupoB, "memoria");

    return {
        momentoA: a,
        momentoB: b,
        cpu: mediaCpuA != null && mediaCpuB != null
            ? { a: mediaCpuA, b: mediaCpuB, delta: mediaCpuB - mediaCpuA }
            : null,
        memoria: mediaMemA != null && mediaMemB != null
            ? { a: mediaMemA, b: mediaMemB, delta: mediaMemB - mediaMemA }
            : null
    };
}

function mediaValores(grupo, metrica) {
    const validos = grupo.filter((p) => {
        const v = metrica === "cpu" ? p.cpu : p.memoria;
        const ok = metrica === "cpu" ? p.valido : p.memoriaValida;
        return v != null && ok;
    });
    if (validos.length === 0) return null;
    const soma = validos.reduce((acc, p) => acc + (metrica === "cpu" ? p.cpu : p.memoria), 0);
    return soma / validos.length;
}

/**
 * Monta a resposta agregada para a tela de processos.
 */
async function obterDashboard(filtros = {}) {
    const { mac, data } = filtros;
    if (!mac || !data) {
        throw new Error("Parâmetros 'mac' e 'data' são obrigatórios.");
    }

    const [limiares, amostras, kpisGold] = await Promise.all([
        resolverLimites(filtros),
        carregarAmostras(mac, data),
        carregarKpisGold(mac, data)
    ]);

    const kpis = calcularKpis(amostras, kpisGold);
    const top5Recursos = calcularTop5Recursos(amostras);
    const comparacao = compararMomentos(amostras);

    return {
        mac,
        data,
        limiares,
        kpis,
        top5Recursos,
        comparacao,
        total: amostras.length,
        ultimaColeta: amostras.length > 0 ? amostras[amostras.length - 1].timestamp : null,
        processos: amostras
    };
}

module.exports = {
    normalizarAmostra,
    carregarAmostras,
    resolverLimites,
    calcularKpis,
    calcularReiniciandoLoop,
    calcularTop5Recursos,
    obterSerie,
    compararMomentos,
    obterDashboard,
    LIMIARES_PADRAO
};
