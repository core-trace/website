// Contrato Gold: logs individuais na raiz; totais em resumos.logs.
// Somente o cenário marcado como simulado é alterado.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const raiz = path.join(__dirname, "../public/data");

function lerIndice(pasta) {
    const diretorio = path.join(raiz, pasta);
    const indice = JSON.parse(fs.readFileSync(path.join(diretorio, "indice.json"), "utf8"));
    if (indice.demonstracao !== true) throw new Error(`A fonte ${pasta} não é uma simulação.`);
    return indice.arquivos.map((arquivo) => {
        const caminho = path.join(diretorio, arquivo);
        const doc = JSON.parse(fs.readFileSync(caminho, "utf8"));
        if (doc.dados_simulados !== true) throw new Error(`Não é permitido gerar logs em ${arquivo}.`);
        return { caminho, doc };
    });
}

function periodo(doc) {
    if (doc.intervalo) return { inicio: Date.parse(doc.intervalo.inicio), fim: Date.parse(doc.intervalo.fim) };
    const inicio = Date.parse(doc.data + "T00:00:00-03:00");
    return { inicio, fim: inicio + 86400000 };
}

function mensagem(nome, nivel, indice) {
    const textos = {
        INFO: ["Healthcheck concluído com sucesso", "Conexão com dependências estabelecida", "Processamento concluído"],
        WARN: ["Tempo de resposta acima do esperado", "Nova tentativa de conexão agendada"],
        ERROR: ["Timeout ao acessar dependência", "Falha ao processar solicitação"],
        UNKNOWN: ["Registro sem classificação de nível"],
        DEBUG: ["Inspeção do estado interno"],
        TRACE: ["Etapa de processamento registrada"],
        FATAL: ["Erro irrecuperável registrado"]
    };
    const opcoes = textos[nivel] || textos.UNKNOWN;
    return `[SIMULADO] ${nome} · ${opcoes[indice % opcoes.length]}`;
}

function gerarMensagens(doc) {
    const { inicio, fim } = periodo(doc);
    const registros = [];
    for (const grupo of doc.resumos.logs || []) {
        const total = Object.values(grupo.niveis).reduce((s, m) => s + m.total_observado, 0);
        let posicao = 0;
        for (const [nivel, medida] of Object.entries(grupo.niveis)) {
            if (!Number.isSafeInteger(medida.total_observado) || medida.total_observado < 0) throw new Error("Contagem de logs inválida.");
            for (let i = 0; i < medida.total_observado; i++) {
                const timestamp = new Date(inicio + Math.floor((++posicao) * (fim - inicio) / (total + 1))).toISOString();
                const id_captura = createHash("sha256").update(["simulado", grupo.container_id, inicio, fim, nivel, i].join("|")).digest("hex");
                registros.push({ timestamp, container_id: grupo.container_id, nome: grupo.nome,
                    nivel: nivel.toUpperCase(), mensagem: mensagem(grupo.nome, nivel.toUpperCase(), i), id_captura });
            }
        }
    }
    return registros.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function medida(total) {
    return { metrica: null, unidade: "mensagens", tipo: "eventos_intervalo",
        amostras_validas: total, amostras_invalidas: 0, total_observado: total };
}

function atualizarResumo(doc, registros) {
    const { inicio, fim } = periodo(doc);
    doc.logs = registros;
    doc.resumos.inicio = new Date(inicio).toISOString();
    doc.resumos.fim = new Date(fim).toISOString();
    doc.resumos.metodo_media = "aritmetica_das_amostras_validas";
    const grupos = new Map((doc.resumos.logs || []).map((g) => [g.container_id, {
        container_id: g.container_id, nome: g.nome, total: medida(0),
        niveis: Object.fromEntries(Object.keys(g.niveis || {}).map((n) => [n, medida(0)]))
    }]));
    for (const r of registros) {
        if (!grupos.has(r.container_id)) grupos.set(r.container_id, { container_id: r.container_id, nome: r.nome, total: medida(0), niveis: {} });
        const g = grupos.get(r.container_id), nivel = r.nivel.toLowerCase();
        g.niveis[nivel] ||= medida(0);
        for (const m of [g.total, g.niveis[nivel]]) { m.total_observado++; m.amostras_validas++; }
    }
    doc.resumos.logs = [...grupos.values()];
}

function atualizarLogs() {
    const diarios = lerIndice("docker-historico");
    const horarios = lerIndice("docker-horario");
    const faixas = horarios.map(({ doc }) => periodo(doc));
    // As mesmas capturas são reutilizadas nos resumos diários e horários.
    const capturasHorarias = horarios.flatMap(({ doc }) => {
        const registros = gerarMensagens(doc);
        atualizarResumo(doc, registros);
        return registros;
    });
    for (const { doc } of diarios) {
        const { inicio, fim } = periodo(doc);
        const existentes = Array.isArray(doc.logs) ? doc.logs : gerarMensagens(doc);
        const foraDasHoras = existentes.filter((r) => !faixas.some((f) => Date.parse(r.timestamp) > f.inicio && Date.parse(r.timestamp) <= f.fim));
        const dentroDoDia = capturasHorarias.filter((r) => Date.parse(r.timestamp) > inicio && Date.parse(r.timestamp) <= fim);
        const registros = [...new Map([...foraDasHoras, ...dentroDoDia].map((r) => [r.id_captura, r])).values()]
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        atualizarResumo(doc, registros);
    }
    for (const { caminho, doc } of [...diarios, ...horarios]) fs.writeFileSync(caminho, JSON.stringify(doc, null, 2) + "\n");
    console.log(`${diarios.length + horarios.length} JSONs atualizados com mensagens individuais e contagens correspondentes.`);
}

module.exports = { atualizarLogs };
if (require.main === module) atualizarLogs();
