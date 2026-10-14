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
    if (metrica.categoria) return metrica.categoria;
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
        // Nome, obrigatoriedade e recomendação vêm do banco
        if (Number(componente.exibir_no_card) === 0) return;
        const nome = componente.nome;
        const essencial = Number(componente.essencial) === 1;
        const plataforma = componente.plataforma || undefined;
        let recomendada;
        if (componente.recomendada === null || componente.recomendada === undefined) {
            recomendada = categoria === "carga"
                || colunasRecomendadas.has((componente.nome_coluna || "").toLowerCase());
        } else {
            recomendada = Number(componente.recomendada) === 1;
        }
        grupos.get(categoria).metricas.push({
            id: componente.id_componente,
            nome: nome,
            unidade: componente.unidade,
            essencial: essencial,
            plataforma: plataforma,
            recomendada: recomendada
        });
    });

    for (const categoria of ["cpu", "ram", "disco", "swap", "carga", "rede"]) {
        grupos.get(categoria).metricas.sort(function (a, b) {
            const componenteA = componentes.find(item => item.id_componente === a.id);
            const componenteB = componentes.find(item => item.id_componente === b.id);
            return componenteA.ordem_card - componenteB.ordem_card;
        });
    }
    return [...grupos.values()].filter((grupo) => grupo.metricas.length > 0);
}

function validarEssenciaisCPU(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "cpu" && Number(item.essencial) === 1);
    if (essenciais.length !== 2) {
        return "Catálogo CPU incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "Uso total e uso por CPU lógica são métricas essenciais.";
    }
    return "";
}
function validarEssenciaisRAM(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "ram" && Number(item.essencial) === 1);
    if (essenciais.length !== 4) {
        return "Catálogo RAM incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis.";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "As métricas essenciais de RAM devem permanecer selecionadas.";
    }
    return "";
}
function validarEssenciaisDisco(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "disco" && Number(item.essencial) === 1);
    if (essenciais.length !== 5) {
        return "Catálogo Disco incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis.";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "As métricas essenciais de Disco devem permanecer selecionadas.";
    }
    return "";
}
function validarEssenciaisSwap(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "swap" && Number(item.essencial) === 1);
    if (essenciais.length !== 3) {
        return "Catálogo Swap incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis.";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "As métricas essenciais de Swap devem permanecer selecionadas.";
    }
    return "";
}
function validarEssenciaisCarga(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "carga" && Number(item.essencial) === 1);
    if (essenciais.length !== 2) {
        return "Catálogo Carga média incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis.";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "As cargas médias de cinco e quinze minutos são essenciais.";
    }
    return "";
}
function validarEssenciaisRede(selecionadas, componentes) {
    const essenciais = componentes.filter(item => item.categoria === "rede" && Number(item.essencial) === 1);
    if (essenciais.length !== 4) {
        return "Catálogo Rede incompleto. Recrie o banco com o script.sql atualizado antes de salvar perfis.";
    }
    for (const componente of essenciais) {
        const selecionada = selecionadas.some(item => Number(item.id) === Number(componente.id_componente));
        if (!selecionada) return "As quatro métricas essenciais de Rede devem permanecer selecionadas.";
    }
    return "";
}
module.exports = { agruparMetricas, validarEssenciaisCPU, validarEssenciaisRAM, validarEssenciaisDisco, validarEssenciaisSwap, validarEssenciaisCarga, validarEssenciaisRede };
