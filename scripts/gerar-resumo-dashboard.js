// Gera o resumo inicial a partir das mesmas coletas usadas no detalhamento.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
const contexto = vm.createContext({ console });
for (const arquivo of ['cenario/cenario-coretrace-7dias.js', 'cenario/detalhamento-servidor.js',
    'dashboardDados.js', 'dashboardSimulacao.js', 'dashboardAlertasMock.js']) {
    vm.runInContext(fs.readFileSync(path.join(raiz, 'public/scripts', arquivo), 'utf8'), contexto);
}
const resultado = vm.runInContext(`(() => {
    const cenario = dashboardSimulacao.criar();
    const resumos = {};
    for (const perfil of ['', ...new Set(cenario.servidores.map(s => s.perfilId))]) {
        resumos[perfil] = {};
        for (const minutos of [30, 60, 360, 720, 1440, 10080]) {
            const inicio = cenario.referencia - minutos * 60000, fim = cenario.referencia;
            const indicadores = dashboardDados.indicadoresNoPeriodo(cenario.servidores.filter(s => !perfil || s.perfilId === perfil), inicio, fim);
            if (indicadores.previsao) indicadores.previsao.servidor = { id: indicadores.previsao.servidor.id, nome: indicadores.previsao.servidor.nome };
            resumos[perfil][minutos] = { indicadores, graficos: dashboardAlertasMock.agregar(cenario.registros, { inicio, fim, perfil }) };
        }
    }
    return { referencia: cenario.referencia, resumos,
        servidores: cenario.servidores.map(({ coletas, ...servidor }) => servidor) };
})()`, contexto);
fs.mkdirSync(path.join(raiz, 'public/data'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'public/data/dashboard-resumo.js'), 'const CoreTraceResumo = ' + JSON.stringify(resultado) + ';\n');
console.log('Resumo gerado para os quatro filtros de perfil e seis períodos.');
