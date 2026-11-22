let LIMITE_ATENCAO = 70;
let LIMITE_CRITICO = 85;
let HORA_ATUALIZACAO = '--:--';

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
    const resposta = await fetch(`/alertas/servidores?${params.toString()}`);
    if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status} ao buscar alertas.`);

    const dados = await resposta.json();
    HORA_ATUALIZACAO = dados.horaAtualizacao || HORA_ATUALIZACAO;
    return dados.servidores || [];
}

function mostrarMensagem(texto, papel = 'status') {
    const mensagem = document.getElementById('alertas-estado');
    mensagem.textContent = texto;
    mensagem.hidden = !texto;
    mensagem.setAttribute('role', papel);
}

const estado = { perfilAtual: 'todos', metricaAtual: '', servidoresSelecionados: [], servidores: [] };

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

    return {
        operador: faixa?.operador ?? info.operador ?? '>',
        atencao: faixa?.atencao ?? info.atencao ?? LIMITE_ATENCAO,
        critico: faixa?.critico ?? info.critico ?? LIMITE_CRITICO,
        unidade: faixa?.unidade ?? info.unidade ?? '%',
        rotulo: faixa?.rotulo ?? info.rotulo ?? estado.metricaAtual
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
    const num = Number.isInteger(valor) ? String(valor) : Number(valor).toFixed(1);
    return unidade === '%' ? `${num}%` : `${num} ${unidade}`;
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

function desenharCards() {
    const container = document.getElementById('alertas-resumo');
    const escopo = servidoresDoPerfil(estado.perfilAtual);

    const cartoes = [
        { rotulo: 'Críticos', valor: String(contarCriticos(escopo)), cor: 'critico', legenda: 'servidores' },
        { rotulo: 'Atenção', valor: String(contarAtencao(escopo)), cor: 'atencao', legenda: 'servidores em atenção' },
        { rotulo: 'Sem envio de dados', valor: String(contarSemDados(escopo)), cor: 'semdados', legenda: 'servidores sem coleta' },
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
    servidoresSelecionados().forEach((s) => {
        const item = criarElemento('li', 'alertas-legend-item');
        const nivel = s.status === 'semdados' ? 'semdados' : nivelDoValor(ultimoValor(s));
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
    const { atencao: limiteAtencao, critico: limiteCritico, unidade, rotulo, operador } = limitesAtuais();
    desenharAvisoSemDados();

    if (!servidores.length) {
        area.append(criarElemento('p', 'alertas-grafico-vazio', 'Selecione um servidor na lista ao lado para desenhar a evolução.'));
        return;
    }

    const largura = 940, altura = 420;
    const margem = { topo: 26, direita: 104, baixo: 48, esquerda: 68 };
    const areaLargura = largura - margem.esquerda - margem.direita;
    const areaAltura = altura - margem.topo - margem.baixo;

    // Define a escala vertical: 0-100 quando for %, ou automática para outras unidades (MHz, MB/s, °C, etc.)
    let maxEscala = 100;
    if (unidade !== '%') {
        const valores = servidores.flatMap((s) =>
            (s.historico[estado.metricaAtual] || []).map((p) => p.valor).filter((v) => v !== null)
        );
        const candidatos = [...valores, Number(limiteCritico) || 0, Number(limiteAtencao) || 0].filter((n) => n > 0);
        const maior = candidatos.length ? Math.max(...candidatos) : 100;
        maxEscala = Math.ceil((maior * 1.2) / 10) * 10 || 100;
    }

    const tempos = temposDoGrafico(servidores);
    const posX = (hora) => margem.esquerda + (Math.max(0, tempos.indexOf(hora)) / Math.max(1, tempos.length - 1)) * areaLargura;
    const posY = (valor) => margem.topo + areaAltura - (Math.min(maxEscala, Math.max(0, valor)) / maxEscala) * areaAltura;

    const svg = criarSvg('svg', { viewBox: `0 0 ${largura} ${altura}`, class: 'alertas-svg', role: 'img' });

    const temAtencao = limiteAtencao !== null && limiteAtencao !== undefined;
    const temCritico = limiteCritico !== null && limiteCritico !== undefined;
    const menorEhPior = operador === '<' || operador === '<=';

    if (temCritico && !menorEhPior) {
        svg.append(criarSvg('rect', { x: margem.esquerda, y: posY(maxEscala), width: areaLargura, height: Math.max(0, posY(limiteCritico) - posY(maxEscala)), fill: 'rgba(204, 3, 1, 0.08)' }));
    }
    if (temAtencao && temCritico && !menorEhPior) {
        svg.append(criarSvg('rect', { x: margem.esquerda, y: posY(limiteCritico), width: areaLargura, height: Math.max(0, posY(limiteAtencao) - posY(limiteCritico)), fill: 'rgba(226, 137, 27, 0.10)' }));
    }

    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((fator) => {
        const valor = Math.round(maxEscala * fator);
        svg.append(criarSvg('line', { x1: margem.esquerda, y1: posY(valor), x2: margem.esquerda + areaLargura, y2: posY(valor), stroke: '#e6e9ef', 'stroke-width': 1 }));
const tituloEixoY = rotulo.includes(`(${unidade})`) ? rotulo : `${rotulo} (${unidade})`;
svg.append(criarSvgTexto(4, 16, tituloEixoY, { fill: '#6b7280', 'font-size': 13 }));
    });

    [
        temCritico ? { limite: limiteCritico, nivel: 'critico', texto: `Crítico: ${formatarValorComUnidade(limiteCritico, unidade)}` } : null,
        temAtencao ? { limite: limiteAtencao, nivel: 'atencao', texto: `Atenção: ${formatarValorComUnidade(limiteAtencao, unidade)}` } : null
    ].filter(Boolean).forEach((faixa) => {
        svg.append(criarSvg('line', { x1: margem.esquerda, y1: posY(faixa.limite), x2: margem.esquerda + areaLargura, y2: posY(faixa.limite), stroke: COR_SITUACAO[faixa.nivel], 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
        svg.append(criarSvgTexto(margem.esquerda + areaLargura - 8, posY(faixa.limite) - 8, faixa.texto, { 'text-anchor': 'end', fill: COR_SITUACAO[faixa.nivel], 'font-size': 13, 'font-weight': 600 }));
    });

    tempos.forEach((hora) => svg.append(criarSvgTexto(posX(hora), margem.topo + areaAltura + 28, hora, { 'text-anchor': 'middle', fill: '#6b7280', 'font-size': 13 })));
    svg.append(criarSvgTexto(4, 16, `${rotulo} (${unidade})`, { fill: '#6b7280', 'font-size': 13 }));

    servidores.forEach((s) => {
        if (s.status !== 'semdados') return;
        const ultimo = ultimoPontoRecebido(s.historico[estado.metricaAtual] || []);
        if (ultimo) desenharFaixaSemDados(svg, ultimo, posX, posY, tempos, maxEscala);
    });

    servidores.forEach((s) => {
        const serie = s.historico[estado.metricaAtual] || [];
        if (!serie.length) return;

        for (let i = 0; i < serie.length - 1; i += 1) {
            if (serie[i].valor === null || serie[i + 1].valor === null) continue;
            const nivel = nivelDoValor(menorEhPior ? Math.min(serie[i].valor, serie[i + 1].valor) : Math.max(serie[i].valor, serie[i + 1].valor));
            svg.append(criarSvg('line', { x1: posX(serie[i].hora), y1: posY(serie[i].valor), x2: posX(serie[i + 1].hora), y2: posY(serie[i + 1].valor), stroke: COR_SITUACAO[nivel], 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
        }

        serie.forEach((p) => {
            if (p.valor === null) return;
            svg.append(criarSvg('circle', { cx: posX(p.hora), cy: posY(p.valor), r: 4, fill: '#ffffff', stroke: COR_SITUACAO[nivelDoValor(p.valor)], 'stroke-width': 2.2 }));
        });

        const ultimo = ultimoPontoRecebido(serie);
        if (!ultimo) return;
        if (s.status === 'semdados') {
            desenharMarcadorParada(svg, ultimo, posX, posY, margem, areaLargura);
            return;
        }
        const nivel = nivelDoValor(ultimo.valor);
        const textoBadge = formatarValorComUnidade(Math.round(ultimo.valor * 10) / 10, unidade);
        const larguraBadge = Math.max(62, textoBadge.length * 8 + 20);
        svg.append(criarSvg('rect', { x: posX(ultimo.hora) + 10, y: posY(ultimo.valor) - 12, width: larguraBadge, height: 24, rx: 12, fill: COR_SITUACAO[nivel] }));
        svg.append(criarSvgTexto(posX(ultimo.hora) + 10 + larguraBadge / 2, posY(ultimo.valor) + 5, textoBadge, { 'text-anchor': 'middle', fill: '#ffffff', 'font-size': 12, 'font-weight': 600 }));
    });

    area.append(svg);
}

function desenharFaixaSemDados(svg, ponto, posX, posY, tempos, maxEscala = 100) {
    const x = posX(ponto.hora);
    const largura = Math.max(0, posX(tempos[tempos.length - 1] || ponto.hora) - x);
    svg.append(criarSvg('rect', { x, y: posY(maxEscala), width: largura, height: posY(0) - posY(maxEscala), fill: 'rgba(138, 143, 156, 0.12)', stroke: '#8a8f9c', 'stroke-width': 1, 'stroke-dasharray': '6 5' }));
}

function desenharMarcadorParada(svg, ponto, posX, posY, margem, areaLargura) {
    const x = posX(ponto.hora), y = posY(ponto.valor);
    svg.append(criarSvg('circle', { cx: x, cy: y, r: 5.5, fill: '#8a8f9c', stroke: '#ffffff', 'stroke-width': 2 }));
    const paraEsquerda = x > margem.esquerda + areaLargura / 2;
    svg.append(criarSvgTexto(paraEsquerda ? x - 10 : x + 10, y - 16, `Parou de enviar dados às ${ponto.hora}`, { 'text-anchor': paraEsquerda ? 'end' : 'start', fill: '#5b5f6b', 'font-size': 12, 'font-weight': 600 }));
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
    if (pos >= 0) estado.servidoresSelecionados.splice(pos, 1);
    else estado.servidoresSelecionados.push(id);
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
}

async function iniciar() {
    // Registra os eventos antes da busca para que o botao Atualizar funcione mesmo
    // se a primeira carga falhar.
    iniciarEventos();
    mostrarMensagem('Carregando alertas…');
    estado.servidores = await obterServidoresEmAlerta();
    document.getElementById('alertas-hora-atualizacao').textContent = HORA_ATUALIZACAO;
    atualizarTudo();
    mostrarMensagem('');
}

iniciar().catch((erro) => {
    console.error(erro);
    mostrarMensagem(MENSAGEM_ERRO_ALERTAS, 'alert');
});
