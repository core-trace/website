const dashboardGraficos = (() => {
    const graficos = [];
    const cores = { atencao: '#a76800', critico: '#cc0301' };
    const horario = instante => monitoramentoMock.horario(instante);
    const dataHora = instante => monitoramentoMock.dataHora(instante);

    function renderizar(resumo, mensagem) {
        graficos.splice(0).forEach(grafico => grafico.destroy());
        const semServidores = resumo.servidores.length === 0;
        const semBiblioteca = typeof Chart === 'undefined';
        const descricoes = dashboardDados.recursos.map(recurso => {
            const item = resumo.recursos[recurso];
            return `${recurso}: ${item.atencao} em atenção, ${item.critico} críticos; ${item.monitorados} monitorados, ${item.comDados} com dados e limites válidos.`;
        });
        document.getElementById('recursos-resumo').textContent = descricoes.join(' ');
        document.getElementById('evolucao-resumo').textContent = resumo.evolucao.map(item => `${dataHora(item.instante)}: ${item.comDados ? `${item.atencao} em atenção, ${item.critico} críticos` : 'sem dados'}; ${item.comDados} avaliados, ${item.semDados} sem dados suficientes.`).join(' ');
        document.getElementById('recursos-cobertura').textContent = dashboardDados.recursos.map(recurso => `${recurso}: ${resumo.recursos[recurso].comDados}/${resumo.recursos[recurso].monitorados} com dados e limites`).join(' · ');
        for (const tipo of ['recursos', 'evolucao']) {
            const temDados = tipo === 'recursos' ? Object.values(resumo.recursos).some(item => item.comDados > 0) : resumo.evolucao.some(item => item.comDados > 0);
            const aviso = mensagem || (semServidores ? 'Nenhum servidor no perfil selecionado.' : !temDados ? 'Dados insuficientes para este gráfico.' : semBiblioteca ? 'Não foi possível carregar os gráficos. Recarregue a página.' : '');
            const status = document.getElementById(`${tipo}-status`);
            status.textContent = aviso;
            status.hidden = !aviso;
            document.getElementById(`grafico-${tipo}`).hidden = !!aviso;
            if (aviso) continue;
            const evolucao = tipo === 'evolucao';
            const datasets = ['atencao', 'critico'].map(nivel => ({
                label: nivel === 'atencao' ? 'Atenção' : 'Crítico',
                data: evolucao ? resumo.evolucao.map(item => ({ x: item.instante, y: item[nivel] })) : dashboardDados.recursos.map(recurso => resumo.recursos[recurso].comDados ? resumo.recursos[recurso][nivel] : null),
                backgroundColor: cores[nivel], borderColor: cores[nivel], borderWidth: evolucao ? 2 : 0,
                borderRadius: evolucao ? 0 : 3, maxBarThickness: 32,
                pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: false
            }));
            graficos.push(new Chart(document.getElementById(`grafico-${tipo}`), {
                type: evolucao ? 'line' : 'bar',
                data: { labels: evolucao ? resumo.evolucao.map(item => horario(item.instante)) : dashboardDados.recursos, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false, locale: 'pt-BR',
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18, color: '#777278', font: { family: 'Poppins', size: 11 } } },
                        tooltip: { callbacks: {
                            title: itens => evolucao ? dataHora(resumo.evolucao[itens[0].dataIndex].instante) : itens[0].label,
                            label: item => `${item.dataset.label}: ${item.parsed.y} ${item.parsed.y === 1 ? 'servidor' : 'servidores'}`,
                            footer: itens => {
                                const indice = itens[0].dataIndex;
                                if (evolucao) {
                                    const ponto = resumo.evolucao[indice];
                                    return `${ponto.comDados} de ${resumo.servidores.length} servidores avaliados\n${ponto.semDados} sem dados suficientes nesta coleta`;
                                }
                                const recurso = resumo.recursos[dashboardDados.recursos[indice]];
                                return `${recurso.monitorados} servidores monitorados\n${recurso.comDados} com dados e limites válidos`;
                            }
                        } }
                    },
                    scales: {
                        x: { ...(evolucao ? { type: 'linear', min: resumo.evolucao[0].instante, max: resumo.evolucao.at(-1).instante } : {}), grid: { display: false }, border: { display: false }, ticks: { ...(evolucao ? { callback: valor => resumo.periodo >= 10080 ? dataHora(valor).split(',')[0] : resumo.periodo >= 1440 ? dataHora(valor) : horario(valor) } : {}), maxRotation: 0, maxTicksLimit: evolucao && resumo.periodo >= 10080 ? 8 : 4, color: '#777278', font: { family: 'Poppins', size: 10 } } },
                        y: { beginAtZero: true, suggestedMax: 1, border: { display: false }, title: { display: true, text: 'Servidores', color: '#777278', font: { family: 'Poppins', size: 10 } }, ticks: { precision: 0, maxTicksLimit: 5, color: '#777278', font: { family: 'Poppins', size: 10 } }, grid: { color: '#eee' } }
                    }
                }
            }));
        }
    }
    return { renderizar };
})();
