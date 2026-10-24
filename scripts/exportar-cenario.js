const fs = require("node:fs");
const path = require("node:path");
const cenario = require("../public/scripts/cenario/cenario-coretrace-7dias.js");
const detalhes = require("../public/scripts/cenario/detalhamento-servidor.js");

const inicio = Date.parse(cenario.INICIO);
const fim = Date.parse(cenario.DATA_FINAL);
const minuto = 60000;
const registrosPorServidor = (fim - inicio) / minuto + 1;
const pastaSaida = path.join(__dirname, "exportados");

function horarioBrasilia(instante) {
    return new Date(instante - 3 * 60 * 60 * 1000)
        .toISOString().slice(0, 19).replace("T", " ");
}

function conferir(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

function campoCsv(valor) {
    if (valor === null || valor === undefined) return "";
    if (typeof valor === "number") {
        conferir(Number.isFinite(valor), "Número inválido no CSV.");
    }
    const texto = String(valor);
    return '"' + texto.replace(/"/g, '""') + '"';
}

function montarLinha(colunas, registro) {
    const valores = [];
    for (const coluna of colunas) {
        conferir(Object.hasOwn(registro, coluna), "Campo não definido: " + coluna);
        valores.push(campoCsv(registro[coluna]));
    }
    return valores.join(",");
}

function criarTabela(pasta, nome, colunas) {
    const arquivo = path.join(pasta, nome);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, colunas.map(campoCsv).join(",") + "\n", "utf8");
    const tabela = { arquivo, colunas, registros: 0 };
    return tabela;
}

function adicionar(tabela, registros) {
    if (registros.length === 0) return;
    const linhas = registros.map(function (registro) {
        return montarLinha(tabela.colunas, registro);
    });
    fs.appendFileSync(tabela.arquivo, linhas.join("\n") + "\n", "utf8");
    tabela.registros += registros.length;
}

const camposBase = [
    "cpu_percent", "ram_percent", "disk_percent", "net_errors", "net_drops",
    "swap_percent", "ram_total", "ram_used", "ram_available",
    "disk_total", "disk_used", "disk_free", "cpu_count_logical",
    "load_avg_1", "cpu_iowait", "uptimeSegundos"
];
const camposExtras = [
    "load_avg_5", "load_avg_15", "swap_total_gb", "swap_used_gb",
    "swap_free_gb", "swap_in_bytes_s", "swap_out_bytes_s", "ram_oom_kills",
    "io_dispositivo", "io_read_bytes_s", "io_write_bytes_s", "io_read_iops",
    "io_write_iops", "io_read_ms", "io_write_ms", "io_queue",
    "rede_interface", "rede_recv_mb_s", "rede_sent_mb_s",
    "rede_errin_s", "rede_errout_s", "rede_dropin_s", "rede_dropout_s"
];
let maxNucleos = 0;
for (const servidor of cenario.servidores) {
    if (servidor.nucleos > maxNucleos) maxNucleos = servidor.nucleos;
}
const camposNucleos = [];
for (let i = 0; i < maxNucleos; i++) {
    camposNucleos.push("cpu_percent_percpu_" + i);
}
const identificacao = ["TIMESTAMP", "ENDERECO_MAC"];
const colunasGerais = identificacao.concat(
    ["timestamp_utc", "servidor", "perfil"], camposBase, camposExtras, camposNucleos
);

function registroGeral(servidor, amostra) {
    const registro = {
        TIMESTAMP: horarioBrasilia(Date.parse(amostra.timestamp)),
        ENDERECO_MAC: servidor.mac,
        timestamp_utc: amostra.timestamp,
        servidor: servidor.nome,
        perfil: servidor.perfil,
        load_avg_5: amostra.cpu.carga5Min,
        load_avg_15: amostra.cpu.carga15Min,
        swap_total_gb: amostra.memoria.swapTotalGb,
        swap_used_gb: amostra.memoria.swapUsadaGb,
        swap_free_gb: amostra.memoria.swapDisponivelGb,
        swap_in_bytes_s: amostra.memoria.swapEntradaBytesPorSegundo,
        swap_out_bytes_s: amostra.memoria.swapSaidaBytesPorSegundo,
        ram_oom_kills: amostra.memoria.eventosOOM,
        io_dispositivo: amostra.discoIO.dispositivo,
        io_read_bytes_s: amostra.discoIO.leituraBytesSegundo,
        io_write_bytes_s: amostra.discoIO.escritaBytesSegundo,
        io_read_iops: amostra.discoIO.leituraIOPS,
        io_write_iops: amostra.discoIO.escritaIOPS,
        io_read_ms: amostra.discoIO.tempoLeituraMs,
        io_write_ms: amostra.discoIO.tempoEscritaMs,
        io_queue: amostra.discoIO.filaMediaOperacoes,
        rede_interface: amostra.rede.interface,
        rede_recv_mb_s: amostra.rede.recebimentoMBs,
        rede_sent_mb_s: amostra.rede.envioMBs,
        rede_errin_s: amostra.rede.errosRecebimentoPorSegundo,
        rede_errout_s: amostra.rede.errosEnvioPorSegundo,
        rede_dropin_s: amostra.rede.descartesRecebimentoPorSegundo,
        rede_dropout_s: amostra.rede.descartesEnvioPorSegundo
    };
    for (const campo of camposBase) registro[campo] = amostra[campo];
    for (let i = 0; i < maxNucleos; i++) {
        if (i < amostra.cpu.porNucleo.length) {
            registro[camposNucleos[i]] = amostra.cpu.porNucleo[i].percentual;
        } else {
            registro[camposNucleos[i]] = null;
        }
    }
    return registro;
}

function registrosVolumes(servidor, amostra) {
    return amostra.volumes.map(function (volume) {
        return {
            TIMESTAMP: horarioBrasilia(Date.parse(amostra.timestamp)),
            ENDERECO_MAC: servidor.mac,
            volume: volume.volume,
            total_gb: volume.totalGb,
            usado_gb: volume.usadoGb,
            livre_gb: volume.disponivelGb,
            ocupacao_percent: volume.ocupacaoPercent,
            inodes_usados_percent: volume.inodesUtilizadosPercent
        };
    });
}

function registroCaptura(servidor, amostra) {
    const registro = {
        TIMESTAMP: horarioBrasilia(fim),
        ENDERECO_MAC: servidor.mac,
        CENARIO: "CoreTrace simulado; coleta final"
    };
    function medida(nome, valor) {
        registro[nome] = valor;
        registro[nome + "_status"] = valor === null ? "indisponivel" : "ok";
    }
    for (const campo of ["cpu_percent", "cpu_count_logical", "cpu_iowait",
        "ram_percent", "ram_total", "ram_used", "ram_available", "swap_percent"]) {
        medida(campo, amostra[campo]);
    }
    for (const nucleo of amostra.cpu.porNucleo) {
        medida("cpu_percent_percpu_" + nucleo.cpu, nucleo.percentual);
    }
    medida("load_avg_1", amostra.cpu.carga1Min);
    medida("load_avg_5", amostra.cpu.carga5Min);
    medida("load_avg_15", amostra.cpu.carga15Min);
    medida("ram_oom_kills", amostra.memoria.eventosOOM);
    medida("swap_total", amostra.memoria.swapTotalGb);
    medida("swap_used", amostra.memoria.swapUsadaGb);
    medida("swap_free", amostra.memoria.swapDisponivelGb);
    medida("swap_sin", amostra.memoria.swapEntradaBytesPorSegundo);
    medida("swap_sout", amostra.memoria.swapSaidaBytesPorSegundo);
    registro.swap_interval_seconds = 60;
    registro.cpu_interval_seconds = 60;
    registro.ram_oom_interval_seconds = 60;
    registro.disco_volumes_status = "ok";
    registro.disco_io_status = "ok";
    for (let i = 0; i < amostra.volumes.length; i++) {
        const volume = amostra.volumes[i];
        const prefixo = "disco_volume_" + i + "_";
        registro[prefixo + "montagem"] = volume.volume;
        registro[prefixo + "dispositivo"] = null;
        registro[prefixo + "tipo_sistema"] = null;
        registro[prefixo + "coleta_status"] = "ok";
        medida(prefixo + "total", volume.totalGb);
        medida(prefixo + "used", volume.usadoGb);
        medida(prefixo + "free", volume.disponivelGb);
        medida(prefixo + "percent", volume.ocupacaoPercent);
        medida(prefixo + "inodes_percent", volume.inodesUtilizadosPercent);
        for (const campo of ["inodes_total", "inodes_free", "inodes_available"]) {
            medida(prefixo + campo, null);
        }
    }
    const io = "disco_io_0_";
    registro[io + "dispositivo"] = amostra.discoIO.dispositivo;
    registro[io + "coleta_status"] = "ok";
    registro[io + "interval_seconds"] = 60;
    medida(io + "read_bytes", amostra.discoIO.leituraBytesSegundo);
    medida(io + "write_bytes", amostra.discoIO.escritaBytesSegundo);
    medida(io + "read_count", amostra.discoIO.leituraIOPS);
    medida(io + "write_count", amostra.discoIO.escritaIOPS);
    medida(io + "queue", amostra.discoIO.filaMediaOperacoes);
    medida(io + "io_time", null);
    registro.rede_coleta_status = "ok";
    const rede = "rede_" + amostra.rede.interface + "_";
    registro[rede + "net_interval_seconds"] = 60;
    medida(rede + "bytes_recv", amostra.rede.recebimentoMBs * 1000000);
    medida(rede + "bytes_sent", amostra.rede.envioMBs * 1000000);
    medida(rede + "errin", amostra.rede.errosRecebimentoPorSegundo);
    medida(rede + "errout", amostra.rede.errosEnvioPorSegundo);
    medida(rede + "dropin", amostra.rede.descartesRecebimentoPorSegundo);
    medida(rede + "dropout", amostra.rede.descartesEnvioPorSegundo);
    medida(rede + "isup", null);
    return registro;
}

// conferir
function validarAmostra(servidor, amostra, instante) {
    conferir(amostra.mac === servidor.mac, "MAC diferente do solicitado.");
    conferir(Date.parse(amostra.timestamp) === instante, "Horário diferente do solicitado.");
    for (const campo of camposBase) {
        conferir(Number.isFinite(amostra[campo]), "Valor ausente/inválido: " + campo);
        conferir(amostra[campo] >= 0, "Valor negativo: " + campo);
    }
    for (const campo of ["cpu_percent", "ram_percent", "disk_percent", "swap_percent"]) {
        conferir(amostra[campo] <= 100, "Percentual acima de 100: " + campo);
    }
    conferir(Math.abs(amostra.ram_used + amostra.ram_available - amostra.ram_total) < 0.01,
        "A soma da memória não bate.");
    conferir(Math.abs(amostra.disk_used + amostra.disk_free - amostra.disk_total) < 0.01,
        "A soma do disco não bate.");
    const nucleos = amostra.cpu.porNucleo;
    conferir(nucleos.length === servidor.nucleos, "Quantidade de núcleos diferente.");
    let soma = 0;
    for (const nucleo of nucleos) {
        conferir(Number.isFinite(nucleo.percentual) && nucleo.percentual >= 0 && nucleo.percentual <= 100,
            "Percentual inválido em um núcleo.");
        soma += nucleo.percentual;
    }
    conferir(Math.abs(soma / nucleos.length - amostra.cpu_percent) < 0.001,
        "Média dos núcleos diferente da CPU total.");
    conferir(Math.abs(amostra.rede.errosRecebimentoPorSegundo + amostra.rede.errosEnvioPorSegundo - amostra.net_errors) < 0.002,
        "Soma dos erros de rede diferente do total.");
    conferir(Math.abs(amostra.rede.descartesRecebimentoPorSegundo + amostra.rede.descartesEnvioPorSegundo - amostra.net_drops) < 0.002,
        "Soma dos descartes diferente do total.");
}

//Exportar
function executar() {
    conferir(Number.isFinite(inicio) && Number.isFinite(fim) && fim >= inicio,
        "Datas inválidas no cenário.");
    conferir(Number.isInteger(registrosPorServidor), "Intervalo não fecha em minutos.");
    conferir(cenario.servidores.length === 10, "Esperados dez servidores neste cenário.");
    const macs = new Set();
    for (const servidor of cenario.servidores) macs.add(servidor.mac);
    conferir(macs.size === cenario.servidores.length, "Há MACs repetidos no cadastro.");
    fs.mkdirSync(pastaSaida, { recursive: true });
    const historico = criarTabela(pastaSaida, "analise/historico-semana.csv", colunasGerais);
    const finais = criarTabela(pastaSaida, "analise/coletas-finais.csv", colunasGerais);
    const colunasVolumes = identificacao.concat(["volume", "total_gb", "usado_gb", "livre_gb", "ocupacao_percent", "inodes_usados_percent"]);
    const volumesHistorico = criarTabela(pastaSaida, "analise/volumes-historico.csv", colunasVolumes);
    const volumesFinais = criarTabela(pastaSaida, "analise/volumes-finais.csv", colunasVolumes);
    const servidores = criarTabela(pastaSaida, "analise/servidores.csv",
        ["servidor", "ENDERECO_MAC", "perfil", "cpu_logicas", "ram_total_gb", "swap_total_gb", "docker_monitorado", "io_dispositivo", "rede_interface"]);
    const limites = criarTabela(pastaSaida, "analise/limites.csv",
        ["perfil", "metrica", "atencao", "critico", "operador", "origem"]);
    const processos = criarTabela(pastaSaida, "analise/processos-finais.csv",
        identificacao.concat(["pid", "nome", "estado", "cpu_percent", "ram_gb", "cpu_convencao"]));
    const containers = criarTabela(pastaSaida, "analise/containers-finais.csv",
        identificacao.concat(["id", "nome", "estado", "cpu_percent", "ram_gb", "leitura_bytes_s", "escrita_bytes_s", "cpu_convencao"]));
    const colunasJava = identificacao.concat(["cpu_percent", "ram_percent", "disk_percent", "net_errors", "net_drops"]);
    const java = criarTabela(pastaSaida, "java/coletas-finais.csv", colunasJava);

    const traducao = { cpu: "cpu_percent", ram: "ram_percent", disco: "disk_percent", errosRede: "net_errors", descartesRede: "net_drops" };
    for (const perfil of Object.keys(cenario.limitesReferencia)) {
        for (const recurso of Object.keys(traducao)) {
            const valores = cenario.limitesReferencia[perfil][recurso];
            adicionar(limites, [{ perfil, metrica: traducao[recurso], atencao: valores[0],
                critico: valores[1], operador: ">", origem: "limitesReferencia do gerador; conferir com MySQL" }]);
        }
    }

    for (const servidor of cenario.servidores) {
        console.log("Exportando:", servidor.nome);
        const hw = detalhes.hardware(servidor.mac);
        adicionar(servidores, [{ servidor: servidor.nome, ENDERECO_MAC: servidor.mac,
            perfil: servidor.perfil, cpu_logicas: hw.cpuLogicas, ram_total_gb: hw.ramTotalGb,
            swap_total_gb: hw.swapTotalGb, docker_monitorado: hw.monitorarDocker,
            io_dispositivo: hw.dispositivo, rede_interface: hw.rede }]);
        const registros = [];
        const volumes = [];
        const horarios = new Set();
        let anterior = null;
        let ultimaAmostra;
        for (let instante = inicio; instante <= fim; instante += minuto) {
            const amostra = detalhes.telemetria(servidor.mac, instante);
            validarAmostra(servidor, amostra, instante);
            const horario = amostra.timestamp;
            conferir(!horarios.has(horario), "Horário repetido em " + servidor.nome);
            if (anterior !== null) conferir(instante - anterior === minuto, "Minuto faltando.");
            horarios.add(horario);
            anterior = instante;
            registros.push(registroGeral(servidor, amostra));
            for (const volume of registrosVolumes(servidor, amostra)) {
                volumes.push(volume);
            }
            ultimaAmostra = amostra;
        }
        conferir(horarios.size === registrosPorServidor, "Quantidade incorreta por servidor.");
        conferir(registros[0].timestamp_utc === new Date(inicio).toISOString() &&
            registros[registros.length - 1].timestamp_utc === new Date(fim).toISOString(), "Extremos do histórico diferentes.");
        adicionar(historico, registros);
        adicionar(volumesHistorico, volumes);
        adicionar(finais, [registros[registros.length - 1]]);
        adicionar(volumesFinais, registrosVolumes(servidor, ultimaAmostra));
        adicionar(java, [registroGeral(servidor, ultimaAmostra)]);

        const coletaFinal = registroCaptura(servidor, ultimaAmostra);
        const nomeCaptura = "captura/coretrace_coleta_" + servidor.mac.replace(/:/g, "-") + "_cenario-final.csv";
        const captura = criarTabela(pastaSaida, nomeCaptura, Object.keys(coletaFinal));
        adicionar(captura, [coletaFinal]);

        const dadosProcessos = detalhes.processos(servidor.mac, ultimaAmostra);
        for (const processo of dadosProcessos) {
            adicionar(processos, [{ TIMESTAMP: horarioBrasilia(fim), ENDERECO_MAC: servidor.mac,
                pid: processo.pid, nome: processo.nome, estado: processo.estado,
                cpu_percent: processo.cpuPercent, ram_gb: processo.ramGb,
                cpu_convencao: processo.cpuConvencao }]);
        }
        const docker = detalhes.docker(servidor.mac, ultimaAmostra);
        for (const container of docker.containers) {
            adicionar(containers, [{ TIMESTAMP: horarioBrasilia(fim), ENDERECO_MAC: servidor.mac,
                id: container.id, nome: container.nome, estado: container.estado,
                cpu_percent: container.cpuPercent, ram_gb: container.ramGb,
                leitura_bytes_s: container.leituraBytesSegundo, escrita_bytes_s: container.escritaBytesSegundo,
                cpu_convencao: container.cpuConvencao }]);
        }
    }
    conferir(historico.registros === registrosPorServidor * macs.size, "Total do histórico incorreto.");
    conferir(finais.registros === macs.size && java.registros === macs.size, "Total final incorreto.");
    conferir(processos.registros === 30 && containers.registros === 21, "Quantidade de consumidores diferente do cenário.");

    console.log("\nConferência OK:", macs.size, "servidores;", registrosPorServidor, "registros por servidor.");
    console.log("Histórico:", historico.registros, "registros; nenhum minuto faltando ou repetido.");
    console.log("Processos:", processos.registros, "| Containers:", containers.registros);
    console.log("Arquivos salvos em:", pastaSaida);
    console.log("analise/: arquivos para o R.");
    console.log("captura/: arquivos finais no formato de campos da captura do host.");
    console.log("java/coletas-finais.csv: arquivo resumido para o leitor Java atual.");
    console.log("Dados simulados. Nenhum arquivo foi enviado para AWS, banco ou Jira.");
}

try {
    executar();
} catch (erro) {
    console.error("ERRO:", erro.message);
    process.exitCode = 1;
}
