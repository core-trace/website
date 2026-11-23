const resumoGoldService = require("./resumoGoldService");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({});
const TEMPO_INATIVO = 15 * 60000;

// recebe o horario e transforma em milisegundos
function horarioDaCaptura(texto) {
    if (typeof texto !== "string") throw new Error("Horário ausente na captura.");
    texto = texto.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$|$)/i, "$1");
    if (!/Z$|[+-]\d{2}:\d{2}$/i.test(texto)) texto += "-03:00";
    // converte para mili segundo e acima usa o fuso de sp
    const horario = Date.parse(texto);
    if (!Number.isFinite(horario)) throw new Error("Horário inválido na captura.");
    return horario;
}

// vê se esta ativo ou inativo o servidor
function estaAtivo(ultima, referencia) {
    return Number.isFinite(ultima) && Number.isFinite(referencia) &&
        referencia >= ultima && referencia - ultima < TEMPO_INATIVO;
}
// recebe o horario mas volta so a data 
function dataSaoPaulo(horario) {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(horario));
}

// Recebe um valor da Gold e o compara com um limite do banco.
function atingiuLimite(valor, limite, operador) {
    if (limite === null || limite === undefined || limite === "") return false;
    limite = Number(limite);
    if (!Number.isFinite(limite)) throw new Error("Limite inválido no banco.");
    operador = String(operador || ">").trim() || ">";
    switch (operador) {
        case ">": return valor > limite;
        case ">=": return valor >= limite;
        case "<": return valor < limite;
        case "<=": return valor <= limite;
        case "=": case "==": return valor === limite;
        case "!=": case "<>": return valor !== limite;
        default: throw new Error("Operador inválido no banco.");
    }
}
//procura as metricas na captura
function buscarMedidas(objeto, medidas) {
    if (!objeto || typeof objeto !== "object") return;
    // ve se o objeto possui um nome com metrica e outra com valor
    if (objeto.metrica && "valor" in objeto) medidas.push(objeto);
    for (const campo of Object.keys(objeto)) {
        if (campo !== "extras") buscarMedidas(objeto[campo], medidas);
    }
}

// Um servidor conta uma vez, mesmo que várias métricas estejam críticas.
// null significa que faltam medidas para afirmar o resultado.
function servidorCritico(captura, componentes) {
    const medidas = [];
    buscarMedidas(captura, medidas);
    // ve se faltam informaçoes para dizer que o servidor esta completo
    let incompleto = false;
    for (const componente of componentes) {
        if (componente.critico == null && componente.critico2 == null) continue;
        let encontrou = false;
        for (const medida of medidas) {
            if (medida.metrica !== componente.coluna) continue;
            if (medida.status !== "ok" || !Number.isFinite(medida.valor) || medida.valor < 0 ||
                medida.unidade !== componente.unidade) {
                incompleto = true;
                continue;
            }
            encontrou = true;
            if (atingiuLimite(medida.valor, componente.critico, componente.operador)) return true;
            if (componente.operador2 && atingiuLimite(medida.valor, componente.critico2, componente.operador2)) return true;
        }
        if (!encontrou) incompleto = true;
    }
    return incompleto ? null : false;
}

// verifica as capturas dos servidores na gold
async function lerServidor(servidor, agora, referencia) {
    if (!process.env.BUCKET_DADOS_GOLD) throw new Error("Configure BUCKET_DADOS_GOLD.");
    //padroniza o endereco mac e o if ve se ele realmente esta no modelo certo
    const mac = String(servidor.endereco_mac).trim().toUpperCase().replace(/-/g, ":");
    if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(mac)) throw new Error("MAC inválido no cadastro.");
    const datas = new Set([
        dataSaoPaulo(agora), dataSaoPaulo(agora - TEMPO_INATIVO),
        dataSaoPaulo(referencia), dataSaoPaulo(referencia - TEMPO_INATIVO)
    ]);
    let ultimaAtual = null;
    let ultimaHistorica = null;
    let ultimaMetrica = null;
    let horarioMetrica = null;
    const lidos = new Set();
    for (const data of datas) {
        let resumo;
        try {
            resumo = await resumoGoldService.buscarResumoDoServidor(mac, data);
        } catch (erro) {
            if (erro.name === "NoSuchKey" || erro.Code === "NoSuchKey") continue;
            throw erro;
        }
        if (resumo.endereco_mac !== mac || !Array.isArray(resumo.lotes_atuais)) {
            throw new Error("Resumo da Gold incompatível com o servidor.");
        }
        for (const lote of resumo.lotes_atuais) {
            const prefixo = `client/lotes/maquina=${mac}/data=${data}/`;
            if (typeof lote.chave !== "string" || !lote.chave.startsWith(prefixo)) {
                throw new Error("Referência de lote inválida na Gold.");
            }
            if (lidos.has(lote.chave)) continue;
            lidos.add(lote.chave);
            const resposta = await s3.send(new GetObjectCommand({
                Bucket: process.env.BUCKET_DADOS_GOLD, Key: lote.chave
            }));
            const documento = JSON.parse(await resposta.Body.transformToString());
            if (documento.endereco_mac !== mac) throw new Error("Servidor diferente no lote.");
            for (const campo of ["metricas", "processos", "containers", "eventos", "logs"]) {
                if (documento[campo] != null && !Array.isArray(documento[campo])) throw new Error("Capturas inválidas na Gold.");
                for (const captura of documento[campo] || []) {
                    const horario = horarioDaCaptura(captura.timestamp);
                    //ignora capturas do futuro
                    if (horario > agora) continue;
                    //ve se aquele é a captura mais nova
                    if (ultimaAtual === null || horario > ultimaAtual) ultimaAtual = horario;
                    //procura a captura mais recente ate o horario de referencia
                    if (horario <= referencia && (ultimaHistorica === null || horario > ultimaHistorica)) ultimaHistorica = horario;
                    if (campo === "metricas" && (horarioMetrica === null || horario > horarioMetrica ||
                        (horario === horarioMetrica && String(captura.id_captura) > String(ultimaMetrica.id_captura)))) {
                        ultimaMetrica = captura;
                        horarioMetrica = horario;
                    }
                }
            }
        }
    }
    return { ultimaAtual, ultimaHistorica, ultimaMetrica, horarioMetrica };
}

// Junta as capturas com os perfis e limites do banco, preparando a resposta da tela.
async function montarDashboard(cadastros, servidores, minutos) {
    const agora = resumoGoldService.agoraOuReferenciaDemo().getTime();
    if (!Number.isFinite(agora)) throw new Error("Horário de referência inválido.");
    const referencia = agora - minutos * 60000;
    const perfis = [];
    const historico = [];
    let disponivel = true;
    for (const cadastro of cadastros) {
        const perfil = {
            id: cadastro.id_perfil_servidor, nome: cadastro.nome,
            totalServidores: Number(cadastro.total_servidores), limites: cadastro.componentes,
            ativos: 0, inativos: 0, criticos: 0, percentualCriticos: 0
        };
        const status = { id: perfil.id, nome: perfil.nome, ativos: 0, inativos: 0 };
        for (const servidor of servidores) {
            // so continua quandoo servidor pertence  ao perfil que esta sendo analisado
            if (String(servidor.id_perfil_servidor) !== String(perfil.id)) continue;
            try {
                const leitura = await lerServidor(servidor, agora, referencia);
                const ativo = estaAtivo(leitura.ultimaAtual, agora);
                if (ativo && perfil.ativos !== null) perfil.ativos++;
                if (!ativo && perfil.inativos !== null) perfil.inativos++;
                if (ativo) {
                    const critico = estaAtivo(leitura.horarioMetrica, agora)
                        ? servidorCritico(leitura.ultimaMetrica, perfil.limites) : null;
                    if (critico === null) perfil.criticos = null;
                    else if (critico && perfil.criticos !== null) perfil.criticos++;
                }
                const ativoAntes = estaAtivo(leitura.ultimaHistorica, referencia);
                if (ativoAntes && status.ativos !== null) status.ativos++;
                if (!ativoAntes && status.inativos !== null) status.inativos++;
            } catch (erro) {
                console.error("Leitura da DashboardPerfil:", erro.name, erro.message);
                perfil.ativos = null;
                perfil.inativos = null;
                perfil.criticos = null;
                status.ativos = null;
                status.inativos = null;
                disponivel = false;
            }
        }
        if (perfil.criticos === null) {
            perfil.percentualCriticos = null;
            disponivel = false;
        } else if (perfil.totalServidores > 0) {
            perfil.percentualCriticos = Math.round(perfil.criticos / perfil.totalServidores * 10000) / 100;
        }
        perfis.push(perfil);
        historico.push(status);
    }
    let perfisComServidores = 0;
    let maior = 0;
    let completos = true;
    for (const perfil of perfis) {
        if (perfil.totalServidores > 0) perfisComServidores++;
        if (perfil.criticos === null) completos = false;
        else if (perfil.criticos > maior) maior = perfil.criticos;
    }
    let maisCriticos = null;
    if (completos) {
        maisCriticos = [];
        for (const perfil of perfis) {
            if (maior > 0 && perfil.criticos === maior) maisCriticos.push({ id: perfil.id, nome: perfil.nome });
        }
    }
    const ranking = perfis.filter(perfil => perfil.percentualCriticos !== null);
    ranking.sort((a, b) => b.percentualCriticos - a.percentualCriticos || a.id - b.id);
    return {
        coletasDisponiveis: disponivel, geradoEm: new Date(agora).toISOString(), avisos: [],
        kpis: { perfisConfigurados: perfis.length, perfisAtivos: perfisComServidores, perfisComMaisCriticos: maisCriticos },
        perfis, rankingCriticos: ranking,
        historicoStatus: { minutos, referencia: new Date(referencia).toISOString(), perfis: historico }
    };
}

module.exports = { montarDashboard };
