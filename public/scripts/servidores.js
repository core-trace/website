// Servidores — dashboard de servidores (persona: Marcelo)

const LIMITE_SEM_DADOS_SEGUNDOS = 15 * 60;
const INTERVALO_ATUALIZACAO_MS = 30 * 1000;
const ORDEM_COMPONENTES = ['CPU', 'RAM', 'DISCO', 'REDE'];

const ROTULO_STATUS = {
    critico: 'crítico',
    atencao: 'atenção',
    normal: 'normal',
    'sem-dados': 'sem dados'
};

// Quanto menor o número, mais cedo o card aparece: o que precisa de ação vem primeiro
const ORDEM_STATUS = {
    'sem-dados': 0,
    critico: 1,
    atencao: 2,
    normal: 3
};

const elementos = {
    total: document.getElementById('servidores-total'),
    reportando: document.getElementById('servidores-reportando'),
    criticos: document.getElementById('servidores-criticos'),
    criticosNomes: document.getElementById('servidores-criticos-nomes'),
    atencao: document.getElementById('servidores-atencao'),
    atencaoSub: document.getElementById('servidores-atencao-tendencia'),
    componente: document.getElementById('servidores-componente-critico'),
    componenteSub: document.getElementById('servidores-componente-critico-sub'),
    busca: document.getElementById('busca-servidores'),
    limparBusca: document.getElementById('limpar-busca'),
    filtroPerfil: document.getElementById('filtro-perfil'),
    filtroIndicador: document.getElementById('filtro-indicador'),
    grid: document.getElementById('servidores-grid'),
    carregando: document.getElementById('servidores-carregando'),
    vazio: document.getElementById('servidores-vazio'),
    erro: document.getElementById('servidores-erro')
};

let servidores = [];

function escaparHtml(valor) {

    const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    return String(valor ?? '').replace(/[&<>"']/g, caractere => mapa[caractere]);

}

function normalizar(texto) {

    return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

}

async function buscarServidores() {

    const idEmpresa = sessionStorage.getItem('ID_EMPRESA');
    const idUsuario = sessionStorage.getItem('ID_USUARIO');

    const resposta = await fetch(`/servidores?idEmpresa=${idEmpresa}&idUsuario=${idUsuario}`);

    if (!resposta.ok) {
        throw new Error('Erro ao consultar servidores');
    }

    return resposta.json();

}

async function carregarServidores() {

    try {

        servidores = await buscarServidores();
        elementos.erro.hidden = true;

    } catch (erro) {

        console.error(erro);

        // Mantém o último dado bom na tela; a próxima atualização tenta de novo
        elementos.erro.hidden = false;

    }

}

function classificarServidor(servidor) {

    const semColeta = servidor.coletaSegundos == null
        || servidor.coletaSegundos > LIMITE_SEM_DADOS_SEGUNDOS;

    if (semColeta || !ROTULO_STATUS[servidor.status]) {
        return 'sem-dados';
    }

    return servidor.status;

}

// Mostra o horário da última coleta no fuso de São Paulo: "22:30:45 - 27/11/2026"
function formatarDataHora(instante) {

    const data = instante ? new Date(instante) : null;

    if (!data || Number.isNaN(data.getTime())) {
        return 'sem coleta';
    }

    const partes = {};

    for (const parte of new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(data)) {
        partes[parte.type] = parte.value;
    }

    return `${partes.hour}:${partes.minute}:${partes.second} - ${partes.day}/${partes.month}/${partes.year}`;

}

function renderizarMetrica(rotulo, dados) {

    const { valor = null, nivel = valor === null ? 'sem-dados' : 'normal', detalhe = '' } = dados ?? {};
    const ehNumero = typeof valor === 'number';
    const texto = ehNumero ? `${valor}%` : (valor ?? 's/dados');

    const barra = ehNumero
        ? `<div class="servidores-metrica-barra"><span class="servidores-metrica-barra-preenchimento" style="width: ${Math.min(100, valor)}%"></span></div>`
        : '';

    return `
        <div class="servidores-metrica servidores-metrica-${nivel}">
            <span class="servidores-metrica-rotulo">${rotulo}</span>
            <span class="servidores-metrica-detalhe">${escaparHtml(detalhe)}</span>
            <span class="servidores-metrica-valor">${escaparHtml(texto)}</span>
            ${barra}
        </div>
    `;

}

function renderizarExtras(extras) {

    if (!extras?.length) {
        return '';
    }

    const linhas = extras.map(extra => {

        const valor = typeof extra.valor === 'number' ? `${extra.valor}%` : (extra.valor ?? '');
        const texto = [valor, extra.detalhe].filter(Boolean).join(' · ');

        return `<li class="servidores-extra servidores-extra-${extra.nivel}"><b>${escaparHtml(extra.rotulo)}</b> ${escaparHtml(texto)}</li>`;

    }).join('');

    return `<ul class="servidores-extras" aria-label="Outras métricas em alerta">${linhas}</ul>`;

}

function renderizarCartao(servidor) {

    const status = classificarServidor(servidor);
    const { cpu, ram, dsk, net } = servidor.metricas ?? {};

    return `
        <article class="servidores-card servidores-card-${status}">
            <div class="servidores-card-cabecalho">
                <div>
                    <h2 class="servidores-card-nome">${escaparHtml(servidor.nome)}</h2>
                    <p class="servidores-card-perfil">${escaparHtml(servidor.perfil)}</p>
                </div>
                <span class="servidores-card-status">${ROTULO_STATUS[status]}</span>
            </div>
            <div class="servidores-metricas">
                ${renderizarMetrica('CPU', cpu)}
                ${renderizarMetrica('RAM', ram)}
                ${renderizarMetrica('DSK', dsk)}
                ${renderizarMetrica('NET', net)}
            </div>
            ${status === 'sem-dados' ? '' : renderizarExtras(servidor.extras)}
            <p class="servidores-card-coleta">Última coleta: <b>${formatarDataHora(servidor.ultimaColeta)}</b></p>
        </article>
    `;

}

function renderizarServidores(lista) {

    elementos.grid.innerHTML = '';

    for (const servidor of lista) {
        elementos.grid.innerHTML += renderizarCartao(servidor);
    }

}

// Entre os servidores críticos, acha o componente que mais aparece.
// No empate, devolve todos (ex.: CPU e DISCO com 1 servidor cada).
function calcularComponenteCritico(criticos) {

    const contagem = {};

    for (const servidor of criticos) {
        for (const componente of servidor.componentesCriticos ?? []) {
            contagem[componente] = (contagem[componente] ?? 0) + 1;
        }
    }

    const quantidade = Math.max(0, ...Object.values(contagem));

    if (quantidade === 0) {
        return null;
    }

    return {
        componentes: ORDEM_COMPONENTES.filter(componente => contagem[componente] === quantidade),
        quantidade
    };

}

function renderizarResumo() {

    const grupos = { critico: [], atencao: [], normal: [], 'sem-dados': [] };

    for (const servidor of servidores) {
        grupos[classificarServidor(servidor)].push(servidor);
    }

    elementos.total.textContent = servidores.length;
    elementos.reportando.textContent = `${servidores.length - grupos['sem-dados'].length} reportando agora`;

    elementos.criticos.textContent = grupos.critico.length;
    elementos.criticosNomes.textContent = grupos.critico.length
        ? grupos.critico.map(servidor => servidor.nome).join(' · ')
        : 'nenhum servidor crítico';

    elementos.atencao.textContent = grupos.atencao.length;
    elementos.atencaoSub.textContent = grupos.atencao.length ? 'requer acompanhamento' : 'nenhum em atenção';

        const destaque = calcularComponenteCritico(grupos.critico);

    elementos.componente.textContent = destaque ? destaque.componentes.join(' · ') : '—';
    elementos.componenteSub.textContent = destaque
        ? `${destaque.quantidade} ${destaque.quantidade === 1 ? 'servidor crítico' : 'servidores críticos'} por componente`
        : 'nenhum componente crítico';

}

function carregarPerfis() {

    const selecionado = elementos.filtroPerfil.value;
    const perfis = [...new Set(servidores.map(servidor => servidor.perfil))].sort();

    elementos.filtroPerfil.innerHTML = '<option value="">Todos os perfis</option>';

    for (const perfil of perfis) {
        elementos.filtroPerfil.innerHTML += `<option value="${escaparHtml(perfil)}">${escaparHtml(perfil)}</option>`;
    }

    elementos.filtroPerfil.value = selecionado;

}

function aplicarFiltroDaURL() {
    const parametros = new URLSearchParams(location.search);
    if (parametros.get('perfil')) elementos.filtroPerfil.value = parametros.get('perfil');
    if (parametros.get('indicador')) elementos.filtroIndicador.value = parametros.get('indicador');
    if (parametros.get('busca')) elementos.busca.value = parametros.get('busca');
}

function filtrarServidores() {

    const termo = normalizar(elementos.busca.value);
    const perfil = elementos.filtroPerfil.value;
    const indicador = elementos.filtroIndicador.value;

        const filtrados = servidores.filter(servidor => {

        const buscaOk = !termo
            || normalizar(servidor.nome).includes(termo)
            || normalizar(servidor.perfil).includes(termo)
            || normalizar(servidor.endereco_mac).includes(termo);

        const perfilOk = !perfil || servidor.perfil === perfil;
        const indicadorOk = !indicador || classificarServidor(servidor) === indicador;

        return buscaOk && perfilOk && indicadorOk;

    }).sort((a, b) => {

        const diferenca = ORDEM_STATUS[classificarServidor(a)] - ORDEM_STATUS[classificarServidor(b)];

        // No mesmo status, ordem alfabética (cart-api-02 antes de cart-api-10)
        return diferenca || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });

    });

    renderizarServidores(filtrados);

    // Se deu erro e não há nada para mostrar, o aviso de erro já explica
    elementos.vazio.hidden = filtrados.length > 0 || !elementos.erro.hidden;
    elementos.limparBusca.hidden = !elementos.busca.value;

}

// O próximo ciclo só é agendado quando o atual termina, então nunca há duas buscas ao mesmo tempo
async function atualizarTela() {

    await carregarServidores();

    carregarPerfis();
    renderizarResumo();
    filtrarServidores();

    elementos.carregando.hidden = true;
    elementos.grid.setAttribute('aria-busy', 'false');

    setTimeout(atualizarTela, INTERVALO_ATUALIZACAO_MS);

}

elementos.busca.addEventListener('input', filtrarServidores);
elementos.filtroPerfil.addEventListener('change', filtrarServidores);
elementos.filtroIndicador.addEventListener('change', filtrarServidores);

elementos.limparBusca.addEventListener('click', () => {

    elementos.busca.value = '';

    filtrarServidores();
    elementos.busca.focus();

});


// Lê ?perfil=/?indicador=/?busca= da URL (pro kpi da geral)
aplicarFiltroDaURL();
atualizarTela();