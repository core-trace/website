const monitoramentoMock = (() => {
    // Cenários fixos: nenhuma coleta, chamada à API ou atualização aleatória.
    const cenarios = {
        cpu: {
            resumo: { situacao: "critico", cpu: "97%", ram: "72%", disco: "63%", docker: "4 em execução", uptime: "12d 4h", dias: 21 },
            nucleos: [98, 97, 96, 99, 95, 97, 96, 98], capacidade: 16, disponivel: "4,48",
            carga: "9,8 / 9,2 / 7,6", capacidadeCarga: "1,15", iowait: 2, swap: 8,
            livre: 74, leitura: 12, escrita: 4, iops: "120 IOPS de leitura · 45 IOPS de escrita",
            recebimento: 2.4, envio: 0.8,
            alerta: "CPU acima de 95% há 6 minutos",
            regra: "Regra de exemplo · atenção > 85% · crítico > 95% · persistência 3 min",
            containers: [
                { nome: "carrinho-api", cpu: 180, memoria: "1,2 GiB", leitura: 5, escrita: 2, entrada: 1.4, saida: 0.4 },
                { nome: "carrinho-worker", cpu: 95, memoria: "680 MiB", leitura: 4, escrita: 1, entrada: 0.6, saida: 0.2 },
                { nome: "redis", cpu: 8, memoria: "256 MiB", leitura: 2, escrita: 0.8, entrada: 0.3, saida: 0.15 },
                { nome: "nginx", cpu: 3, memoria: "96 MiB", leitura: 1, escrita: 0.2, entrada: 0.1, saida: 0.05 }
            ]
        },
        ram: {
            resumo: { situacao: "critico", cpu: "63%", ram: "94%", disco: "88%", docker: "3 em execução", uptime: "9d 21h", dias: 14 },
            nucleos: [62, 64, 60, 66, 61, 65, 63, 63], capacidade: 32, disponivel: "1,92",
            carga: "5,2 / 4,8 / 4,1", capacidadeCarga: "0,60", iowait: 5, swap: 18,
            livre: 24, leitura: 18, escrita: 9, iops: "240 IOPS de leitura · 110 IOPS de escrita",
            recebimento: 1.8, envio: 1.2,
            alerta: "Memória RAM acima de 90% há 8 minutos",
            regra: "Regra de exemplo · atenção > 80% · crítico > 90% · persistência 3 min",
            containers: [
                { nome: "payments-db", cpu: 120, memoria: "20 GiB", leitura: 14, escrita: 7, entrada: 1.2, saida: 0.8 },
                { nome: "payments-backup", cpu: 42, memoria: "1,5 GiB", leitura: 3, escrita: 1.5, entrada: 0.4, saida: 0.3 },
                { nome: "payments-exporter", cpu: 4, memoria: "128 MiB", leitura: 1, escrita: 0.5, entrada: 0.2, saida: 0.1 }
            ]
        }
    };

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
                ...cenarios[modelo].resumo
            };
        },
        cenario(modelo) {
            return cenarios[modelo];
        }
    };
})();
