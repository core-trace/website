const monitoramentoMock = (() => {
    // Cenários fixos: nenhuma coleta, chamada à API ou atualização aleatória.
    const cenarios = {
        cpu: {
            resumo: { situacao: "critico", cpu: "97%", ram: "72%", disco: "63%", docker: "4 em execução", uptime: "12d 4h" },
            capacidade: 16, disponivel: 4.48, carga5: 1.15, carga15: 0.95, iowait: 2, swap: 8,
            alerta: "2 alertas ativos · CPU e encerramentos por falta de memória",
            regra: "CPU acima de 95% · novos eventos OOM · alertas ilustrativos",
            alertas: [{ recurso: "CPU", nivel: "critico" }, { recurso: "OOM", nivel: "atencao" }],
            oom: ["14:09", "14:29"],
            volumes: [
                { nome: "/dados", livre: 74, diasEspaco: 37, inodesUsados: 78, diasInodes: 220 },
                { nome: "/", livre: 52, diasEspaco: null, inodesUsados: 12, diasInodes: null }
            ],
            processos: [
                { pid: 1842, nome: "python · carrinho-api", estado: "Executando", cpu: 180, memoria: 1.2 },
                { pid: 2150, nome: "carrinho-worker", estado: "Executando", cpu: 95, memoria: 0.68 },
                { pid: 932, nome: "redis-server", estado: "Em espera", cpu: 8, memoria: 0.26 }
            ],
            containers: [
                { id: "8ac72f", nome: "carrinho-api", estado: "Executando", cpu: 180, memoria: 1.2, leitura: 120000, escrita: 85000 },
                { id: "3df98a", nome: "carrinho-worker", estado: "Executando", cpu: 95, memoria: 0.68, leitura: 90000, escrita: 40000 },
                { id: "7ab10c", nome: "redis", estado: "Executando", cpu: 8, memoria: 0.26, leitura: 12000, escrita: 8000 },
                { id: "1e50bd", nome: "nginx", estado: "Executando", cpu: 3, memoria: 0.1, leitura: 2000, escrita: 1000 },
                { id: "9c812e", nome: "delivery", estado: "Parado" }
            ]
        },
        ram: {
            resumo: { situacao: "critico", cpu: "63%", ram: "94%", disco: "88%", docker: "3 em execução", uptime: "9d 21h" },
            capacidade: 32, disponivel: 1.92, carga5: 0.6, carga15: 0.51, iowait: 5, swap: 18,
            alerta: "3 alertas ativos · memória RAM, disco e encerramentos por falta de memória",
            regra: "RAM acima de 90% · disco acima de 85% · novos eventos OOM · alertas ilustrativos",
            alertas: [{ recurso: "RAM", nivel: "critico" }, { recurso: "Disco", nivel: "atencao" }, { recurso: "OOM", nivel: "atencao" }],
            oom: ["14:08", "14:20", "14:29"],
            volumes: [
                { nome: "/dados", livre: 24, diasEspaco: 14, inodesUsados: 86, diasInodes: 80 },
                { nome: "/", livre: 48, diasEspaco: null, inodesUsados: 16, diasInodes: null }
            ],
            processos: [
                { pid: 1640, nome: "postgres · payments-db", estado: "Executando", cpu: 120, memoria: 20 },
                { pid: 2015, nome: "payments-backup", estado: "Executando", cpu: 42, memoria: 1.5 },
                { pid: 928, nome: "payments-exporter", estado: "Em espera", cpu: 4, memoria: 0.13 }
            ],
            containers: [
                { id: "1fa83b", nome: "payments-db", estado: "Executando", cpu: 120, memoria: 20, leitura: 140000, escrita: 70000 },
                { id: "6ce42a", nome: "payments-backup", estado: "Executando", cpu: 42, memoria: 1.5, leitura: 30000, escrita: 15000 },
                { id: "2bd91c", nome: "payments-exporter", estado: "Executando", cpu: 4, memoria: 0.13, leitura: 10000, escrita: 5000 },
                { id: "4ef20d", nome: "payments-migration", estado: "Parado" }
            ]
        }
    };

    // Amostras determinísticas a cada minuto, das 14:02 às 14:32.
    // Os pontos intermediários são interpolados apenas para esta demonstração.
    const amostrar = (pontos, fator = 1) => Array.from({ length: 31 }, (_, indice) => {
        const posicao = indice / 2;
        const anterior = Math.floor(posicao);
        const valor = pontos[anterior] + ((pontos[Math.ceil(posicao)] - pontos[anterior]) * (posicao - anterior));
        return Number((valor * fator).toFixed(2));
    });
    const rotulos = Array.from({ length: 31 }, (_, indice) => `14:${String(indice + 2).padStart(2, "0")}`);
    for (const [modelo, cenario] of Object.entries(cenarios)) {
        const ram = modelo === "ram";
        const cpu = amostrar([42, 39, 48, 43, 50, 62, 53, 70, 65, 74, 64, 71, 83, 80, 91, 97], ram ? 63 / 97 : 1);
        cenario.series = {
            cpu,
            ram: amostrar([58, 58, 61, 65, 64, 62, 67, 69, 67, 70, 72, 70, 71, 72, 72, 72], ram ? 94 / 72 : 1),
            nucleos: Array.from({ length: 8 }, (_, nucleo) => cpu.map((valor, indice) =>
                Number(Math.max(0, Math.min(100, valor + [0, -4, -2, 4, 3, 2, 1, -1][nucleo] + Math.sin(indice / 3 + nucleo) * 2)).toFixed(2))))
        };
        cenario.discos = [1, 0.35].map((fator, indice) => ({
            nome: indice ? "sda" : "nvme0n1",
            iopsLeitura: Math.round((ram ? 240 : 120) * fator), iopsEscrita: Math.round((ram ? 110 : 45) * fator),
            leitura: amostrar([4, 3, 6, 5, 8, 7, 6, 10, 8, 9, 7, 6, 8, 9, 7, 12], fator * (ram ? 1.5 : 1)),
            escrita: amostrar([1, 2, 1, 3, 2, 2, 4, 3, 2, 2, 1, 2, 3, 5, 4, 4], fator * (ram ? 2.25 : 1)),
            latenciaLeitura: amostrar([0.8, 1, 1.2, 1, 1.3, 1.7, 1.8, 1.9, 1.5, 1.4, 1.4, 1.8, 2.2, 2.1, 1.9, 1.8], fator * (ram ? 1.4 : 1)),
            latenciaEscrita: amostrar([2, 2.2, 2.5, 3, 3.2, 3.4, 4, 4.5, 4, 4, 4, 4.3, 4.6, 4.5, 4.3, 4.2], fator * (ram ? 1.5 : 1)),
            fila: amostrar([0.2, 0.25, 0.3, 0.25, 0.3, 0.4, 0.6, 0.8, 0.65, 0.5, 0.52, 0.55, 0.65, 0.85, 0.75, 0.6], fator * (ram ? 1.8 : 1))
        }));
        cenario.redes = [1, 0.25].map((fator, indice) => ({
            nome: indice ? "docker0" : "eth0", ativa: true,
            recebimento: amostrar([0.8, 0.7, 1, 1.1, 1.2, 1, 0.8, 1.3, 1.4, 1.2, 1.1, 1.5, 1.7, 1.9, 2.2, 2.4], fator * (ram ? 0.75 : 1)),
            envio: amostrar([0.2, 0.15, 0.3, 0.35, 0.4, 0.3, 0.2, 0.6, 0.35, 0.45, 0.6, 0.8, 0.7, 0.65, 0.7, 0.8], fator * (ram ? 1.5 : 1)),
            errosEntrada: amostrar([0, 0, 0, 1, 0.5, 0, 2, 0.6, 0, 0, 0, 0, 0, 0, 0, 0], fator),
            errosSaida: amostrar([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            descartesEntrada: amostrar([0, 0, 0, 0, 0.3, 1, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0], fator),
            descartesSaida: amostrar([0, 0, 0, 0, 0, 0, 0.5, 1, 0.3, 0, 0, 0, 0, 0, 0, 0], fator)
        }));
    }

    return {
        aplicar(servidor) {
            // O ID mantém o mesmo cenário ao buscar, filtrar ou recarregar a lista.
            const modelo = Number(servidor.id_servidor) % 2 === 1 ? "cpu" : "ram";
            return {
                id: Number(servidor.id_servidor),
                nome: servidor.nome || `Servidor ${servidor.id_servidor}`,
                perfilId: String(servidor.id_perfil_servidor),
                perfil: servidor.nome_perfil,
                sistemaOperacional: servidor.sistema_operacional === "windows" ? "Windows" : "Linux",
                modelo,
                volumes: cenarios[modelo].volumes,
                ...cenarios[modelo].resumo
            };
        },
        cenario(modelo) {
            return cenarios[modelo];
        },
        menorPrevisao(servidores) {
            let menor = null;
            for (const servidor of servidores) {
                for (const volume of servidor.volumes) {
                    for (const [recurso, dias] of [["espaço", volume.diasEspaco], ["inodes", volume.diasInodes]]) {
                        if (Number.isFinite(dias) && dias >= 0 && (!menor || dias < menor.dias)) {
                            menor = { servidor, volume: volume.nome, recurso, dias };
                        }
                    }
                }
            }
            return menor;
        },
        historico(modelo, minutos = 30) {
            if (![15, 30].includes(minutos)) throw new RangeError("Período inválido para a simulação.");
            const cenario = cenarios[modelo];
            const recortar = (valores) => valores.slice(-minutos - 1);
            const dispositivos = (lista) => lista.map((item) => Object.fromEntries(Object.entries(item)
                .map(([chave, valor]) => [chave, Array.isArray(valor) ? recortar(valor) : valor])));
            const periodo = recortar(rotulos);
            return {
                rotulos: periodo,
                cpu: recortar(cenario.series.cpu), ram: recortar(cenario.series.ram),
                nucleos: cenario.series.nucleos.map(recortar),
                discos: dispositivos(cenario.discos), redes: dispositivos(cenario.redes),
                oom: cenario.oom.filter((horario) => horario >= periodo[0] && horario <= periodo.at(-1))
            };
        }
    };
})();
