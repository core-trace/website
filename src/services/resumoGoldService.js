// Busca no S3 os resumos diarios que o pipeline Python (repositorio scripts-captura)
// gera para cada servidor, em client/resumos/maquina=<MAC>/data=<DIA>/resumo.json.
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

// As credenciais da AWS vem da cadeia padrao do SDK (variaveis de ambiente ou
// ~/.aws/credentials) - nao precisamos configurar nada aqui.
const s3 = new S3Client({});

const NOME_BUCKET = process.env.BUCKET_DADOS_GOLD;

// Converte a data/hora atual para os campos separados (ano, mes, dia, hora, minuto)
// de um fuso horario especifico. Serve de base para as duas funcoes abaixo.
function camposDoRelogio(fusoHorario, opcoes, data = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", { timeZone: fusoHorario, ...opcoes }).formatToParts(data);
    const campos = {};
    for (const parte of partes) campos[parte.type] = parte.value;
    return campos;
}

// "Hoje" precisa ser calculado no fuso de Sao Paulo, a mesma convencao que o pipeline
// Python usa (FUSO_DIA em gold.py). Se usassemos o fuso do servidor Node (que pode
// estar em UTC), perto da meia-noite a data ficaria errada.
//
// DATA_DEMO_FIXA existe só pro cenário de demonstração: os dados sintéticos da Black
// Friday sempre têm a data narrada (27/11/2026), não a data em que a gente roda a
// apresentação. Sem essa variável, o comportamento padrão continua sendo "hoje de
// verdade" - é assim que vai funcionar com dado real de produção, não é um hack
// permanente, só uma forma de a tela achar o resumo certo enquanto estamos testando
// com o cenário fixo.
function dataDeHojeSaoPaulo() {
    if (process.env.DATA_DEMO_FIXA) return process.env.DATA_DEMO_FIXA;
    const campos = camposDoRelogio("America/Sao_Paulo", { year: "numeric", month: "2-digit", day: "2-digit" });
    return `${campos.year}-${campos.month}-${campos.day}`;
}

// Busca o resumo.json de UM servidor, para UMA data. Quem chamar precisa tratar o erro
// (o arquivo pode nao existir ainda - o pipeline Python pode nao ter processado o dia).
async function buscarResumoDoServidor(enderecoMac, data) {
    const chave = `client/resumos/maquina=${enderecoMac}/data=${data}/resumo.json`;
    const resposta = await s3.send(new GetObjectCommand({ Bucket: NOME_BUCKET, Key: chave }));
    const texto = await resposta.Body.transformToString();
    return JSON.parse(texto);
}

// Mesma ideia da DATA_DEMO_FIXA acima: contas de "ha quanto tempo" (duracao de um
// alerta) usam isso como "agora" em vez do relogio de verdade. Sem essa variavel, "agora"
// continua sendo o instante real - so existe essa troca porque o cenario de
// demonstracao tem uma data fixa (27/11/2026) que pode ser antes OU depois da data em
// que a apresentacao realmente acontece, e nos dois casos a conta de duracao sairia
// errada se usasse o relogio de verdade. HORA_DEMO_FIXA e opcional, porque o "instante
// de referencia" do cenario (20h30, ver Contexto/cenario-mestre-black-friday.md) ja e
// conhecido - só muda se um dia o grupo trocar o horario da narrativa.
function agoraOuReferenciaDemo() {
    if (!process.env.DATA_DEMO_FIXA) return new Date();
    const hora = process.env.HORA_DEMO_FIXA || "20:30";
    return new Date(`${process.env.DATA_DEMO_FIXA}T${hora}:00-03:00`);
}

module.exports = { dataDeHojeSaoPaulo, agoraOuReferenciaDemo, buscarResumoDoServidor, camposDoRelogio };
