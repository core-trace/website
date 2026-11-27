const resumoGoldService = require("./resumoGoldService");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({});
const TEMPO_INATIVO = 15 * 60000;

// Reutiliza a lista de lotes por 30 segundos; os lotes com ID por conteúdo, por 5 minutos.
// O controller pode reutilizar a resposta completa por 2 minutos antes de chamar este service.
const arquivosEmMemoria = new Map();
async function lerJsonGold(chave) {
    const bucket = process.env.BUCKET_DADOS_GOLD;
    const identificacao = bucket + "/" + chave;
    const duracao = chave.startsWith("client/lotes/") ? 5 * 60000 : 30000;
    const anterior = arquivosEmMemoria.get(identificacao);
    if (anterior && anterior.validoAte > Date.now()) return anterior.leitura;

    // Limita a memória e reaproveita uma leitura que já estiver em andamento.
    if (arquivosEmMemoria.size >= 60) arquivosEmMemoria.delete(arquivosEmMemoria.keys().next().value);
    const consulta = { validoAte: Date.now() + duracao };
 //mudou de 15 segundos para 90 segundos para tempo de esperar os arquivos s3 carregar antes de cancelar a tentativa
    consulta.leitura = s3.send(new GetObjectCommand({ Bucket: bucket, Key: chave }), {
        abortSignal: AbortSignal.timeout(90000)
    }).then(async resposta => {
        const documento = JSON.parse(await resposta.Body.transformToString());
        consulta.validoAte = Date.now() + duracao;
        return documento;
    }).catch(erro => {
        if (arquivosEmMemoria.get(identificacao) === consulta) arquivosEmMemoria.delete(identificacao);
        throw erro;
    });
    arquivosEmMemoria.set(identificacao, consulta);
    return consulta.leitura;
}

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
async function lerServidor(servidor, agora) {
    if (!process.env.BUCKET_DADOS_GOLD) throw new Error("Configure BUCKET_DADOS_GOLD.");
    //padroniza o endereco mac e o if ve se ele realmente esta no modelo certo
    const mac = String(servidor.endereco_mac).trim().toUpperCase().replace(/-/g, ":");
    if (!/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(mac)) throw new Error("MAC inválido no cadastro.");
    const datas = new Set([
        dataSaoPaulo(agora), dataSaoPaulo(agora - TEMPO_INATIVO)
    ]);
    let ultimaAtual = null;
    let ultimaMetrica = null;
    let horarioMetrica = null;
    const lidos = new Set();
    for (const data of datas) {
        let resumo;
        try {
            resumo = await lerJsonGold(`client/resumos/maquina=${mac}/data=${data}/resumo.json`);
        } catch (erro) {
            if (erro.name === "NoSuchKey" || erro.Code === "NoSuchKey") continue;
            throw erro;
        }
        if (resumo.endereco_mac !== mac || !Array.isArray(resumo.lotes_atuais)) {
            throw new Error("Resumo da Gold incompatível com o servidor.");
        }
        const chaves = [];
        for (const lote of resumo.lotes_atuais) {
            const prefixo = `client/lotes/maquina=${mac}/data=${data}/`;
            if (typeof lote.chave !== "string" || !lote.chave.startsWith(prefixo)) {
                throw new Error("Referência de lote inválida na Gold.");
            }
            if (lidos.has(lote.chave)) continue;
            lidos.add(lote.chave);
            chaves.push(lote.chave);
        }
        // isso aqui é só pra não abrir conexões demais de
        // uma vez, o cache é quem realmente evita reler tudo de novo depois.
        for (let inicio = 0; inicio < chaves.length; inicio += 3) {
            const documentos = await Promise.all(chaves.slice(inicio, inicio + 3).map(lerJsonGold));
            for (const documento of documentos) {
                if (documento.endereco_mac !== mac) throw new Error("Servidor diferente no lote.");
                for (const campo of ["metricas", "processos", "containers", "eventos", "logs"]) {
                    if (documento[campo] != null && !Array.isArray(documento[campo])) throw new Error("Capturas inválidas na Gold.");
                    for (const captura of documento[campo] || []) {
                        const horario = horarioDaCaptura(captura.timestamp);
                        //ignora capturas do futuro
                        if (horario > agora) continue;
                        //ve se aquele é a captura mais nova
                        if (ultimaAtual === null || horario > ultimaAtual) ultimaAtual = horario;
                        if (campo === "metricas" && (horarioMetrica === null || horario > horarioMetrica ||
                            (horario === horarioMetrica && String(captura.id_captura) > String(ultimaMetrica.id_captura)))) {
                            ultimaMetrica = captura;
                            horarioMetrica = horario;
                        }
                    }
                }
            }
        }
    }
    return { ultimaAtual, ultimaMetrica, horarioMetrica };
}

// Estima uma instância para cada servidor cadastrado, ligada desde o início do mês.
function calcularCustos(perfil, agora) {
    // Todos os perfis usam a mesma configuração; só a quantidade muda o custo.
    const instancia = "m6i.xlarge";
    const precoHoraDolar = 0.192;

    // Hipótese: 200 GB gp3 por instância
    // Referência de armazenamento: https://aws.amazon.com/ebs/pricing/
    const discoGb = 200;
    const precoGbMesDolar = 0.08;
  

    const dolarEmReais = 5.9708;

    // Usa a mesma data do restante da dashboard, no horário de São Paulo.
    const data = dataSaoPaulo(agora);
    const ano = Number(data.slice(0, 4));
    const mes = Number(data.slice(5, 7));
    const diaAtual = Number(data.slice(8, 10));
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const inicioMes = Date.parse(data.slice(0, 7) + "-01T00:00:00-03:00");
    const horasPassadas = (agora - inicioMes) / 3600000;
    const horasNoMes = diasNoMes * 24;
    const totalServidores = perfil.totalServidores;

    // Soma o mês de EC2 e disco por servidor, depois multiplica pela quantidade.
    // Um servidor sem coleta continua alocado neste cenário e mantém seu custo.
    const custoMesDolar = (precoHoraDolar * horasNoMes + discoGb * precoGbMesDolar) * totalServidores;
    const custoMesReais = custoMesDolar * dolarEmReais;
    const custoHoraReais = custoMesReais / horasNoMes;
    const gastoAteAgora = Math.round(custoHoraReais * horasPassadas * 100) / 100;
    const previsaoFimMes = Math.round(custoMesReais * 100) / 100;

    // Até hoje, mostra o acumulado estimado. Depois de hoje, mostra a projeção.
    const serie = [];
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const horas = dia < diaAtual ? dia * 24 : horasPassadas;
        serie.push({
            data: data.slice(0, 7) + "-" + String(dia).padStart(2, "0"),
            realizadoAcumulado: dia <= diaAtual ? Math.round(custoHoraReais * horas * 100) / 100 : null,
            projetadoAcumulado: dia > diaAtual ? Math.round(custoHoraReais * dia * 24 * 100) / 100 : null
        });
    }
    return {
        moeda: "BRL", tipo: "estimativa", gastoAteAgora, previsaoFimMes, serie,
        periodoRealizado: "01/" + data.slice(5, 7) + " até " + data.slice(8, 10) + "/" + data.slice(5, 7),
        periodoMes: "Até " + diasNoMes + "/" + data.slice(5, 7) + "/" + ano,
        base: { instancia, regiao: "us-east-1", sistema: "Linux", quantidade: totalServidores,
            precoHoraDolar, discoGb, precoGbMesDolar, dolarEmReais, dataCambio: "2026-11-23",
            horasPassadas, horasNoMes,
            premissa: "Quantidade atual mantida desde o início do mês, 24h/dia; somente EC2 e EBS, sem impostos, tráfego ou serviços adicionais." }
    };
}

// Junta as capturas com os perfis e limites do banco, preparando a resposta da tela.
async function montarDashboard(cadastros, servidores, incluirColetas = true) {
    if (!incluirColetas) servidores = [];
    const agora = resumoGoldService.agoraOuReferenciaDemo().getTime();
    if (!Number.isFinite(agora)) throw new Error("Horário de referência inválido.");
    const perfis = [];
    // Busca até quatro servidores ao mesmo tempo para diminuir a espera pelo S3.
    const leituras = new Map();
    const servidoresDosPerfis = servidores.filter(servidor => cadastros.some(
        perfil => String(perfil.id_perfil_servidor) === String(servidor.id_perfil_servidor)
    ));
    for (let inicio = 0; inicio < servidoresDosPerfis.length; inicio += 4) {
        const grupo = servidoresDosPerfis.slice(inicio, inicio + 4);
        const resultados = await Promise.allSettled(
            grupo.map(servidor => lerServidor(servidor, agora))
        );
        for (let indice = 0; indice < grupo.length; indice++) {
            leituras.set(grupo[indice], resultados[indice]);
        }
    }
    let disponivel = incluirColetas;
    for (const cadastro of cadastros) {
        const perfil = {
            id: cadastro.id_perfil_servidor, nome: cadastro.nome,
            totalServidores: Number(cadastro.total_servidores), limites: cadastro.componentes,
            ativos: incluirColetas ? 0 : null, inativos: incluirColetas ? 0 : null,
            criticos: incluirColetas ? 0 : null, percentualCriticos: null
        };
        perfil.custos = calcularCustos(perfil, agora);
        for (const servidor of servidores) {
            // so continua quandoo servidor pertence  ao perfil que esta sendo analisado
            if (String(servidor.id_perfil_servidor) !== String(perfil.id)) continue;
            try {
                const resultado = leituras.get(servidor);
                if (resultado.status === "rejected") throw resultado.reason;
                const leitura = resultado.value;
                const ativo = estaAtivo(leitura.ultimaAtual, agora);
                if (ativo && perfil.ativos !== null) perfil.ativos++;
                if (!ativo && perfil.inativos !== null) perfil.inativos++;
                if (ativo) {
                    const critico = estaAtivo(leitura.horarioMetrica, agora)
                        ? servidorCritico(leitura.ultimaMetrica, perfil.limites) : null;
                    if (critico === null) perfil.criticos = null;
                    else if (critico && perfil.criticos !== null) perfil.criticos++;
                }
            } catch (erro) {
                console.error("Leitura da DashboardPerfil:", erro.name, erro.message);
                perfil.ativos = null;
                perfil.inativos = null;
                perfil.criticos = null;
                disponivel = false;
            }
        }
        if (perfil.criticos === null) {
            perfil.percentualCriticos = null;
            disponivel = false;
        } else {
            perfil.percentualCriticos = perfil.totalServidores > 0
                ? Math.round(perfil.criticos / perfil.totalServidores * 10000) / 100 : 0;
        }
        perfis.push(perfil);
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
        perfis, rankingCriticos: ranking
    };
}

module.exports = { montarDashboard };