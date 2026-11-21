const resumoGeralService = require("../services/resumoGeralService");
const resumoGoldService = require("../services/resumoGoldService");
const s3Model = require("../models/s3Model");

// So devolve o que ja esta em cache nunca busca no S3 durante a requisicao, pra dashboard nao ficar lenta
function obterResumo(req, res) {
    return res.json(resumoGeralService.obterResumoGeral());
}

function chaveDoRelatorio(data) {
    return `client/relatorios/relatorio-${data}.pdf`;
}

// "Ontem" a partir de uma data em texto (AAAA-MM-DD), sem depender do relogio da
// maquina  pra bater com o relogio do cenário
function diaAnterior(data) {
    const dia = new Date(`${data}T12:00:00-03:00`);
    dia.setDate(dia.getDate() - 1);
    return dia.toISOString().slice(0, 10);
}

// O relatorio e gerado 1x por hora pelo api-java e sobrescrito
// no mesmo arquivo do dia 
// o download so busca o que ja esta pronto no S3, nunca gera na hora do clique
async function baixarRelatorio(req, res) {

    const hoje = resumoGoldService.dataDeHojeSaoPaulo();

    try {

        const pdf = await s3Model.buscarArquivoBinarioS3(chaveDoRelatorio(hoje));
        return enviarPdf(res, pdf);

    } catch (erro) {

        try {

            const pdf = await s3Model.buscarArquivoBinarioS3(chaveDoRelatorio(diaAnterior(hoje)));
            return enviarPdf(res, pdf);

        } catch (erroOntem) {

            console.error("Erro ao buscar relatório no S3:", erroOntem.message);
            return res.status(404).json({
                erro: "Relatório ainda não disponível"
            });

        }

    }

}

function enviarPdf(res, pdf) {
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", 'attachment; filename="relatorio-coretrace.pdf"');
    return res.send(pdf);
}

module.exports = { obterResumo, baixarRelatorio };
