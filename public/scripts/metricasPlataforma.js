// Apresentação do case: preserva os IDs do catálogo, sem alterar captura ou agente.
// Fontes: https://psutil.readthedocs.io/stable/index.html
// https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmi-tasks--performance-monitoring
const metricasPlataforma = (() => {
    const alternativas = [
        [/espera por i\/o/i, 'Interrupções de CPU (%)', '%', 'psutil.cpu_times_percent().interrupt'],
        [/entrada de swap/i, 'Paginação de entrada', 'páginas/s', 'WMI: Win32_PerfFormattedData_PerfOS_Memory.PagesInputPersec'],
        [/saída de swap/i, 'Paginação de saída', 'páginas/s', 'WMI: Win32_PerfFormattedData_PerfOS_Memory.PagesOutputPersec']
    ];

    function adaptar(categorias, sistema) {
        return categorias.map(categoria => ({
            ...categoria,
            metricas: categoria.metricas.flatMap(metrica => {
                const plataforma = (metrica.plataforma || (/linux/i.test(metrica.nome) ? 'linux' : '')).toLowerCase();
                if (!plataforma || plataforma === sistema) return [{ ...metrica }];
                if (sistema !== 'windows' || plataforma !== 'linux') return [];
                const alternativa = alternativas.find(([padrao]) => padrao.test(metrica.nome));
                if (!alternativa) return [];
                const [, nome, unidade, fonte] = alternativa;
                return [{ ...metrica, nome: `${nome} · Windows`, unidade, fonte, plataforma: 'windows' }];
            })
        })).filter(categoria => categoria.metricas.length > 0);
    }
    return { adaptar };
})();
