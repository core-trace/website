const categorias = [
    { id: "cpu", nome: "CPU" },
    { id: "ram", nome: "RAM" },
    { id: "disco", nome: "Disco" },
    { id: "swap", nome: "Swap" },
    { id: "carga", nome: "Carga média" },
    { id: "rede", nome: "Rede" },
    { id: "outros", nome: "Outras métricas" }
];

// A tabela componentes não possui categoria; agrupar pela função de captura
// e pelo identificador da coluna mantém os nomes e IDs vindos do banco.
function categoriaDaMetrica(metrica) {
    const funcao = (metrica.funcao_psutil || "").toLowerCase();
    const coluna = (metrica.nome_coluna || "").toLowerCase();

    if (funcao === "getloadavg" || /^(load|carga)_/.test(coluna)) return "carga";
    if (funcao.startsWith("cpu_") || coluna.startsWith("cpu_")) return "cpu";
    if (funcao === "virtual_memory" || /^(ram|memory|mem)_/.test(coluna)) return "ram";
    if (funcao.startsWith("disk_") || /^(disk|disco)_/.test(coluna)) return "disco";
    if (funcao === "swap_memory" || coluna.startsWith("swap_")) return "swap";
    if (funcao.startsWith("net_") || /^(net|network|rede)_/.test(coluna)) return "rede";
    return "outros";
}

// Política inicial de recomendação: selecionar somente componentes presentes
// no catálogo. Não usar IDs fixos, pois eles variam entre bancos.
const colunasRecomendadas = new Set([
    "cpu_percent", "cpu_percent_percpu", "cpu_percpu", "cpu_iowait",
    "ram_percent", "ram_total", "ram_available",
    "disk_percent", "disk_free", "disk_read_bytes", "disk_write_bytes",
    "disk_read_count", "disk_write_count",
    "swap_percent", "swap_sin", "swap_sout",
    "net_bytes_recv", "net_bytes_sent", "net_errin", "net_errout", "net_isup"
]);

function agruparMetricas(componentes) {
    const grupos = new Map(categorias.map((categoria) => [categoria.id, { ...categoria, metricas: [] }]));

    componentes.forEach((componente) => {
        const categoria = categoriaDaMetrica(componente);
        grupos.get(categoria).metricas.push({
            id: componente.id_componente,
            nome: componente.nome,
            unidade: componente.unidade,
            recomendada: categoria === "carga"
                || colunasRecomendadas.has((componente.nome_coluna || "").toLowerCase())
        });
    });

    return [...grupos.values()].filter((grupo) => grupo.metricas.length > 0);
}

module.exports = { agruparMetricas };
