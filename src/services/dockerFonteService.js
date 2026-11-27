// Fonte alternativa apenas para requisições da dashboard Docker.
const fs = require("node:fs/promises");
const path = require("node:path");
const raiz = path.resolve(__dirname, "../../data/docker");

function local(req) {
    if (req.query.dashboard !== "docker") return false;
    const fonte = process.env.DOCKER_DATA_SOURCE || "s3";
    if (!["s3", "local"].includes(fonte)) throw new Error("DOCKER_DATA_SOURCE deve ser local ou s3.");
    return fonte === "local";
}
function caminho(chave) {
    if (typeof chave !== "string" || !chave.startsWith("client/resumos/")
        || chave.split("/").some((parte) => parte === ".." || parte === ".") || chave.includes("\\")) {
        throw new Error("Caminho Docker local inválido.");
    }
    return path.join(raiz, chave);
}
async function listar(prefixo) {
    caminho(prefixo);
    const manifesto = JSON.parse(await fs.readFile(path.join(raiz, "manifesto.json"), "utf8"));
    const chaves = manifesto.arquivos.filter((chave) => chave.startsWith(prefixo));
    if (!chaves.length) throw new Error("Não há documentos Docker locais para este servidor.");
    // Arquivo removido deve produzir erro, nunca histórico incompleto silencioso.
    return Promise.all(chaves.map(async (Key) => ({ Key, Size: (await fs.stat(caminho(Key))).size })));
}
async function ler(chave) {
    return fs.readFile(caminho(chave), "utf8");
}
async function referencia(res) {
    const manifesto = JSON.parse(await fs.readFile(path.join(raiz, "manifesto.json"), "utf8"));
    res.set("X-Docker-Referencia", manifesto.fim);
}
module.exports = { local, listar, ler, referencia };
