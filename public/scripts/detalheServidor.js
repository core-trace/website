(() => {
    const dialogo = document.getElementById("detalhes-servidor");
    const conteudo = document.getElementById("detalhes-conteudo");
    const graficos = [];
    let servidorAtual;
    let botaoOrigem;

    // Cenários fixos: nenhuma coleta, chamada à API ou atualização aleatória.
    const cenarios = {
        "cart-api-07": {
            nucleos: [98, 97, 96, 99, 95, 97, 96, 98], capacidade: 16, disponivel: "4,48",
            carga: "9,8 / 9,2 / 7,6", capacidadeCarga: "1,15", iowait: 2, swap: 8,
            livre: 74, leitura: 12, escrita: 4, iops: "120 IOPS de leitura · 45 IOPS de escrita",
            recebimento: 2.4, envio: 0.8,
            alerta: "CPU acima de 95% há 6 minutos",
            regra: "Regra do perfil · atenção > 85% · crítico > 95% · persistência 3 min",
            containers: [
                { nome: "carrinho-api", cpu: 180, memoria: "1,2 GiB", leitura: 5, escrita: 2, entrada: 1.4, saida: 0.4 },
                { nome: "carrinho-worker", cpu: 95, memoria: "680 MiB", leitura: 4, escrita: 1, entrada: 0.6, saida: 0.2 },
                { nome: "redis", cpu: 8, memoria: "256 MiB", leitura: 2, escrita: 0.8, entrada: 0.3, saida: 0.15 },
                { nome: "nginx", cpu: 3, memoria: "96 MiB", leitura: 1, escrita: 0.2, entrada: 0.1, saida: 0.05 }
            ]
        },
        "cart-api-12": {
            offline: true, nucleos: [], capacidade: 16,
            alerta: "Servidor sem comunicação há 3 horas",
            regra: "Última coleta às 11:32 · histórico preservado · sem dados atuais de recursos e containers",
            containers: []
        },
        "pay-db-02": {
            nucleos: [62, 64, 60, 66, 61, 65, 63, 63], capacidade: 32, disponivel: "1,92",
            carga: "5,2 / 4,8 / 4,1", capacidadeCarga: "0,60", iowait: 5, swap: 18,
            livre: 24, leitura: 18, escrita: 9, iops: "240 IOPS de leitura · 110 IOPS de escrita",
            recebimento: 1.8, envio: 1.2,
            alerta: "Memória RAM acima de 90% há 8 minutos",
            regra: "Regra do perfil · atenção > 80% · crítico > 90% · persistência 3 min",
            containers: [
                { nome: "payments-db", cpu: 120, memoria: "20 GiB", leitura: 14, escrita: 7, entrada: 1.2, saida: 0.8 },
                { nome: "payments-backup", cpu: 42, memoria: "1,5 GiB", leitura: 3, escrita: 1.5, entrada: 0.4, saida: 0.3 },
                { nome: "payments-exporter", cpu: 4, memoria: "128 MiB", leitura: 1, escrita: 0.5, entrada: 0.2, saida: 0.1 }
            ]
        }
    };
    const numero = (valor) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const canvas = (id, descricao) => `<div class="servidor-grafico"><canvas id="${id}" role="img" aria-label="${descricao}">${descricao}</canvas></div>`;

    function destruirGraficos() {
        graficos.splice(0).forEach((grafico) => grafico.destroy());
    }

    function renderizarPainel(servidor, cenario) {
        const offline = Boolean(cenario.offline);
        dialogo.dataset.offline = String(offline);
        texto("detalhes-titulo", servidor.nome);
        texto("detalhes-status", offline ? "Sem comunicação" : "Crítico · reportando");
        texto("detalhes-perfil", `${servidor.perfil} · Linux · 8 CPUs lógicas · ${offline ? "uptime indisponível" : `uptime ${servidor.uptime}`}`);
        texto("detalhes-coleta", `${offline ? "Última coleta há 3 h" : "Última coleta há 20 s"} · dados ilustrativos · últimas 24 horas`);
        const nucleos = cenario.nucleos.map((uso, indice) => `<div class="servidor-nucleo"><label for="nucleo-${indice}">CPU ${indice}</label><meter id="nucleo-${indice}" min="0" max="100" value="${uso}">${uso}%</meter><span>${uso}%</span></div>`).join("");

        // Conteúdo gerado apenas a partir dos cenários fixos desta página.
        conteudo.innerHTML = `
            <div class="servidor-alerta"><strong>${cenario.alerta}</strong><p>${cenario.regra}</p></div>
            <section class="servidor-card" aria-labelledby="titulo-cpu">
                <div class="servidor-card-cabecalho">
                    <h3 id="titulo-cpu">Uso de CPU</h3><span class="servidor-cpu-valor">${servidor.cpu}</span>
                    <label class="servidor-periodo"><select id="detalhes-periodo" aria-label="Período de todos os gráficos"><option value="24">Últimas 24 horas</option><option value="6">Últimas 6 horas</option></select></label>
                </div>
                ${canvas("servidor-chart-cpu", "Histórico de uso de CPU em porcentagem")}
                ${offline ? '<p class="servidor-legenda">Sem dados atuais por CPU lógica. As lacunas no gráfico indicam ausência de coleta.</p>' : `
                    <div class="servidor-nucleos">${nucleos}</div>
                    <div class="servidor-notas"><span>Carga 1 / 5 / 15 min: ${cenario.carga}</span><span class="servidor-escrita">5 min: ${cenario.capacidadeCarga}× capacidade</span><span>Iowait: ${cenario.iowait}%</span></div>`}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-ram">
                <h3 id="titulo-ram">Memória RAM · ${offline ? "sem dados atuais" : `uso ${servidor.ram}`}</h3>
                ${canvas("servidor-chart-ram", "Histórico de uso de memória RAM em porcentagem")}
                ${offline ? '<p class="servidor-legenda">Memória disponível e swap indisponíveis desde a última coleta.</p>' : `
                    <p class="servidor-notas">Disponível: ${cenario.disponivel} GiB · capacidade total: ${cenario.capacidade} GiB</p>
                    <p class="servidor-legenda">Capacidade exibida porque foi selecionada neste perfil. Livre, em uso e cache: não selecionados.</p>
                    <p class="servidor-notas"><span>Swap: ${cenario.swap}% ocupado</span><span>Entrada: 0 KiB/s · saída: 0 KiB/s</span></p>`}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-disco">
                <h3 id="titulo-disco">Disco · /dados · ${offline ? "sem dados atuais" : `ocupação ${servidor.disco}`} · I/O em MiB/s</h3>
                <div class="servidor-notas">${offline ? '<span>Leitura e escrita: sem dados atuais</span>' : `<strong>Livre: ${cenario.livre} GiB</strong><span class="servidor-leitura">Leitura: ${cenario.leitura} MiB/s</span><span class="servidor-escrita">Escrita: ${cenario.escrita} MiB/s</span>`}</div>
                ${canvas("servidor-chart-disco", "Histórico de leitura e escrita do disco em MiB por segundo")}
                <p class="servidor-legenda">${offline ? "Último dispositivo identificado: sda · IOPS indisponíveis" : `Dispositivo sda · ${cenario.iops}`}</p>
                <p class="servidor-legenda">Tempo médio estimado e inodes: não selecionados neste perfil.</p>
                ${servidor.nome === "pay-db-02" ? '<p class="servidor-notas servidor-escrita">Previsão de espaço em /dados: 14 dias · estimativa por volume.</p>' : ''}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-rede">
                <h3 id="titulo-rede">Rede · eth0 ${offline ? "sem dados atuais" : "ativa"} · tráfego em MiB/s</h3>
                <div class="servidor-notas">${offline ? '<span>Recebimento e envio: sem dados atuais</span>' : `<strong class="servidor-leitura">Recebimento: ${numero(cenario.recebimento)} MiB/s</strong><strong class="servidor-envio">Envio: ${numero(cenario.envio)} MiB/s</strong>`}</div>
                ${canvas("servidor-chart-rede", "Histórico de recebimento e envio de rede em MiB por segundo")}
                <p class="servidor-legenda">${offline ? "Erros e descartes indisponíveis desde a última coleta." : "Erros entrada/saída: 0 / 0 eventos/s · descartes entrada/saída: 0 / 0 pacotes/s"}</p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-containers">
                <h3 id="titulo-containers">Containers Docker · ${offline ? "sem dados atuais" : `${cenario.containers.length} em execução`}</h3>
                ${offline ? '<p class="servidor-legenda">Sem comunicação com o agente. Não é possível confirmar o estado dos containers.</p>' : `
                    <p class="servidor-legenda">Identificados automaticamente · mesmas métricas para todos</p>
                    <div class="servidor-tabela-scroll" role="region" aria-label="Containers do servidor" tabindex="0">
                        <table class="servidor-tabela"><thead><tr><th scope="col">Container</th><th scope="col">CPU¹</th><th scope="col">Memória</th><th scope="col">I/O e rede</th><th scope="col">Estado</th></tr></thead>
                        <tbody>${cenario.containers.map((container, indice) => `
                            <tr><td>${container.nome}</td><td>${container.cpu}%</td><td>${container.memoria}</td><td><button type="button" class="servidor-container-botao" data-container="${indice}" aria-expanded="false" aria-controls="container-metricas-${indice}" aria-label="Ver métricas de ${container.nome}">Ver métricas</button></td><td class="servidor-envio">Executando</td></tr>
                            <tr class="servidor-container-metricas" id="container-metricas-${indice}" hidden><td colspan="5"><dl>
                                <div><dt>Leitura</dt><dd>${numero(container.leitura)} MiB/s</dd></div><div><dt>Escrita</dt><dd>${numero(container.escrita)} MiB/s</dd></div>
                                <div><dt>Recebimento</dt><dd>${numero(container.entrada)} MiB/s</dd></div><div><dt>Envio</dt><dd>${numero(container.saida)} MiB/s</dd></div>
                            </dl></td></tr>`).join("")}</tbody></table>
                    </div><p class="servidor-legenda">¹ CPU na convenção Docker: 100% equivale a uma CPU lógica; pode ultrapassar 100%.</p>`}
            </section>`;
    }

    function criarGraficos(horas = 24) {
        destruirGraficos();
        if (typeof Chart === "undefined") {
            conteudo.querySelectorAll(".servidor-grafico").forEach((area) => {
                area.textContent = "Não foi possível carregar os gráficos. Recarregue a página para tentar novamente.";
            });
            return;
        }
        const cenario = cenarios[servidorAtual.nome];
        const offline = Boolean(cenario.offline);
        const financeiro = servidorAtual.nome === "pay-db-02";
        // 25 amostras horárias, encerrando às 14:32. O servidor offline não possui as três últimas.
        const rotulos = Array.from({ length: 25 }, (_, indice) => `${String((14 + indice) % 24).padStart(2, "0")}:32`);
        const cpu = [42, 41, 46, 44, 48, 53, 61, 55, 67, 64, 72, 65, 69, 77, 81, 79, 83, 84, 86, 88, 90, 91, 93, 94, 97];
        const ram = [58, 58, 59, 61, 63, 62, 61, 64, 66, 67, 65, 67, 66, 67, 65, 66, 67, 66, 67, 68, 67, 68, 67, 68, 72];
        const leitura = [4, 3, 6, 5, 8, 7, 6, 10, 8, 9, 7, 12, 11, 8, 12, 9, 11, 10, 13, 11, 10, 9, 10, 11, 12];
        const escrita = [1, 2, 1, 3, 2, 2, 4, 3, 3, 2, 5, 4, 3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 5, 3, 4];
        const entrada = [0.8, 0.7, 1, 1.1, 1.2, 1, 0.8, 1.3, 1.4, 1.2, 1.1, 1.5, 1.7, 1.9, 1.5, 1.8, 2, 1.7, 2.1, 1.9, 2.2, 2, 2.3, 2.2, 2.4];
        const saida = [0.2, 0.15, 0.3, 0.35, 0.4, 0.3, 0.2, 0.6, 0.35, 0.45, 0.6, 0.8, 0.7, 0.65, 0.6, 0.8, 0.7, 0.6, 0.9, 0.7, 0.8, 0.7, 0.9, 0.8, 0.8];
        const ajustar = (valores, fator = 1) => valores.map((valor, indice) => offline && indice > 21 ? null : Number((valor * fator).toFixed(2))).slice(-horas - 1);
        const serie = (label, valores, cor, fator = 1) => ({ label, data: ajustar(valores, fator), borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: false });
        const configuracoes = [
            ["cpu", [serie("CPU", cpu, "#cc0301", financeiro ? 63 / 97 : offline ? 0.58 : 1)], "%", 100],
            ["ram", [serie("RAM", ram, "#477da7", financeiro ? 94 / 72 : offline ? 0.82 : 1)], "%", 100],
            ["disco", [serie("Leitura", leitura, "#477da7", financeiro ? 1.5 : 1), serie("Escrita", escrita, "#a76800", financeiro ? 2.25 : 1)], " MiB/s", financeiro ? 30 : 20],
            ["rede", [serie("Recebimento", entrada, "#477da7", financeiro ? 0.75 : 1), serie("Envio", saida, "#15865c", financeiro ? 1.5 : 1)], " MiB/s", 3]
        ];
        configuracoes.forEach(([id, datasets, unidade, maximo]) => {
            const elemento = document.getElementById(`servidor-chart-${id}`);
            elemento.setAttribute("aria-label", `${elemento.textContent}. Últimas ${horas} horas${offline ? "; sem coleta nas últimas 3 horas" : ""}.`);
            graficos.push(new Chart(elemento, {
                type: "line",
                data: { labels: rotulos.slice(-horas - 1), datasets },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    locale: "pt-BR", interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 12, boxHeight: 2, color: "#777278", font: { family: "Poppins", size: 10 } } },
                        tooltip: { callbacks: { label: (contexto) => `${contexto.dataset.label}: ${numero(contexto.parsed.y)}${unidade}` } }
                    },
                    scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: function (valor, indice, marcas) {
                            const intervalo = Math.ceil((marcas.length - 1) / 4);
                            return indice % intervalo === 0 || indice === marcas.length - 1 ? this.getLabelForValue(valor) : null;
                        }, color: "#777278", font: { family: "Poppins", size: 10 } } },
                        y: { min: 0, max: maximo, border: { display: false }, grid: { color: "#e8e8e8" }, ticks: { maxTicksLimit: 3, color: "#777278", font: { family: "Poppins", size: 10 }, callback: (valor) => `${numero(valor)}${unidade === "%" ? "%" : ""}` } }
                    }
                }
            }));
        });
    }

    document.addEventListener("abrir-detalhes-servidor", (evento) => {
        const servidor = evento.detail;
        if (!cenarios[servidor.nome]) return;
        botaoOrigem = document.activeElement;
        servidorAtual = servidor;
        destruirGraficos();
        renderizarPainel(servidor, cenarios[servidor.nome]);
        dialogo.showModal();
        dialogo.scrollTop = 0;
        criarGraficos();
    });

    conteudo.addEventListener("change", (evento) => {
        if (evento.target.id !== "detalhes-periodo") return;
        const horas = Number(evento.target.value);
        criarGraficos(horas);
        const offline = cenarios[servidorAtual.nome].offline;
        texto("detalhes-coleta", `${offline ? "Última coleta há 3 h" : "Última coleta há 20 s"} · dados ilustrativos · últimas ${horas} horas`);
    });

    conteudo.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-container]");
        if (!botao) return;
        const linha = document.getElementById(botao.getAttribute("aria-controls"));
        linha.hidden = !linha.hidden;
        botao.setAttribute("aria-expanded", String(!linha.hidden));
        botao.textContent = linha.hidden ? "Ver métricas" : "Ocultar métricas";
        const container = cenarios[servidorAtual.nome].containers[Number(botao.dataset.container)];
        botao.setAttribute("aria-label", `${linha.hidden ? "Ver" : "Ocultar"} métricas de ${container.nome}`);
    });

    dialogo.addEventListener("click", (evento) => {
        if (evento.target !== dialogo) return;
        const limites = dialogo.getBoundingClientRect();
        if (evento.clientX < limites.left || evento.clientX > limites.right || evento.clientY < limites.top || evento.clientY > limites.bottom) dialogo.close();
    });
    dialogo.addEventListener("close", () => {
        destruirGraficos();
        if (botaoOrigem?.isConnected) botaoOrigem.focus({ preventScroll: true });
    });
})();
