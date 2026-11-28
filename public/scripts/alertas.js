let LIMITE_ATENCAO = 70;
let LIMITE_CRITICO = 85;
let HORA_ATUALIZACAO = '--:--';

const MAX_SERVIDORES_SELECIONADOS = 3;

const TEXTO_SITUACAO = { critico: 'Crítico', atencao: 'Atenção', normal: 'Normal', semdados: 'Sem dados' };
const COR_SITUACAO = { critico: '#cc0301', atencao: '#e2891b', normal: '#2f9e6e', semdados: '#8a8f9c' };
const MENSAGEM_ERRO_ALERTAS = 'Não foi possível carregar os alertas de servidores. Tente novamente pelo botão Atualizar.';

async function obterServidoresEmAlerta() {
    const idEmpresa = Number(sessionStorage.ID_EMPRESA);
    const idUsuario = Number(sessionStorage.ID_USUARIO);

    if (!idEmpresa || !idUsuario) {
        throw new Error('Sessão de empresa ou usuário ausente.');
    }

    const params = new URLSearchParams({ idEmpresa: String(idEmpresa), idUsuario: String(idUsuario) });
    const fonte = new URLSearchParams(window.location.search).get('fonte');
    if (fonte === 'local') params.set('fonte', 'local');
    const resposta = await fetch(`/alertas/servidores?${params.toString()}`);
    if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status} ao buscar alertas.`);

    const dados = await resposta.json();
    HORA_ATUALIZACAO = dados.horaAtualizacao || HORA_ATUALIZACAO;
    estado.resolucaoChamados = dados.resolucaoChamados || null;
    return dados.servidores || [];
}

function mostrarMensagem(texto, papel = 'status') {
    const mensagem = document.getElementById('alertas-estado');
    mensagem.textContent = texto;
    mensagem.hidden = !texto;
    mensagem.setAttribute('role', papel);
}

const estado = { perfilAtual: 'todos', metricaAtual: '', servidoresSelecionados: [], servidores: [], resolucaoChamados: null };

function minutosDaHora(hora) {
    if (!hora || !hora.includes(':')) return 0;
    const partes = hora.split(':').map(Number);
    return partes[0] * 60 + partes[1];
}

function minutosEmAlerta(servidor) {
    const ref = minutosDaHora(HORA_ATUALIZACAO);
    const ini = minutosDaHora(servidor.desde);
    return ref >= ini ? ref - ini : (24 * 60 - ini) + ref;
}

function ultimaColetaDe(servidor) { return servidor.ultimaColeta || servidor.desde || '--:--'; }

function minutosSemDados(servidor) {
    if (!servidor.ultimaColeta) return 0;
    const ref = minutosDaHora(HORA_ATUALIZACAO);
    const ult = minutosDaHora(servidor.ultimaColeta);
    return ref >= ult ? ref - ult : (24 * 60 - ult) + ref;
}

function servidoresDoPerfil(perfil, servidores = estado.servidores) {
    if (!perfil || perfil === 'todos') return servidores;
    return servidores.filter((s) => s.perfil === perfil);
}

/* Métricas configuradas no perfil atual (vindas do MySQL componentes_perfil) */
function metricasDoPerfilAtual() {
    const escopo = servidoresDoPerfil(estado.perfilAtual);
    const mapa = new Map();

    escopo.forEach((srv) => {
        (srv.metricasDisponiveis || []).forEach((m) => {
            if (!mapa.has(m.id)) mapa.set(m.id, m);
        });
    });

    return [...mapa.values()];
}

function garantirMetricaValida() {
    const disponiveis = metricasDoPerfilAtual();
    if (!disponiveis.length) {
        estado.metricaAtual = '';
        return;
    }

    if (disponiveis.some((m) => m.id === estado.metricaAtual)) {
        return;
    }

    // Prioriza alguma métrica que esteja em alerta nos servidores do perfil
    const escopo = servidoresDoPerfil(estado.perfilAtual);
    const metricaEmAlerta = disponiveis.find((m) =>
        escopo.some((s) => (s.metricasEmAlerta || []).some((a) => a.metrica === m.id))
    );

    estado.metricaAtual = metricaEmAlerta ? metricaEmAlerta.id : disponiveis[0].id;
}

function metricaAtualInfo() {
    const disponiveis = metricasDoPerfilAtual();
    return disponiveis.find((m) => m.id === estado.metricaAtual) || {
        id: estado.metricaAtual,
        rotulo: estado.metricaAtual || 'Métrica',
        unidade: '%',
        operador: '>',
        atencao: LIMITE_ATENCAO,
        critico: LIMITE_CRITICO
    };
}

function limitesAtuais() {
    const selecionados = servidoresSelecionados();
    const base = selecionados[0] || servidoresDoPerfil(estado.perfilAtual)[0];
    const faixa = base?.limites?.[estado.metricaAtual];
    const info = metricaAtualInfo();
    const temValor = (valor) => valor !== null && valor !== undefined && valor !== '' && Number.isFinite(Number(valor));

    return {
        operador: faixa?.operador ?? info.operador ?? '>',
        atencao: faixa?.atencao ?? info.atencao ?? LIMITE_ATENCAO,
        critico: faixa?.critico ?? info.critico ?? LIMITE_CRITICO,
        unidade: faixa?.unidade ?? info.unidade ?? '%',
        rotulo: faixa?.rotulo ?? info.rotulo ?? estado.metricaAtual,
        definidos: Boolean(faixa && temValor(faixa.atencao) && temValor(faixa.critico))
    };
}

function compararOperador(valor, operador, limite) {
    if (limite === null || limite === undefined || Number.isNaN(Number(limite))) return false;
    const lim = Number(limite);
    switch (operador) {
        case '>': return valor > lim;
        case '>=":':
        case '>=': return valor >= lim;
        case '<': return valor < lim;
        case '<=': return valor <= lim;
        case '==':
        case '=': return valor === lim;
        default: return valor >= lim;
    }
}

function nivelDoValor(valor) {
    const { operador, atencao, critico } = limitesAtuais();
    if (compararOperador(valor, operador, critico)) return 'critico';
    if (compararOperador(valor, operador, atencao)) return 'atencao';
    return 'normal';
}

function servidoresEmAlerta(servidores) {
    return servidores.filter((s) => s.status === 'critico' || s.status === 'atencao' || s.status === 'semdados');
}

function contarSituacao(servidores, situacao) { return servidores.filter((s) => s.status === situacao).length; }
function contarCriticos(servidores) { return contarSituacao(servidores, 'critico'); }
function contarAtencao(servidores) { return contarSituacao(servidores, 'atencao'); }
function contarNormais(servidores) { return contarSituacao(servidores, 'normal'); }
function contarSemDados(servidores) { return contarSituacao(servidores, 'semdados'); }
function contarEmAlerta(servidores) { return contarCriticos(servidores) + contarAtencao(servidores) + contarSemDados(servidores); }

function ordenarPorCriticidade(servidores) {
    const peso = { critico: 0, atencao: 1, semdados: 2, normal: 3 };
    return [...servidores].sort((a, b) => (
        peso[a.status] !== peso[b.status] ? peso[a.status] - peso[b.status] : minutosEmAlerta(b) - minutosEmAlerta(a)
    ));
}

function perfisExistentes() { return [...new Set(estado.servidores.map((s) => s.perfil))]; }

function corDoPerfil(servidores) {
    if (contarCriticos(servidores)) return 'critico';
    if (contarAtencao(servidores)) return 'atencao';
    if (contarSemDados(servidores)) return 'semdados';
    if (contarNormais(servidores)) return 'normal';
    return 'semdados';
}

function servidoresSelecionados() {
    return estado.servidoresSelecionados.map((id) => estado.servidores.find((s) => s.id === id)).filter(Boolean);
}

function ultimoPontoRecebido(serie) {
    for (let i = serie.length - 1; i >= 0; i -= 1) {
        if (serie[i].valor !== null) return serie[i];
    }
    return null;
}

function ultimoValor(servidor) {
    const ponto = ultimoPontoRecebido(servidor.historico[estado.metricaAtual] || []);
    return ponto ? ponto.valor : 0;
}

function rotuloMetricaAtual() {
    return limitesAtuais().rotulo;
}

function formatarValorComUnidade(valor, unidade) {
    const num = Number(valor);
    const texto = Number.isInteger(num) ? String(num) : num.toFixed(1);
    return unidade === '%' ? `${texto}%` : `${texto} ${unidade}`;
}

function descricaoDoServidor(servidor) {
    if (servidor.status === 'semdados') {
        return servidor.ultimaColeta
            ? `último dado ${ultimaColetaDe(servidor)} · sem dados há ${minutosSemDados(servidor)} min`
            : 'nenhuma coleta registrada hoje';
    }
    if (servidor.status === 'normal') return `última coleta às ${ultimaColetaDe(servidor)}`;
    // Critico e atencao ja estao no selo: nao repetir o tempo em alerta na linha.
    return '';
}

function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
}

function criarIconeJira() {
    const icone = document.createElement('img');
    icone.className = 'alertas-icone-jira';
    icone.src = '../assets/icons/jira.png';
    icone.alt = '';
    icone.setAttribute('aria-hidden', 'true');
    return icone;
}

function definirTextoBotaoChamado(link, texto) {
    const icone = link.querySelector('.alertas-icone-jira');
    link.textContent = texto;
    if (icone) link.prepend(icone);
}

function criarSvg(tag, atributos = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(atributos).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
}

function criarSvgTexto(x, y, conteudo, atributos = {}) {
    const texto = criarSvg('text', { x, y, ...atributos });
    texto.textContent = conteudo;
    return texto;
}

function resumoResolucaoAtual() {
    const vazio = { texto: '—', quantidade: 0, vazio: true };
    const dados = estado.resolucaoChamados;
    if (!dados) return vazio;
    if (estado.perfilAtual === 'todos') return dados.geral || vazio;

    const servidor = estado.servidores.find((s) => s.perfil === estado.perfilAtual);
    const idPerfil = servidor?.perfilId;
    return (idPerfil !== undefined && idPerfil !== null && dados.porPerfil?.[String(idPerfil)]) || vazio;
}

function desenharCards() {
    const container = document.getElementById('alertas-resumo');
    const escopo = servidoresDoPerfil(estado.perfilAtual);
    const resolucao = resumoResolucaoAtual();

    const cartoes = [
        { rotulo: 'Críticos', valor: String(contarCriticos(escopo)), cor: 'critico', legenda: 'servidores' },
        { rotulo: 'Atenção', valor: String(contarAtencao(escopo)), cor: 'atencao', legenda: 'servidores em atenção' },
        { rotulo: 'Sem envio de dados', valor: String(contarSemDados(escopo)), cor: 'semdados', legenda: 'servidores sem coleta' },
        {
            rotulo: 'Tempo médio de resolução de chamado',
            valor: resolucao.texto,
            cor: resolucao.vazio ? 'semdados' : 'normal',
            legenda: resolucao.vazio
                ? 'sem chamados concluídos'
                : `${resolucao.quantidade} chamado${resolucao.quantidade === 1 ? '' : 's'} concluído${resolucao.quantidade === 1 ? '' : 's'}`
        },
        { rotulo: 'Normal', valor: String(contarNormais(escopo)), cor: 'normal', legenda: 'servidores' }
    ];

    container.innerHTML = '';
    cartoes.forEach((cartao) => {
        const bloco = criarElemento('article', 'alertas-cartao');
        const rotulo = criarElemento('h2', 'alertas-cartao-rotulo');
        rotulo.append(criarElemento('span', `alertas-ponto ${cartao.cor}`), criarElemento('span', '', cartao.rotulo));
        bloco.append(
            rotulo,
            criarElemento('p', `alertas-cartao-valor ${cartao.cor}`, cartao.valor),
            criarElemento('p', 'alertas-cartao-legenda', cartao.legenda)
        );
        container.append(bloco);
    });
}

function criarChip(perfil, rotulo, contagem, ativo, cor = 'critico', esmaecido = false) {
    const chip = criarElemento('button', `alertas-chip${ativo ? ' ativo' : ''}${esmaecido ? ' esmaecido' : ''}`);
    chip.type = 'button';
    chip.dataset.perfil = perfil;
    chip.setAttribute('aria-pressed', String(ativo));
    if (perfil !== 'todos') chip.append(criarElemento('span', `alertas-ponto ${cor}`));
    chip.append(criarElemento('span', 'alertas-chip-texto', rotulo), criarElemento('span', 'alertas-chip-conta', String(contagem)));
    if (esmaecido) {
        chip.disabled = true;
        chip.setAttribute('aria-disabled', 'true');
        chip.title = 'Perfil sem servidores em alerta no momento';
    }
    return chip;
}

function desenharChips() {
    const container = document.getElementById('alertas-chips');
    container.innerHTML = '';
    container.append(criarElemento('span', 'alertas-chips-rotulo', 'Perfil de servidor'));
    container.append(criarChip('todos', 'Todos os perfis', contarEmAlerta(estado.servidores), estado.perfilAtual === 'todos'));
    perfisExistentes().forEach((perfil) => {
        const servidores = servidoresDoPerfil(perfil);
        const emAlerta = contarEmAlerta(servidores);
        container.append(criarChip(perfil, perfil, emAlerta, estado.perfilAtual === perfil, corDoPerfil(servidores), emAlerta === 0));
    });
}

function criarLinhaServidor(servidor) {
    const linha = criarElemento('tr', 'alertas-linha');
    const celulaServidor = criarElemento('td');
    const blocoServidor = criarElemento('div', 'alertas-servidor');
    blocoServidor.append(
        criarElemento('span', 'alertas-servidor-nome', servidor.nome),
        criarElemento('span', 'alertas-servidor-perfil', `${servidor.perfil} · ${servidor.mac}`)
    );
    celulaServidor.append(blocoServidor);

    const celulaSituacao = criarElemento('td');
    celulaSituacao.append(criarElemento('span', `alertas-badge ${servidor.status}`, TEXTO_SITUACAO[servidor.status]));
    const descricao = descricaoDoServidor(servidor);
    if (descricao) celulaSituacao.append(criarElemento('p', 'alertas-descricao', descricao));

    const celulaMetricas = criarElemento('td');
    const metricas = criarElemento('div', 'alertas-metricas');
    if (servidor.metricasEmAlerta.length) {
        servidor.metricasEmAlerta.forEach((m) => {
            const chip = criarElemento('span', 'alertas-metrica');
            const nivel = m.nivel || nivelDoValor(m.valor);
            const nomeMetrica = m.nome || m.metrica;
            const valorFmt = formatarValorComUnidade(m.valor, m.unidade || '%');
            chip.append(criarElemento('span', `alertas-ponto ${nivel}`));
            chip.append(criarElemento('span', '', `${nomeMetrica}: ${valorFmt}`));
            metricas.append(chip);
        });
    } else {
        metricas.append(criarElemento('span', 'alertas-metrica', servidor.status === 'semdados' ? 'sem métricas' : '—'));
    }
    celulaMetricas.append(metricas);

    const celulaAcoes = criarElemento('td', 'alertas-acoes');
    const rotuloChamado = servidor.chamado?.chave ? `Chamado ${servidor.chamado.chave}` : 'Acessar o chamado';
    const botaoChamado = criarElemento('a', 'alertas-botao-chamado', rotuloChamado);
    botaoChamado.prepend(criarIconeJira());
    botaoChamado.href = servidor.chamado?.url || '#';
    if (servidor.chamado?.url) {
        botaoChamado.target = '_blank';
        botaoChamado.rel = 'noopener noreferrer';
    }
    botaoChamado.dataset.chamado = servidor.id;

    const botaoPerfil = criarElemento('button', 'alertas-link-perfil', 'Ver perfil');
    botaoPerfil.type = 'button';
    botaoPerfil.dataset.verPerfil = servidor.id;
    celulaAcoes.append(botaoChamado, botaoPerfil);

    linha.append(celulaServidor, celulaSituacao, celulaMetricas, celulaAcoes);
    return linha;
}

function desenharLista() {
    const corpo = document.getElementById('alertas-lista');
    const vazio = document.getElementById('alertas-vazio');
    corpo.innerHTML = '';

    const visiveis = servidoresEmAlerta(servidoresDoPerfil(estado.perfilAtual));
    const ordenados = ordenarPorCriticidade(visiveis);
    ordenados.forEach((s) => corpo.append(criarLinhaServidor(s)));

    vazio.hidden = ordenados.length > 0;
    const emAlertaTotal = servidoresEmAlerta(estado.servidores).length;
    document.getElementById('alertas-resumo-lista').textContent = `Mostrando ${visiveis.length} de ${emAlertaTotal} servidores em alerta`;
    document.getElementById('alertas-selo-geral').textContent = `${ordenados.length} servidores`;
}

function desenharLateral() {
    const lista = document.getElementById('alertas-lateral-lista');
    const vazio = document.getElementById('alertas-lateral-vazio');
    lista.innerHTML = '';

    const emAlerta = servidoresEmAlerta(servidoresDoPerfil(estado.perfilAtual));
    const ordenados = ordenarPorCriticidade(emAlerta);

    ordenados.forEach((s) => {
        const selecionado = estado.servidoresSelecionados.includes(s.id);
        const item = criarElemento('li', 'alertas-lateral-item');
        if (selecionado) item.classList.add('selecionado');

        const topo = criarElemento('div', 'alertas-lateral-topo');
        topo.append(criarElemento('span', 'alertas-lateral-nome', s.nome), criarElemento('span', `alertas-badge ${s.status}`, TEXTO_SITUACAO[s.status]));

        const botao = criarElemento('button', 'alertas-lateral-botao', selecionado ? 'Selecionado' : 'Selecionar');
        botao.type = 'button';
        botao.dataset.servidor = s.id;
        botao.setAttribute('aria-pressed', String(selecionado));

        item.append(topo, botao);
        lista.append(item);
    });

    vazio.hidden = ordenados.length > 0;
    const emAlertaTotal = servidoresEmAlerta(estado.servidores).length;
    document.getElementById('alertas-resumo-lateral').textContent = `Mostrando ${emAlerta.length} de ${emAlertaTotal} servidores em alerta`;
    document.getElementById('alertas-selo-lateral').textContent = `${emAlerta.length} servidores`;
    document.getElementById('alertas-selo-grafico').textContent = `${ordenados.length} servidores`;
    document.getElementById('alertas-resumo-grafico').textContent = `Evolução de ${rotuloMetricaAtual()} dos servidores em alerta do perfil ${estado.perfilAtual}.`;
}

function desenharLegenda() {
    const legenda = document.getElementById('alertas-legend');
    legenda.innerHTML = '';
    const { definidos } = limitesAtuais();
    const usarLimiares = definidos;
    servidoresSelecionados().forEach((s) => {
        const item = criarElemento('li', 'alertas-legend-item');
        const nivel = s.status === 'semdados' ? 'semdados' : (usarLimiares ? nivelDoValor(ultimoValor(s)) : 'normal');
        item.append(criarElemento('span', `alertas-ponto ${nivel}`), criarElemento('span', '', `${s.nome} - ${s.perfil}`));
        legenda.append(item);
    });
}

function temposDoGrafico(servidores) {
    const tempos = new Set();
    servidores.forEach((s) => (s.historico[estado.metricaAtual] || []).forEach((p) => tempos.add(p.hora)));
    return [...tempos].sort((a, b) => minutosDaHora(a) - minutosDaHora(b));
}

function desenharGrafico() {
    const area = document.getElementById('alertas-grafico-area');
    area.innerHTML = '';
    const servidores = servidoresSelecionados();
    const { atencao: limiteAtencao, critico: limiteCritico, unidade, rotulo, operador, definidos } = limitesAtuais();
    desenharAvisoSemDados();

    if (!servidores.length) {
        area.append(criarElemento('p', 'alertas-grafico-vazio', 'Selecione um servidor na lista ao lado para desenhar a evolução.'));
        return;
    }

    const largura = 940, altura = 420;
    const margem = { topo: 26, direita: 150, baixo: 48, esquerda: 68 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.baixo;

    const numeroOuNulo = (valor) => {
        if (valor === null || valor === undefined || valor === '') return null;
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : null;
    };

    const limiteAtencaoNum = numeroOuNulo(limiteAtencao);
    const limiteCriticoNum = numeroOuNulo(limiteCritico);
    const metricaPercentual = unidade === '%';
    const menorEhPior = operador === '<' || operador === '<=';
    // Desenha limiares para qualquer unidade desde que os dois valores estejam configurados na API.
    const usarLimiares = definidos;
    const exibirAtencao = usarLimiares && limiteAtencaoNum !== null;
    const exibirCritico = usarLimiares && limiteCriticoNum !== null;
    const exibirFaixas = exibirAtencao && exibirCritico;

    const series = servidores.map((servidor) => {
        const pontos = (servidor.historico[estado.metricaAtual] || []).map((ponto) => ({
            hora: ponto.hora,
            valor: numeroOuNulo(ponto.valor)
        }));
        return { servidor, pontos };
    });

    // Servidores sem dados não entram na escala: o gráfico deles mostra apenas eixos, faixas e limiares.
    const valores = series
        .filter(({ servidor }) => servidor.status !== 'semdados')
        .flatMap(({ pontos }) => pontos.map((ponto) => ponto.valor).filter((valor) => valor !== null));

    const candidatosEscala = [...valores];
    if (exibirAtencao) candidatosEscala.push(limiteAtencaoNum);
    if (exibirCritico) candidatosEscala.push(limiteCriticoNum);

    let minEscala = 0;
    let maxEscala = 100;

    if (metricaPercentual) {
        const menor = candidatosEscala.length ? Math.min(...candidatosEscala) : 0;
        const maior = candidatosEscala.length ? Math.max(...candidatosEscala) : 100;
        minEscala = Math.max(0, Math.floor(menor / 10) * 10 - 10);
        maxEscala = Math.max(100, Math.ceil(maior / 10) * 10);
        if (maxEscala <= minEscala) maxEscala = minEscala + 10;
    } else {
        // Inclui os limiares na escala e arredonda uma única vez, antes de desenhar as faixas.
        const maior = candidatosEscala.length ? Math.max(...candidatosEscala) : 100;
        const escalaBase = Math.ceil((maior * 1.2) / 10) * 10 || 100;
        const passoIdeal = escalaBase / 5;
        const magnitude = 10 ** Math.floor(Math.log10(passoIdeal || 1));
        const passo = Math.max(1, Math.ceil(passoIdeal / magnitude) * magnitude);
        maxEscala = Math.ceil(escalaBase / passo) * passo;
        minEscala = 0;
    }

    const tempos = temposDoGrafico(servidores);
    const indicePorHora = new Map(tempos.map((hora, indice) => [hora, indice]));

    const timeToX = (hora) => {
        if (tempos.length <= 1) return margem.esquerda + areaLargura / 2;
        const indice = indicePorHora.has(hora) ? indicePorHora.get(hora) : 0;
        return margem.esquerda + (indice / (tempos.length - 1)) * areaLargura;
    };

    const valueToY = (valor) => {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return margem.topo + areaAltura;
        const proporcao = (numero - minEscala) / (maxEscala - minEscala);
        const limitada = Math.min(1, Math.max(0, proporcao));
        return margem.topo + areaAltura - limitada * areaAltura;
    };

    // Um horário fica sem dados quando qualquer servidor selecionado não tem coleta nele.
    const horariosSemDados = new Set();
    tempos.forEach((hora) => {
        const semColeta = series.some(({ pontos }) => {
            const valor = pontos.find((ponto) => ponto.hora === hora)?.valor;
            return valor === null || valor === undefined;
        });
        if (semColeta) horariosSemDados.add(hora);
    });

    const lacunas = [];
    let inicioLacuna = -1;
    tempos.forEach((hora, indice) => {
        if (horariosSemDados.has(hora)) {
            if (inicioLacuna === -1) inicioLacuna = indice;
        } else if (inicioLacuna !== -1) {
            lacunas.push([inicioLacuna, indice - 1]);
            inicioLacuna = -1;
        }
    });
    if (inicioLacuna !== -1) lacunas.push([inicioLacuna, tempos.length - 1]);

    const classificar = (valor) => (usarLimiares ? nivelDoValor(valor) : 'normal');

    const svg = criarSvg('svg', { viewBox: `0 0 ${largura} ${altura}`, class: 'alertas-svg', role: 'img' });
    const tituloEixoY = rotulo.includes('(') ? rotulo : `${rotulo} (${unidade})`;
    svg.setAttribute('aria-label', `Evolução de ${tituloEixoY} no período`);

    // Faixas de fundo: atenção entre os dois limiares e crítico do limiar crítico até o topo.
    if (exibirFaixas) {
        if (menorEhPior) {
            // Para operadores "<", o pior fica embaixo: crítico do piso até o limiar e atenção entre os dois.
            svg.append(criarSvg('rect', {
                x: margem.esquerda,
                y: valueToY(limiteCriticoNum),
                width: areaLargura,
                height: Math.max(0, valueToY(minEscala) - valueToY(limiteCriticoNum)),
                fill: 'rgba(204, 3, 1, 0.08)'
            }));
            svg.append(criarSvg('rect', {
                x: margem.esquerda,
                y: valueToY(limiteAtencaoNum),
                width: areaLargura,
                height: Math.max(0, valueToY(limiteCriticoNum) - valueToY(limiteAtencaoNum)),
                fill: 'rgba(226, 137, 27, 0.10)'
            }));
        } else {
            svg.append(criarSvg('rect', {
                x: margem.esquerda,
                y: valueToY(maxEscala),
                width: areaLargura,
                height: Math.max(0, valueToY(limiteCriticoNum) - valueToY(maxEscala)),
                fill: 'rgba(204, 3, 1, 0.08)'
            }));
            svg.append(criarSvg('rect', {
                x: margem.esquerda,
                y: valueToY(limiteCriticoNum),
                width: areaLargura,
                height: Math.max(0, valueToY(limiteAtencaoNum) - valueToY(limiteCriticoNum)),
                fill: 'rgba(226, 137, 27, 0.10)'
            }));
        }
    }

    // Grade e rótulos do eixo Y. Para % usa passos de 10 ou 20; para outras unidades, passos "redondos".
    const ticksY = [];
    if (metricaPercentual) {
        const passo = maxEscala - minEscala <= 100 ? 10 : 20;
        for (let valor = minEscala; valor <= maxEscala; valor += passo) ticksY.push(valor);
        if (ticksY[ticksY.length - 1] !== maxEscala) ticksY.push(maxEscala);
    } else {
        const passoIdeal = maxEscala / 5;
        const magnitude = 10 ** Math.floor(Math.log10(passoIdeal || 1));
        const passo = Math.max(1, Math.ceil(passoIdeal / magnitude) * magnitude);
        for (let valor = 0; valor <= maxEscala; valor += passo) ticksY.push(valor);
    }

    ticksY.forEach((valor) => {
        const y = valueToY(valor);
        svg.append(criarSvg('line', {
            x1: margem.esquerda,
            y1: y,
            x2: margem.esquerda + areaLargura,
            y2: y,
            stroke: '#e6e9ef',
            'stroke-width': 1
        }));
        const textoEixo = metricaPercentual ? `${valor}%` : String(Number(valor.toFixed(2)));
        svg.append(criarSvgTexto(margem.esquerda - 10, y + 4, textoEixo, {
            'text-anchor': 'end',
            fill: '#6b7280',
            'font-size': 12
        }));
    });

    svg.append(criarSvgTexto(4, 16, tituloEixoY, { fill: '#6b7280', 'font-size': 13 }));

    // Intervalos sem coleta: linha tracejada cinza na base do gráfico (ponto zero).
    const passoX = tempos.length > 1 ? areaLargura / (tempos.length - 1) : areaLargura;
    const yZero = valueToY(0);
    lacunas.forEach(([inicio, fim]) => {
        const x1 = Math.max(margem.esquerda, timeToX(tempos[inicio]) - passoX / 2);
        const x2 = Math.min(margem.esquerda + areaLargura, timeToX(tempos[fim]) + passoX / 2);
        svg.append(criarSvg('line', {
            x1,
            y1: yZero,
            x2,
            y2: yZero,
            stroke: '#8a8f9c',
            'stroke-width': 2,
            'stroke-dasharray': '6 5'
        }));
    });

    // Linhas tracejadas dos limiares, com o rótulo dentro da área e logo acima de cada linha.
    const limites = [];
    if (exibirAtencao) {
        limites.push({ valor: limiteAtencaoNum, nivel: 'atencao', texto: `Atenção · ${formatarValorComUnidade(limiteAtencaoNum, unidade)}` });
    }
    if (exibirCritico) {
        limites.push({ valor: limiteCriticoNum, nivel: 'critico', texto: `Crítico · ${formatarValorComUnidade(limiteCriticoNum, unidade)}` });
    }
    limites.forEach((limite) => {
        const y = valueToY(limite.valor);
        svg.append(criarSvg('line', {
            x1: margem.esquerda,
            y1: y,
            x2: margem.esquerda + areaLargura,
            y2: y,
            stroke: COR_SITUACAO[limite.nivel],
            'stroke-width': 1.5,
            'stroke-dasharray': '6 5'
        }));
    });

    tempos.forEach((hora) => {
        svg.append(criarSvgTexto(timeToX(hora), margem.topo + areaAltura + 28, hora, {
            'text-anchor': 'middle',
            fill: '#6b7280',
            'font-size': 12.5
        }));
    });

    const desenharEtiquetaHora = (x, y, texto) => {
        const larguraEtiqueta = Math.max(34, texto.length * 7 + 12);
        const alturaEtiqueta = 18;
        const xMinimo = margem.esquerda + 2;
        const xMaximo = margem.esquerda + areaLargura - larguraEtiqueta - 2;
        const xEtiqueta = Math.min(Math.max(x - larguraEtiqueta / 2, xMinimo), Math.max(xMinimo, xMaximo));
        let yEtiqueta = y - 26;
        if (yEtiqueta < margem.topo + 2) yEtiqueta = y + 8;
        if (yEtiqueta + alturaEtiqueta > margem.topo + areaAltura - 2) yEtiqueta = y - 26;
        svg.append(criarSvg('rect', {
            x: xEtiqueta,
            y: yEtiqueta,
            width: larguraEtiqueta,
            height: alturaEtiqueta,
            rx: 9,
            fill: '#ffffff',
            stroke: '#d9dee7',
            'stroke-width': 1
        }));
        svg.append(criarSvgTexto(xEtiqueta + larguraEtiqueta / 2, yEtiqueta + 12.5, texto, {
            'text-anchor': 'middle',
            fill: '#4b4350',
            'font-size': 11,
            'font-weight': 600
        }));
    };

    const horaInterpolada = (horaInicio, horaFim, fracao) => {
        const inicio = minutosDaHora(horaInicio);
        let fim = minutosDaHora(horaFim);
        if (fim < inicio) fim += 24 * 60;
        const total = ((Math.round(inicio + (fim - inicio) * fracao) % (24 * 60)) + 24 * 60) % (24 * 60);
        const horas = Math.floor(total / 60);
        const minutos = total % 60;
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
    };

    const rankNivel = { normal: 0, atencao: 1, critico: 2 };

    series.forEach(({ servidor, pontos }) => {
        if (servidor.status === 'semdados') return;

        const pontosComCoordenadas = pontos.map((ponto) => {
            if (ponto.valor === null) return null;
            return {
                ...ponto,
                x: timeToX(ponto.hora),
                y: valueToY(ponto.valor)
            };
        });

        const pontosValidos = pontosComCoordenadas.filter(Boolean);
        if (!pontosValidos.length) return;

        for (let indice = 0; indice < pontosComCoordenadas.length - 1; indice += 1) {
            const inicio = pontosComCoordenadas[indice];
            const fim = pontosComCoordenadas[indice + 1];
            if (!inicio || !fim) continue;

            const cruzamentos = [];
            if (exibirAtencao && (inicio.valor - limiteAtencaoNum) * (fim.valor - limiteAtencaoNum) < 0) {
                const fracao = (limiteAtencaoNum - inicio.valor) / (fim.valor - inicio.valor);
                cruzamentos.push({
                    valor: limiteAtencaoNum,
                    nivel: 'atencao',
                    x: inicio.x + fracao * (fim.x - inicio.x),
                    y: valueToY(limiteAtencaoNum),
                    hora: horaInterpolada(inicio.hora, fim.hora, fracao)
                });
            }
            if (exibirCritico && (inicio.valor - limiteCriticoNum) * (fim.valor - limiteCriticoNum) < 0) {
                const fracao = (limiteCriticoNum - inicio.valor) / (fim.valor - inicio.valor);
                cruzamentos.push({
                    valor: limiteCriticoNum,
                    nivel: 'critico',
                    x: inicio.x + fracao * (fim.x - inicio.x),
                    y: valueToY(limiteCriticoNum),
                    hora: horaInterpolada(inicio.hora, fim.hora, fracao)
                });
            }
            cruzamentos.sort((a, b) => a.x - b.x);

            const pontosSegmento = [
                { valor: inicio.valor, x: inicio.x, y: inicio.y },
                ...cruzamentos,
                { valor: fim.valor, x: fim.x, y: fim.y }
            ];

            for (let parte = 0; parte < pontosSegmento.length - 1; parte += 1) {
                const trechoInicio = pontosSegmento[parte];
                const trechoFim = pontosSegmento[parte + 1];
                const valorMedio = (trechoInicio.valor + trechoFim.valor) / 2;
                const nivel = classificar(valorMedio);
                svg.append(criarSvg('line', {
                    x1: trechoInicio.x,
                    y1: trechoInicio.y,
                    x2: trechoFim.x,
                    y2: trechoFim.y,
                    stroke: COR_SITUACAO[nivel],
                    'stroke-width': 2.6,
                    'stroke-linecap': 'round'
                }));
            }

            // Marca apenas a entrada em um nível pior, com o horário exato do cruzamento.
            cruzamentos.forEach((cruzamento) => {
                const posicao = pontosSegmento.indexOf(cruzamento);
                const anterior = pontosSegmento[posicao - 1];
                const proximo = pontosSegmento[posicao + 1];
                const nivelAntes = classificar((anterior.valor + cruzamento.valor) / 2);
                const nivelDepois = classificar((cruzamento.valor + proximo.valor) / 2);
                if (rankNivel[nivelDepois] <= rankNivel[nivelAntes]) return;

                svg.append(criarSvg('circle', {
                    cx: cruzamento.x,
                    cy: cruzamento.y,
                    r: 4,
                    fill: COR_SITUACAO[cruzamento.nivel],
                    stroke: '#ffffff',
                    'stroke-width': 1.8
                }));
                desenharEtiquetaHora(cruzamento.x, cruzamento.y, cruzamento.hora);
            });
        }

        pontosValidos.forEach((ponto) => {
            svg.append(criarSvg('circle', {
                cx: ponto.x,
                cy: ponto.y,
                r: 2.8,
                fill: COR_SITUACAO[classificar(ponto.valor)],
                stroke: '#ffffff',
                'stroke-width': 1
            }));
        });

        const ultimo = pontosValidos[pontosValidos.length - 1];
        const nivelUltimo = classificar(ultimo.valor);
        const textoUltimo = `${servidor.nome} · ${formatarValorComUnidade(Math.round(ultimo.valor * 10) / 10, unidade)}`;
        const larguraEtiqueta = Math.max(76, textoUltimo.length * 7 + 20);
        const alturaEtiqueta = 24;
        let xEtiqueta = ultimo.x + 12;
        if (xEtiqueta + larguraEtiqueta > largura - 4) xEtiqueta = ultimo.x - 12 - larguraEtiqueta;
        xEtiqueta = Math.max(margem.esquerda, Math.min(xEtiqueta, largura - larguraEtiqueta - 4));
        let yEtiqueta = ultimo.y - alturaEtiqueta / 2;
        yEtiqueta = Math.max(margem.topo + 2, Math.min(yEtiqueta, margem.topo + areaAltura - alturaEtiqueta - 2));

        svg.append(criarSvg('circle', {
            cx: ultimo.x,
            cy: ultimo.y,
            r: 5,
            fill: COR_SITUACAO[nivelUltimo],
            stroke: '#ffffff',
            'stroke-width': 2
        }));
        svg.append(criarSvg('rect', {
            x: xEtiqueta,
            y: yEtiqueta,
            width: larguraEtiqueta,
            height: alturaEtiqueta,
            rx: 12,
            fill: '#ffffff',
            stroke: COR_SITUACAO[nivelUltimo],
            'stroke-width': 1.5
        }));
        svg.append(criarSvgTexto(xEtiqueta + larguraEtiqueta / 2, yEtiqueta + 16, textoUltimo, {
            'text-anchor': 'middle',
            fill: COR_SITUACAO[nivelUltimo],
            'font-size': 12,
            'font-weight': 600
        }));
    });

    // Rótulos dos limiares por cima das linhas de dados, para não serem cobertos.
    limites.forEach((limite) => {
        const y = valueToY(limite.valor);
        const yTexto = y - 6 < margem.topo + 12 ? y + 16 : y - 6;
        svg.append(criarSvgTexto(margem.esquerda + 8, yTexto, limite.texto, {
            'text-anchor': 'start',
            fill: COR_SITUACAO[limite.nivel],
            'font-size': 12.5,
            'font-weight': 600
        }));
    });

    const periodoInteiroSemDados = tempos.length === 0 ||
        (lacunas.length === 1 && lacunas[0][0] === 0 && lacunas[0][1] === tempos.length - 1);

    if (periodoInteiroSemDados) {
        svg.append(criarSvgTexto(margem.esquerda + areaLargura / 2, margem.topo + areaAltura / 2, 'Sem coletas no período', {
            'text-anchor': 'middle',
            fill: '#8a8f9c',
            'font-size': 15,
            'font-weight': 500
        }));
    }

    area.append(svg);
}

function desenharAvisoSemDados() {
    const aviso = document.getElementById('alertas-grafico-aviso');
    const semDados = servidoresSelecionados().filter((s) => s.status === 'semdados');
    aviso.innerHTML = '';
    aviso.hidden = semDados.length === 0;
    semDados.forEach((s) => {
        const texto = s.ultimaColeta ? `${s.nome} · Sem dados há ${minutosSemDados(s)} min · última coleta ${ultimaColetaDe(s)}` : `${s.nome} · Nenhuma coleta registrada hoje`;
        aviso.append(criarElemento('span', 'alertas-grafico-aviso-item', texto));
    });
}

/* Renderiza dinamicamente os botões de métrica (#alertas-abas) com base nas métricas reais do perfil */
function atualizarAbas() {
    const container = document.getElementById('alertas-abas');
    if (!container) return;

    garantirMetricaValida();
    const metricas = metricasDoPerfilAtual();
    const modeloExistente = container.querySelector('[data-metrica]');
    const classeAba = modeloExistente ? modeloExistente.className : 'alertas-aba';

    container.innerHTML = '';
    metricas.forEach((m) => {
        const ativo = m.id === estado.metricaAtual;
        const botao = criarElemento('button', classeAba, m.rotulo);
        botao.type = 'button';
        botao.role = 'tab';
        botao.dataset.metrica = m.id;
        botao.setAttribute('aria-selected', String(ativo));
        container.append(botao);
    });
}

function limparSecaoPerfil() {
    ['alertas-legend', 'alertas-grafico-area', 'alertas-lateral-lista', 'alertas-grafico-aviso', 'alertas-abas'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
    document.getElementById('alertas-grafico-aviso').hidden = true;
    ['alertas-selo-grafico', 'alertas-resumo-grafico', 'alertas-selo-lateral', 'alertas-resumo-lateral'].forEach((id) => { document.getElementById(id).textContent = ''; });
}

function atualizarTudo() {
    // Um servidor pode ter saido da resposta porque todos os chamados foram concluidos.
    const idsDisponiveis = new Set(estado.servidores.map((s) => s.id));
    estado.servidoresSelecionados = estado.servidoresSelecionados.filter((id) => idsDisponiveis.has(id));

    const emPerfil = estado.perfilAtual !== 'todos';
    document.getElementById('alertas-painel-geral').hidden = emPerfil;
    document.getElementById('alertas-painel-perfil').hidden = !emPerfil;
    document.getElementById('alertas-painel-grafico').hidden = !emPerfil;
    document.getElementById('alertas-painel-lateral').hidden = !emPerfil;

    // O selo so existe no DOM quando um perfil especifico esta selecionado.
    let selo = document.getElementById('alertas-selo-perfil');
    if (emPerfil) {
        if (!selo) {
            selo = criarElemento('span', 'alertas-selo-perfil');
            selo.id = 'alertas-selo-perfil';
            document.querySelector('.alertas-cabecalho').append(selo);
        }
        selo.innerHTML = '';
        selo.append(criarElemento('span', 'alertas-ponto critico'), criarElemento('span', '', estado.perfilAtual));
    } else if (selo) {
        selo.remove();
    }
    document.getElementById('alertas-grafico-perfil').textContent = emPerfil ? estado.perfilAtual : '';

    desenharCards();
    desenharChips();
    desenharLista();
    atualizarAbas();

    if (emPerfil) {
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    } else {
        limparSecaoPerfil();
    }
}

function trocarPerfil(perfil, servidorPreferido = null) {
    if (!servidorPreferido && perfil === estado.perfilAtual) return;
    estado.perfilAtual = perfil;
    if (perfil === 'todos') {
        estado.servidoresSelecionados = [];
        atualizarTudo();
        return;
    }
    const emAlerta = servidoresEmAlerta(servidoresDoPerfil(perfil));
    const alvo = servidorPreferido || ordenarPorCriticidade(emAlerta)[0];
    estado.servidoresSelecionados = alvo ? [alvo.id] : [];
    atualizarTudo();
}

function alternarSelecao(id) {
    const pos = estado.servidoresSelecionados.indexOf(id);
    if (pos >= 0) {
        estado.servidoresSelecionados.splice(pos, 1);
    } else {
        if (estado.servidoresSelecionados.length >= MAX_SERVIDORES_SELECIONADOS) return;
        estado.servidoresSelecionados.push(id);
    }
    desenharLateral();
    desenharLegenda();
    desenharGrafico();
}

async function tratarCliqueChamado(link, servidor) {
    if (servidor.chamado?.url) {
        window.open(servidor.chamado.url, '_blank', 'noopener,noreferrer');
        return;
    }
    const textoOriginal = link.textContent;
    definirTextoBotaoChamado(link, 'Buscando chamado...');
    try {
        const resp = await fetch('/alertas/chamado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mac: servidor.mac,
                nomeServidor: servidor.nome,
                perfil: servidor.perfil,
                metricaPrincipal: servidor.metricasEmAlerta[0] || null,
                nivel: servidor.status
            })
        });
        const dados = await resp.json();
        if (dados.url) {
            servidor.chamado = dados;
            link.href = dados.url;
            definirTextoBotaoChamado(link, `Chamado ${dados.chave}`);
            window.open(dados.url, '_blank', 'noopener,noreferrer');
        } else {
            definirTextoBotaoChamado(link, textoOriginal);
            alert('Integração com o Jira ainda não configurada no servidor.');
        }
    } catch (erro) {
        console.error(erro);
        definirTextoBotaoChamado(link, textoOriginal);
        alert('Não foi possível acessar ou abrir o chamado no Jira.');
    }
}

function iniciarEventos() {
    document.getElementById('alertas-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('.alertas-chip');
        if (chip) trocarPerfil(chip.dataset.perfil);
    });

    const abasEl = document.getElementById('alertas-abas');
    abasEl.addEventListener('click', (e) => {
        const aba = e.target.closest('[data-metrica]');
        if (!aba) return;
        estado.metricaAtual = aba.dataset.metrica;
        atualizarAbas();
        desenharLateral();
        desenharLegenda();
        desenharGrafico();
    });

    abasEl.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            abasEl.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    document.getElementById('alertas-lateral-lista').addEventListener('click', (e) => {
        const botao = e.target.closest('[data-servidor]');
        if (botao) alternarSelecao(botao.dataset.servidor);
    });

    document.getElementById('alertas-lista').addEventListener('click', (e) => {
        const chamado = e.target.closest('[data-chamado]');
        if (chamado) {
            e.preventDefault();
            const servidor = estado.servidores.find((item) => item.id === chamado.dataset.chamado);
            if (servidor) tratarCliqueChamado(chamado, servidor);
            return;
        }
        const verPerfil = e.target.closest('[data-ver-perfil]');
        if (verPerfil) {
            const servidor = estado.servidores.find((item) => item.id === verPerfil.dataset.verPerfil);
            if (servidor) trocarPerfil(servidor.perfil, servidor.id);
        }
    });

    document.getElementById('alertas-atualizar').addEventListener('click', async (e) => {
        const botao = e.currentTarget;
        botao.classList.remove('girando');
        void botao.offsetWidth;
        botao.classList.add('girando');
        mostrarMensagem('Carregando alertas…');
        try {
            estado.servidores = await obterServidoresEmAlerta();
            document.getElementById('alertas-hora-atualizacao').textContent = HORA_ATUALIZACAO;
            atualizarTudo();
            mostrarMensagem('');
        } catch (erro) {
            console.error(erro);
            mostrarMensagem(MENSAGEM_ERRO_ALERTAS, 'alert');
        }
    });

    // Redesenha o SVG após o redimensionamento, mantendo eixos, faixas e rótulos alinhados.
    let temporizadorRedimensionamento;
    window.addEventListener('resize', () => {
        clearTimeout(temporizadorRedimensionamento);
        temporizadorRedimensionamento = setTimeout(() => {
            if (!document.getElementById('alertas-painel-grafico').hidden) desenharGrafico();
        }, 150);
    });
}

async function iniciar() {
    // Registra os eventos antes da busca para que o botao Atualizar funcione mesmo
    // se a primeira carga falhar.
    iniciarEventos();
    mostrarMensagem('Carregando alertas…');
    estado.servidores = await obterServidoresEmAlerta();
    document.getElementById('alertas-hora-atualizacao').textContent = HORA_ATUALIZACAO;

    // chegando com ?perfil=Financeiro (ex.: vindo da Geral), ja abre filtrado nesse perfil
    const perfilDaURL = new URLSearchParams(location.search).get('perfil');
    if (perfilDaURL) {
        trocarPerfil(perfilDaURL);
    } else {
        atualizarTudo();
    }

    mostrarMensagem('');
}

iniciar().catch((erro) => {
    console.error(erro);
    mostrarMensagem(MENSAGEM_ERRO_ALERTAS, 'alert');
});
