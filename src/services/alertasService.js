const crypto = require("crypto");
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const servidorModel = require("../models/servidorModel");

const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1"
});

const BUCKET = (process.env.S3_BUCKET || "bucket-coretrace").trim();
const PREFIXO_LOTES = normalizarPrefixo(process.env.S3_PREFIX || "client/lotes/");

const JANELA_GRAFICO_MINUTOS = 60;
const PASSO_GRADE_MINUTOS = 10;
const LIMITE_SEM_DADOS_MINUTOS = 15;

function normalizarPrefixo(prefixo) {
    const limpo = String(prefixo || "").trim();
    return limpo.endsWith("/") ? limpo : `${limpo}/`;
}

function normalizarMac(mac) {
    return String(mac || "").trim().toUpperCase();
}

function dataHojeLocal() {
    const agora = new Date();
    const partes = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(agora);
    return partes; // YYYY-MM-DD
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

/**
 * Percorre recursivamente o objeto de uma captura do formato_gold.py
 * e extrai todas as leituras válidas ({ metrica, valor, status, unidade }).
 */
function extrairLeituras(no, destino = new Map()) {
    if (!no || typeof no !== "object") return destino;

    if (Array.isArray(no)) {
        for (const item of no) {
            extrairLeituras(item, destino);
        }
        return destino;
    }

    if ("metrica" in no && "valor" in no && "status" in no) {
        if (no.status === "ok" && typeof no.valor === "number" && Number.isFinite(no.valor)) {
            const chave = String(no.metrica).toLowerCase();
            const existente = destino.get(chave);
            // Para recursos múltiplos (ex: discos/volumes), mantém o pior (maior) percentual
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
        if (valor && typeof valor === "object") {
            extrairLeituras(valor, destino);
        }
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

function mapearCategoriaGrafico(comp) {
    const col = String(comp.coluna || "").toLowerCase();
    const rec = String(comp.recurso || "").toLowerCase();
    if (col === "cpu_percent" || rec === "cpu") return "cpu";
    if (col === "ram_percent" || rec === "ram") return "ram";
    if (rec === "rede" || col.startsWith("net_")) return "rede";
    if (rec === "disco" || col.startsWith("disk_")) return "disco";
    return col;
}

function gerarEtiquetaJira(mac, recurso, metrica, campoOrigem = "") {
    const identificador = [mac, recurso, metrica, campoOrigem].join("|").toLowerCase();
    const hash = crypto.createHash("sha256").update(identificador, "utf-8").digest("hex");
    return `coretrace-${hash.substring(0, 24)}`;
}

async function buscarChamadoJiraPorEtiqueta(etiqueta) {
    const baseUrl = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    const projeto = process.env.JIRA_PROJECT_KEY || "CT";

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
            body: JSON.stringify({
                jql,
                maxResults: 1,
                fields: ["summary", "status"]
            })
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
    const projeto = process.env.JIRA_PROJECT_KEY || "CT";

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
    const valorFmt = metricaPrincipal ? `${Number(metricaPrincipal.valor).toFixed(1)}%` : "indisponível";
    const summary = `[${prefixoNivel}] Alerta em ${recurso} (${valorFmt}) | Servidor ${nomeServidor} (${mac})`;

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
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                {
                                    type: "text",
                                    text: `Incidente identificado pelo CoreTrace no servidor ${nomeServidor} (MAC: ${mac}, Perfil: ${perfil}). Métrica: ${metrica} = ${valorFmt}.`
                                }
                            ]
                        }
                    ]
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
    const agora = new Date();
    const horaAtualizacao = horaFormatada(agora);
    const hoje = dataHojeLocal();
    const slots = montarGradeTempo(agora);

    const resultado = await Promise.all(servidoresBanco.map(async (srv) => {
        const mac = normalizarMac(srv.endereco_mac);
        const componentes = srv.componentes || [];

        let pontosBrutos = [];
        try {
            const chavesLotes = await listarLotesMaquina(mac, hoje);
            // Lê os 6 lotes mais recentes do dia para cobrir a janela de 1h com baixa latência
            const recentes = chavesLotes.slice(-6);
            const conteudos = await Promise.all(recentes.map((chave) => lerJsonS3(chave).catch(() => null)));

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
        } catch (erroS3) {
            console.warn(`[Alertas S3] Falha ao ler lotes de ${mac}:`, erroS3.message);
        }

        pontosBrutos.sort((a, b) => a.ts - b.ts);
        const ultimoPonto = pontosBrutos[pontosBrutos.length - 1] || null;
        const semDados = !ultimoPonto || (agora.getTime() - ultimoPonto.ts) > LIMITE_SEM_DADOS_MINUTOS * 60_000;

        // Monta séries temporais alinhadas à grade do gráfico (cpu, ram, rede)
        const historico = { cpu: [], ram: [], rede: [] };
        for (const slot of slots) {
            const noSlot = pontosBrutos.filter((p) => p.ts >= slot.inicioMs && p.ts < slot.fimMs);
            const amostra = noSlot[noSlot.length - 1] || null;

            historico.cpu.push({
                hora: slot.hora,
                valor: amostra?.leituras.get("cpu_percent")?.valor ?? null
            });
            historico.ram.push({
                hora: slot.hora,
                valor: amostra?.leituras.get("ram_percent")?.valor ?? null
            });

            // Para rede, usa net_percent se existir ou normaliza taxa se configurada
            const netVal = amostra?.leituras.get("net_percent")?.valor ?? null;
            historico.rede.push({
                hora: slot.hora,
                valor: netVal
            });
        }

        // Avalia o estado atual com base na última amostra recebida e nos limites do perfil
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
                        metrica: mapearCategoriaGrafico(comp),
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

        // Calcula desde quando o servidor está no estado atual
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

        // Limites de referência do perfil (CPU por padrão para o gráfico)
        const compCpu = componentes.find((c) => String(c.coluna || "").toLowerCase() === "cpu_percent");
        const compRam = componentes.find((c) => String(c.coluna || "").toLowerCase() === "ram_percent");

        // Consulta chamado no Jira para servidores em alerta
        let chamado = null;
        if (status !== "normal") {
            const alvo = metricasEmAlerta[0] || { recurso: "CPU", coluna: "cpu_percent" };
            const etiqueta = gerarEtiquetaJira(mac, alvo.recurso, alvo.coluna, alvo.coluna.toUpperCase());
            chamado = await buscarChamadoJiraPorEtiqueta(etiqueta);
        }

        return {
            id: String(srv.id_servidor),
            nome: srv.nome,
            mac,
            perfil: srv.nome_perfil,
            perfilId: srv.id_perfil_servidor,
            status,
            desde,
            ultimaColeta: ultimoPonto ? ultimoPonto.hora : null,
            limites: {
                cpu: { atencao: compCpu?.atencao ?? 70, critico: compCpu?.critico ?? 85 },
                ram: { atencao: compRam?.atencao ?? 70, critico: compRam?.critico ?? 85 },
                rede: { atencao: 70, critico: 85 }
            },
            chamado,
            metricasEmAlerta,
            historico
        };
    }));

    return {
        horaAtualizacao,
        servidores: resultado
    };
}

module.exports = {
    obterAlertasServidores,
    abrirOuObterChamadoJira
};
