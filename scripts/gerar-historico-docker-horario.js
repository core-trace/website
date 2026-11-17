// Resumos sintéticos por hora: mesma estrutura de métricas do histórico diário.
const fs = require("node:fs");
const path = require("node:path");
const raiz = path.join(__dirname, "../public/data");
const modelo = JSON.parse(fs.readFileSync(path.join(raiz, "docker-historico/data=2026-11-29/resumo.json"), "utf8"));
const destino = path.join(raiz, "docker-horario");
fs.mkdirSync(destino, { recursive: true });
const fim = Date.parse("2026-11-29T22:00:00-03:00");
const arquivos = [];
for (let i = 0; i < 48; i++) {
    const doc = structuredClone(modelo);
    const instante = fim - (47 - i) * 3600000;
    const inicio = new Date(instante - 3600000).toISOString();
    const termino = new Date(instante).toISOString();
    doc.data = new Date(instante - 3 * 3600000).toISOString().slice(0, 10);
    doc.granularidade = "hora";
    doc.intervalo = { inicio, fim: termino };
    doc.cenario = "monitoramento_horario_simulado";
    doc.resumos.containers.forEach((c, j) => {
        const fator = 0.65 + (1 + Math.sin(i / 3 + j)) * 0.3;
        function variar(obj) {
            for (const valor of Object.values(obj)) {
                if (!valor || typeof valor !== "object") continue;
                if (valor.tipo === "medicao") {
                    for (const chave of ["media", "minimo", "maximo"]) {
                        if (typeof valor[chave] === "number") valor[chave] = Math.round(valor[chave] * fator * 100) / 100;
                    }
                } else if (valor.tipo === "contador_acumulado" && typeof valor.ultimo_valor === "number") {
                    valor.ultimo_valor = Math.round(valor.ultimo_valor * (1 + i / 24));
                } else variar(valor);
            }
        }
        variar(c);
        c.primeira_observacao = inicio;
        c.ultima_observacao = termino;
        c.restart_count = j === 1 && i >= 36 ? 1 : 0;
        c.reinicios.total.ultimo_valor = c.restart_count;
        c.started_at = j === 1 && i >= 36 ? new Date(fim - 11 * 3600000).toISOString() : "2026-11-18T09:00:00-03:00";
        c.status = j === 1 && i === 35 ? "exited" : "running";
        c.finished_at = c.status === "exited" ? termino : null;
        c.exit_code = c.status === "exited" ? 1 : 0;
        c.oom_killed = false;
        const uso = c.memoria.uso;
        for (const chave of ["media", "minimo", "maximo"]) {
            c.memoria.utilizada[chave] = c.memoria.limite.ultimo_valor * uso[chave] / 100;
        }
    });
    doc.resumos.logs.forEach((log, j) => {
        log.niveis.error = structuredClone(log.niveis.warn);
        let total = 0;
        for (const [nivel, medida] of Object.entries(log.niveis)) {
            medida.total_observado = /error|err/i.test(nivel) ? (j === 1 && i === 35 ? 12 : (i + j) % 3) : 20 + (i * 7 + j) % 40;
            medida.amostras_validas = medida.total_observado;
            total += medida.total_observado;
        }
        log.total.total_observado = total;
        log.total.amostras_validas = total;
    });
    doc.resumos.eventos = [];
    const nome = `hora-${String(i).padStart(2, "0")}.json`;
    fs.writeFileSync(path.join(destino, nome), JSON.stringify(doc, null, 2) + "\n");
    arquivos.push(nome);
}
fs.writeFileSync(path.join(destino, "indice.json"), JSON.stringify({ demonstracao: true, arquivos }, null, 2) + "\n");
console.log(`${arquivos.length} resumos horários simulados gerados.`);
