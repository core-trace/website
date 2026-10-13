(() => {
    const dialogo = document.getElementById("detalhes-servidor");
    const conteudo = document.getElementById("detalhes-conteudo");
    const graficos = [];
    let servidorAtual;
    let botaoOrigem;

    const numero = (valor) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const texto = (id, valor) => { document.getElementById(id).textContent = valor; };
    const canvas = (id, descricao) => `<div class="servidor-grafico"><canvas id="${id}" role="img" aria-label="${descricao}">${descricao}</canvas></div>`;

    function destruirGraficos() {
        graficos.splice(0).forEach((grafico) => grafico.destroy());
    }

    function renderizarPainel(servidor, cenario) {
        texto("detalhes-titulo", servidor.nome);
        texto("detalhes-status", "Crítico · simulação");
        texto("detalhes-perfil", `${servidor.perfil} · ${servidor.sistemaOperacional} · 8 CPUs lógicas · uptime ${servidor.uptime}`);
        texto("detalhes-coleta", `Coleta simulada às 14:32 · dados ilustrativos · últimas 24 horas`);
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

                    <div class="servidor-nucleos">${nucleos}</div>
                    <div class="servidor-notas"><span>Carga 1 / 5 / 15 min: ${cenario.carga}</span><span class="servidor-escrita">5 min: ${cenario.capacidadeCarga}× capacidade</span><span>Iowait: ${cenario.iowait}%</span></div>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-ram">
                <h3 id="titulo-ram">Memória RAM · uso ${servidor.ram}</h3>
                ${canvas("servidor-chart-ram", "Histórico de uso de memória RAM em porcentagem")}

                    <p class="servidor-notas">Disponível: ${cenario.disponivel} GiB · capacidade total: ${cenario.capacidade} GiB</p>
                    <p class="servidor-legenda">Capacidade e disponibilidade ilustrativas deste modelo de monitoramento.</p>
                    <p class="servidor-notas"><span>Swap: ${cenario.swap}% ocupado</span><span>Entrada: 0 KiB/s · saída: 0 KiB/s</span></p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-disco">
                <h3 id="titulo-disco">Disco · /dados · ocupação ${servidor.disco} · I/O em MiB/s</h3>
                <div class="servidor-notas"><strong>Livre: ${cenario.livre} GiB</strong><span class="servidor-leitura">Leitura: ${cenario.leitura} MiB/s</span><span class="servidor-escrita">Escrita: ${cenario.escrita} MiB/s</span></div>
                ${canvas("servidor-chart-disco", "Histórico de leitura e escrita do disco em MiB por segundo")}
                <p class="servidor-legenda">Dispositivo sda · ${cenario.iops}</p>
                <p class="servidor-legenda">Tempo médio estimado e inodes: não incluídos nesta demonstração.</p>
                ${servidor.modelo === "ram" ? '<p class="servidor-notas servidor-escrita">Previsão de espaço em /dados: 14 dias · estimativa por volume.</p>' : ''}
            </section>
            <section class="servidor-card" aria-labelledby="titulo-rede">
                <h3 id="titulo-rede">Rede · eth0 ativa · tráfego em MiB/s</h3>
                <div class="servidor-notas"><strong class="servidor-leitura">Recebimento: ${numero(cenario.recebimento)} MiB/s</strong><strong class="servidor-envio">Envio: ${numero(cenario.envio)} MiB/s</strong></div>
                ${canvas("servidor-chart-rede", "Histórico de recebimento e envio de rede em MiB por segundo")}
                <p class="servidor-legenda">Erros entrada/saída: 0 / 0 eventos/s · descartes entrada/saída: 0 / 0 pacotes/s</p>
            </section>
            <section class="servidor-card" aria-labelledby="titulo-containers">
                <h3 id="titulo-containers">Containers Docker · ${cenario.containers.length} em execução</h3>

                    <p class="servidor-legenda">Containers ilustrativos · mesmas métricas para todos</p>
                    <div class="servidor-tabela-scroll" role="region" aria-label="Containers do servidor" tabindex="0">
                        <table class="servidor-tabela"><thead><tr><th scope="col">Container</th><th scope="col">CPU¹</th><th scope="col">Memória</th><th scope="col">I/O e rede</th><th scope="col">Estado</th></tr></thead>
                        <tbody>${cenario.containers.map((container, indice) => `
                            <tr><td>${container.nome}</td><td>${container.cpu}%</td><td>${container.memoria}</td><td><button type="button" class="servidor-container-botao" data-container="${indice}" aria-expanded="false" aria-controls="container-metricas-${indice}" aria-label="Ver métricas de ${container.nome}">Ver métricas</button></td><td class="servidor-envio">Executando</td></tr>
                            <tr class="servidor-container-metricas" id="container-metricas-${indice}" hidden><td colspan="5"><dl>
                                <div><dt>Leitura</dt><dd>${numero(container.leitura)} MiB/s</dd></div><div><dt>Escrita</dt><dd>${numero(container.escrita)} MiB/s</dd></div>
                                <div><dt>Recebimento</dt><dd>${numero(container.entrada)} MiB/s</dd></div><div><dt>Envio</dt><dd>${numero(container.saida)} MiB/s</dd></div>
                            </dl></td></tr>`).join("")}</tbody></table>
                    </div><p class="servidor-legenda">¹ CPU na convenção Docker: 100% equivale a uma CPU lógica; pode ultrapassar 100%.</p>
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
        const modeloRam = servidorAtual.modelo === "ram";
        // 25 amostras ilustrativas, encerrando às 14:32.
        const rotulos = Array.from({ length: 25 }, (_, indice) => `${String((14 + indice) % 24).padStart(2, "0")}:32`);
        const cpu = [42, 41, 46, 44, 48, 53, 61, 55, 67, 64, 72, 65, 69, 77, 81, 79, 83, 84, 86, 88, 90, 91, 93, 94, 97];
        const ram = [58, 58, 59, 61, 63, 62, 61, 64, 66, 67, 65, 67, 66, 67, 65, 66, 67, 66, 67, 68, 67, 68, 67, 68, 72];
        const leitura = [4, 3, 6, 5, 8, 7, 6, 10, 8, 9, 7, 12, 11, 8, 12, 9, 11, 10, 13, 11, 10, 9, 10, 11, 12];
        const escrita = [1, 2, 1, 3, 2, 2, 4, 3, 3, 2, 5, 4, 3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 5, 3, 4];
        const entrada = [0.8, 0.7, 1, 1.1, 1.2, 1, 0.8, 1.3, 1.4, 1.2, 1.1, 1.5, 1.7, 1.9, 1.5, 1.8, 2, 1.7, 2.1, 1.9, 2.2, 2, 2.3, 2.2, 2.4];
        const saida = [0.2, 0.15, 0.3, 0.35, 0.4, 0.3, 0.2, 0.6, 0.35, 0.45, 0.6, 0.8, 0.7, 0.65, 0.6, 0.8, 0.7, 0.6, 0.9, 0.7, 0.8, 0.7, 0.9, 0.8, 0.8];
        const ajustar = (valores, fator = 1) => valores.map((valor) => Number((valor * fator).toFixed(2))).slice(-horas - 1);
        const serie = (label, valores, cor, fator = 1) => ({ label, data: ajustar(valores, fator), borderColor: cor, backgroundColor: cor, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15, spanGaps: false });
        const configuracoes = [
            ["cpu", [serie("CPU", cpu, "#cc0301", modeloRam ? 63 / 97 : 1)], "%", 100],
            ["ram", [serie("RAM", ram, "#477da7", modeloRam ? 94 / 72 : 1)], "%", 100],
            ["disco", [serie("Leitura", leitura, "#477da7", modeloRam ? 1.5 : 1), serie("Escrita", escrita, "#a76800", modeloRam ? 2.25 : 1)], " MiB/s", modeloRam ? 30 : 20],
            ["rede", [serie("Recebimento", entrada, "#477da7", modeloRam ? 0.75 : 1), serie("Envio", saida, "#15865c", modeloRam ? 1.5 : 1)], " MiB/s", 3]
        ];
        configuracoes.forEach(([id, datasets, unidade, maximo]) => {
            const elemento = document.getElementById(`servidor-chart-${id}`);
            elemento.setAttribute("aria-label", `${elemento.textContent}. Últimas ${horas} horas.`);
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
        if (!monitoramentoMock.cenario(servidor.modelo)) return;
        botaoOrigem = document.activeElement;
        servidorAtual = servidor;
        destruirGraficos();
        renderizarPainel(servidor, monitoramentoMock.cenario(servidor.modelo));
        dialogo.showModal();
        dialogo.scrollTop = 0;
        criarGraficos();
    });

    conteudo.addEventListener("change", (evento) => {
        if (evento.target.id !== "detalhes-periodo") return;
        const horas = Number(evento.target.value);
        criarGraficos(horas);
        texto("detalhes-coleta", `Coleta simulada às 14:32 · dados ilustrativos · últimas ${horas} horas`);
    });

    conteudo.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-container]");
        if (!botao) return;
        const linha = document.getElementById(botao.getAttribute("aria-controls"));
        linha.hidden = !linha.hidden;
        botao.setAttribute("aria-expanded", String(!linha.hidden));
        botao.textContent = linha.hidden ? "Ver métricas" : "Ocultar métricas";
        const container = monitoramentoMock.cenario(servidorAtual.modelo).containers[Number(botao.dataset.container)];
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
