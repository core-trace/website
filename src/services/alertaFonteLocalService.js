// Fonte local exclusiva da dashboard de alertas.
// Le os resumos que a dashboard Docker ja mantem em data/docker, sem alterar essa pasta.
const fs = require("node:fs/promises");
const path = require("node:path");

const raiz = path.resolve(__dirname, "../../data/docker");

function caminho(chave) {
    if (typeof chave !== "string" || !chave.startsWith("client/resumos/")
        || chave.split("/").some((parte) => parte === ".." || parte === ".")
        || chave.includes("\\")) {
        throw new Error("Caminho local de alertas invalido.");
    }
    return path.join(raiz, chave);
}

// Os resumos locais trazem o valor atual de cada recurso, mas nao a serie de
// lotes usada no modo S3. Devolve um unico ponto, reaproveitando todo o
// processamento de limites ja feito por alertaService.
async function carregarPontos(mac, data) {
    if (!/^[A-Z0-9:_-]+$/.test(String(mac)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
        throw new Error("MAC ou data invalidos para a fonte local.");
    }

    const chave = `client/resumos/maquina=${mac}/data=${data}/resumo.json`;
    const manifesto = JSON.parse(await fs.readFile(path.join(raiz, "manifesto.json"), "utf8"));
    if (!manifesto.arquivos.includes(chave)) {
        throw new Error("Nao ha resumo local para este servidor nesta data.");
    }

    const resumo = JSON.parse(await fs.readFile(caminho(chave), "utf8"));
    const instante = resumo.ultima_coleta || resumo.recursos_estado?.[0]?.instante;
    const ts = Date.parse(instante || "");
    if (Number.isNaN(ts)) throw new Error("Resumo local sem instante de coleta valido.");

    const leituras = new Map();
    for (const recurso of resumo.recursos_estado || []) {
        const id = String(recurso.metrica || "").toLowerCase();
        const valor = Number(recurso.valor_atual);
        if (!id || !Number.isFinite(valor)) continue;
        leituras.set(id, {
            metrica: id,
            campoOrigem: id.toUpperCase(),
            valor,
            unidade: recurso.unidade || ""
        });
    }
    if (!leituras.size) throw new Error("Resumo local sem leituras de recursos.");

    return [{ ts, leituras }];
}

module.exports = { carregarPontos };
