const jiraChamadosService = require("./jiraChamadosService");
const { gerarEtiquetaJira } = jiraChamadosService;
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const servidorModel = require("../models/servidorModel");
const resumoGoldService = require("./resumoGoldService");

const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

// Mesmo bucket que o resto do projeto usa (s3Model.js, resumoGoldService.js) -
// antes essa variável tinha outro nome e nunca existia em nenhum .env, então
// toda consulta caía num bucket que não é o nosso e dava Access Denied.
const BUCKET = process.env.BUCKET_DADOS_GOLD;
if (!BUCKET) {
    throw new Error("Variável BUCKET_DADOS_GOLD não configurada.");
}
const PREFIXO_LOTES = normalizarPrefixo(process.env.S3_PREFIX || "client/lotes/");

const JANELA_GRAFICO_MINUTOS = 60;
const PASSO_GRADE_MINUTOS = 10;
const LIMITE_SEM_DADOS_MINUTOS = 15;
const CACHE_LOTES_MS = 5 * 60 * 1000;
const cachePontosMaquina = new Map();

function normalizarPrefixo(prefixo) {
    const limpo = String(prefixo || "").trim();
    return limpo.endsWith("/") ? limpo : `${limpo}/`;
}

function normalizarMac(mac) {
    return String(mac || "").trim().toUpperCase();
}

function dataHojeLocal() {
    // Reaproveita a mesma data demo da dashboard Geral (ver resumoGoldService).
    return resumoGoldService.dataDeHojeSaoPaulo();
}

function horaFormatada(data) {
    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(data);
}

function streamParaTexto(stream) {
    return new Promise((resolve, reject) => {
        const pedacos = [];
        stream.on("data", (chunk) => pedacos.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(pedacos).toString("utf-8")));
    });
}

async function lerJsonS3(chave) {
    const resposta = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }));
    const texto = await streamParaTexto(resposta.Body);
    return JSON.parse(texto);
}

// Alguns lotes do dia trazem processos/containers/logs e nenhuma metrica.
// Ler so o inicio evita baixar arquivos de dezenas de MB so para descarta-los.
// Se o campo nao aparecer no trecho, seguimos com a leitura completa para nao
// perder nenhum dado de formatos diferentes.
async function loteTemMetricas(chave) {
    try {
        const resposta = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: chave,
            Range: "bytes=0-2047"
        }));
        const trecho = await streamParaTexto(resposta.Body);
        if (/"metricas"\s*:\s*\[\s*\]/.test(trecho)) return false;
        return true;
    } catch (erro) {
        // Leitura parcial indisponivel: mantem o comportamento anterior.
        return true;
    }
}

async function listarLotesMaquina(mac, dataStr) {
    const prefixo = `${PREFIXO_LOTES}maquina=${mac}/data=${dataStr}/`;
    const chaves = [];
    let continuationToken;

    do {
        const resp = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefixo,
            ContinuationToken: continuationToken
        }));

        for (const obj of resp.Contents || []) {
            if (obj.Key && obj.Key.endsWith("/capturas.json")) {
                chaves.push(obj.Key);
            }
        }
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
    } while (continuationToken);

    return chaves.sort();
}

function extrairLeituras(no, destino = new Map()) {
    if (!no || typeof no !== "object") return destino;

    if (Array.isArray(no)) {
        for (const item of no) extrairLeituras(item, destino);
        return destino;
    }

    if ("metrica" in no && "valor" in no && "status" in no) {
        if (no.status === "ok" && typeof no.valor === "number" && Number.isFinite(no.valor)) {
            const chave = String(no.metrica).toLowerCase();
            const existente = destino.get(chave);
            if (!existente || no.valor > existente.valor) {
                destino.set(chave, {
                    metrica: chave,
                    campoOrigem: no.campo_origem || chave.toUpperCase(),
                    valor: no.valor,
                    unidade: no.unidade || ""
                });
            }
        }
        return destino;
    }

    for (const valor of Object.values(no)) {
        if (valor && typeof valor === "object") extrairLeituras(valor, destino);
    }

    return destino;
}

function compararOperador(valor, operador, limite) {
    if (limite === null || limite === undefined || Number.isNaN(Number(limite))) return false;
    const lim = Number(limite);
    switch (operador) {
        case ">": return valor > lim;
        case ">=": return valor >= lim;
        case "<": return valor < lim;
        case "<=": return valor <= lim;
        case "==":
        case "=": return valor === lim;
        default: return valor > lim;
    }
}

function avaliarComponente(valor, comp) {
    const critico1 = compararOperador(valor, comp.operador, comp.critico);
    const critico2 = comp.operador2 ? compararOperador(valor, comp.operador2, comp.critico2) : false;
    if (critico1 || critico2) return "critico";

    const atencao1 = compararOperador(valor, comp.operador, comp.atencao);
    const atencao2 = comp.operador2 ? compararOperador(valor, comp.operador2, comp.atencao2) : false;
    if (atencao1 || atencao2) return "atencao";

    return "normal";
}

async function buscarChamadoJiraPorEtiqueta(etiqueta) {
    const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    const projeto = process.env.JIRA_PROJECT_KEY || "SUP";

    if (!baseUrl || !email || !token) return null;

    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const jql = `project = "${projeto}" AND labels = "${etiqueta}" ORDER BY created DESC`;

    try {
        const resp = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ jql, maxResults: 1, fields: ["summary", "status"] })
        });

        if (!resp.ok) return null;
        const dados = await resp.json();
        const issue = (dados.issues || [])[0];
        if (!issue) return null;

        return {
            chave: issue.key,
            url: `${baseUrl}/browse/${issue.key}`,
            status: issue.fields?.status?.name || "Aberto",
            titulo: issue.fields?.summary || ""
        };
    } catch {
        return null;
    }
}

async function abrirOuObterChamadoJira({ mac, nomeServidor, perfil, metricaPrincipal, nivel }) {
    const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    const projeto = process.env.JIRA_PROJECT_KEY || "SUP";

    if (!baseUrl || !email || !token) {
        return { configurado: false };
    }

    const metrica = metricaPrincipal?.coluna || "cpu_percent";
    const recurso = metricaPrincipal?.recurso || "CPU";
    const campoOrigem = metrica.toUpperCase();
    const etiqueta = gerarEtiquetaJira(mac, recurso, metrica, campoOrigem);

    const existente = await buscarChamadoJiraPorEtiqueta(etiqueta);
    if (existente) {
        return { configurado: true, ...existente };
    }

    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const prefixoNivel = nivel === "critico" ? "CRÍTICO" : nivel === "atencao" ? "ATENÇÃO" : "SEM DADOS";
    const unidade = metricaPrincipal?.unidade || "%";
    const valorFmt = metricaPrincipal ? `${Number(metricaPrincipal.valor).toFixed(1)}${unidade}` : "indisponível";
    const summary = `[${prefixoNivel}] Alerta em ${metricaPrincipal?.nome || recurso} (${valorFmt}) | Servidor ${nomeServidor} (${mac})`;

    const resp = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${auth}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                project: { key: projeto },
                summary,
                issuetype: { name: "Task" },
                labels: [etiqueta, "coretrace"],
                description: {
                    type: "doc",
                    version: 1,
                    content: [{
                        type: "paragraph",
                        content: [{
                            type: "text",
                            text: `Incidente identificado pelo CoreTrace no servidor ${nomeServidor} (MAC: ${mac}, Perfil: ${perfil}). Métrica: ${metrica} = ${valorFmt}.`
                        }]
                    }]
                }
            }
        })
    });

    if (!resp.ok) {
        const detalhe = await resp.text();
        throw new Error(`Falha ao criar chamado no Jira (${resp.status}): ${detalhe}`);
    }

    const criado = await resp.json();
    return {
        configurado: true,
        chave: criado.key,
        url: `${baseUrl}/browse/${criado.key}`,
        status: "Aberto"
    };
}

function montarGradeTempo(agora) {
    const slots = [];
    const totalPontos = Math.floor(JANELA_GRAFICO_MINUTOS / PASSO_GRADE_MINUTOS) + 1;
    const baseMs = Math.floor(agora.getTime() / (PASSO_GRADE_MINUTOS * 60_000)) * (PASSO_GRADE_MINUTOS * 60_000);

    for (let i = totalPontos - 1; i >= 0; i -= 1) {
        const ts = baseMs - i * PASSO_GRADE_MINUTOS * 60_000;
        slots.push({
            inicioMs: ts - (PASSO_GRADE_MINUTOS * 60_000) / 2,
            fimMs: ts + (PASSO_GRADE_MINUTOS * 60_000) / 2,
            hora: horaFormatada(new Date(ts))
        });
    }
    return slots;
}

async function obterAlertasServidores(idEmpresa, idUsuario) {
    const servidoresBanco = await servidorModel.listarServidoresPorEmpresa(idEmpresa, idUsuario);
    // O Jira nao depende das capturas: inicia a busca antes de processar os lotes.
    const chamadosPromise = jiraChamadosService.obterChamadosPorEmpresa(idEmpresa, servidoresBanco);
    const agora = resumoGoldService.agoraOuReferenciaDemo();
    const horaAtualizacao = horaFormatada(agora);
    const hoje = dataHojeLocal();
    const slots = montarGradeTempo(agora);

    const servidoresProcessados = await Promise.all(servidoresBanco.map(async (srv) => {
        const mac = normalizarMac(srv.endereco_mac);
        const componentes = srv.componentes || [];
        const chaveCache = `${mac}|${hoje}`;
        const entradaCache = cachePontosMaquina.get(chaveCache);
        const cacheValido = entradaCache && Date.now() < entradaCache.expiraEm;

        let pontosBrutos = cacheValido ? entradaCache.pontosBrutos : [];

        if (!cacheValido) {
            try {
                const chavesLotes = await listarLotesMaquina(mac, hoje);
                const recentes = chavesLotes.slice(-6);
                const comMetricas = await Promise.all(recentes.map(async (chave) => (
                    await loteTemMetricas(chave) ? chave : null
                )));
                const conteudos = await Promise.all(
                    comMetricas.filter(Boolean).map((chave) => lerJsonS3(chave).catch(() => null))
                );

                for (const doc of conteudos) {
                    if (!doc || !Array.isArray(doc.metricas)) continue;
                    for (const reg of doc.metricas) {
                        const ts = Date.parse(reg.timestamp);
                        if (Number.isNaN(ts)) continue;
                        pontosBrutos.push({
                            ts,
                            hora: horaFormatada(new Date(ts)),
                            leituras: extrairLeituras(reg)
                        });
                    }
                }

                for (const chaveAntiga of cachePontosMaquina.keys()) {
                    if (!chaveAntiga.endsWith(`|${hoje}`)) cachePontosMaquina.delete(chaveAntiga);
                }
                cachePontosMaquina.set(chaveCache, {
                    expiraEm: Date.now() + CACHE_LOTES_MS,
                    pontosBrutos
                });
            } catch (erroS3) {
                console.warn(`[Alertas S3] Sem lotes disponíveis para ${mac}:`, erroS3.message);
            }
        }

        pontosBrutos.sort((a, b) => a.ts - b.ts);
        const ultimoPonto = pontosBrutos[pontosBrutos.length - 1] || null;
        const semDados = !ultimoPonto || (agora.getTime() - ultimoPonto.ts) > LIMITE_SEM_DADOS_MINUTOS * 60_000;

        // Monta dinamicamente as métricas configuradas no perfil do servidor
        const metricasConfiguradas = componentes.map((comp) => ({
            id: String(comp.coluna || "").toLowerCase(),
            rotulo: comp.nome,
            recurso: comp.recurso,
            unidade: comp.unidade || "%",
            operador: comp.operador || ">",
            atencao: comp.atencao,
            critico: comp.critico,
            operador2: comp.operador2,
            atencao2: comp.atencao2,
            critico2: comp.critico2
        }));

        // Fallback caso o perfil ainda não tenha componentes cadastrados
        if (!metricasConfiguradas.length) {
            metricasConfiguradas.push(
                { id: "cpu_percent", rotulo: "CPU", recurso: "CPU", unidade: "%", operador: ">", atencao: 70, critico: 85 },
                { id: "ram_percent", rotulo: "RAM", recurso: "RAM", unidade: "%", operador: ">", atencao: 70, critico: 85 }
            );
        }

        const historico = {};
        const limites = {};

        for (const met of metricasConfiguradas) {
            historico[met.id] = slots.map((slot) => {
                const noSlot = pontosBrutos.filter((p) => p.ts >= slot.inicioMs && p.ts < slot.fimMs);
                const amostra = noSlot[noSlot.length - 1] || null;
                return {
                    hora: slot.hora,
                    valor: amostra?.leituras.get(met.id)?.valor ?? null
                };
            });

            limites[met.id] = {
                operador: met.operador,
                atencao: met.atencao,
                critico: met.critico,
                operador2: met.operador2,
                atencao2: met.atencao2,
                critico2: met.critico2,
                unidade: met.unidade,
                rotulo: met.rotulo
            };
        }

        let status = "normal";
        const metricasEmAlerta = [];

        if (semDados) {
            status = "semdados";
        } else {
            for (const comp of componentes) {
                const col = String(comp.coluna || "").toLowerCase();
                const leitura = ultimoPonto.leituras.get(col);
                if (!leitura) continue;

                const nivel = avaliarComponente(leitura.valor, comp);
                if (nivel !== "normal") {
                    metricasEmAlerta.push({
                        metrica: col,
                        coluna: col,
                        recurso: comp.recurso,
                        nome: comp.nome,
                        valor: Number(leitura.valor.toFixed(1)),
                        unidade: leitura.unidade || comp.unidade || "%",
                        nivel,
                        limiteAtencao: comp.atencao,
                        limiteCritico: comp.critico
                    });
                    if (nivel === "critico") status = "critico";
                    else if (nivel === "atencao" && status !== "critico") status = "atencao";
                }
            }
        }

        let desde = ultimoPonto ? ultimoPonto.hora : horaAtualizacao;
        if (status === "critico" || status === "atencao") {
            for (let i = pontosBrutos.length - 1; i >= 0; i -= 1) {
                const p = pontosBrutos[i];
                const violou = componentes.some((comp) => {
                    const l = p.leituras.get(String(comp.coluna || "").toLowerCase());
                    return l && avaliarComponente(l.valor, comp) !== "normal";
                });
                if (violou) desde = p.hora;
                else break;
            }
        }

        const chamados = await chamadosPromise;
        const chamadosDoServidor = chamados.porServidor.get(String(srv.id_servidor)) || [];
        const chamadoAberto = chamadosDoServidor.find((item) => !item.concluido) || null;
        const chamado = chamadoAberto
            ? {
                chave: chamadoAberto.chave,
                url: chamadoAberto.url,
                status: chamadoAberto.status,
                titulo: chamadoAberto.titulo
            }
            : null;

        // Concluir os chamados remove o alerta da resposta, sem apagar registros.
        // Servidores normais continuam presentes para o KPI Normal.
        if (status !== "normal" && chamadosDoServidor.length > 0 && !chamadoAberto) return null;

        return {
            id: String(srv.id_servidor),
            nome: srv.nome,
            mac,
            perfil: srv.nome_perfil,
            perfilId: srv.id_perfil_servidor,
            status,
            desde,
            ultimaColeta: ultimoPonto ? ultimoPonto.hora : null,
            metricasDisponiveis: metricasConfiguradas,
            limites,
            chamado,
            metricasEmAlerta,
            historico
        };
    }));

    const chamados = await chamadosPromise;
    const resolucaoChamados = jiraChamadosService.calcularResolucao(chamados.chamados, servidoresBanco);

    return { horaAtualizacao, servidores: servidoresProcessados.filter(Boolean), resolucaoChamados };
}

module.exports = { obterAlertasServidores, abrirOuObterChamadoJira };
