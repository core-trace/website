const archiver = require("archiver");
const fs = require("fs/promises");
const path = require("path");
const agenteModel = require("../models/agenteModel");

function baixar(req, res) {
    const dados = req.body || {};
    const idEmpresa = Number(dados.id_empresa);
    const idPerfilServidor = Number(dados.id_perfil_servidor);

    if (!Number.isSafeInteger(idEmpresa) || idEmpresa <= 0
        || !Number.isSafeInteger(idPerfilServidor) || idPerfilServidor <= 0) {
        return res.status(400).send("Informe uma empresa e um perfil de servidor válidos.");
    }

    const pastaAgente = path.join(__dirname, "../agente");
    let arquivo;

    function tratarErro(erro) {
        console.error("Erro ao gerar ZIP do agente:", erro.message);

        if (arquivo) {
            arquivo.unpipe(res);
            arquivo.abort();
        }

        if (res.destroyed || res.writableEnded) return;

        if (res.headersSent) {
            return res.destroy();
        }

        res.removeHeader("Content-Disposition");
        return res.status(500).type("text/plain").send("Não foi possível gerar o ZIP do agente.");
    }

    return agenteModel.buscarTokens(idEmpresa, idPerfilServidor)
        .then(function (resultado) {
            if (resultado.length === 0) {
                return res.status(404).send("Perfil de servidor não encontrado para esta empresa.");
            }

            const tokens = resultado[0];

            if (!tokens.token_instalacao || !tokens.token_perfil_servidor) {
                return res.status(409).send("A empresa ou o perfil de servidor está sem token configurado.");
            }

            return fs.readFile(path.join(pastaAgente, "config.json"), "utf8")
                .then(function (conteudo) {
                    const config = JSON.parse(conteudo);
                    config.token_instalacao = tokens.token_instalacao;
                    config.token_perfil_servidor = tokens.token_perfil_servidor;

                    arquivo = archiver("zip", { zlib: { level: 9 } });
                    arquivo.on("error", tratarErro);
                    arquivo.on("warning", tratarErro);

                    res.on("close", function () {
                        if (!res.writableFinished) arquivo.abort();
                    });

                    res.attachment("agente.zip");
                    res.set("Cache-Control", "no-store");
                    arquivo.pipe(res);

                    arquivo.glob("**/*", {
                        cwd: pastaAgente,
                        dot: true,
                        ignore: ["config.json", "**/__pycache__/**", "**/*.pyc", "**/node_modules/**", "**/.venv/**", "**/*.csv"]
                    }, { prefix: "agente" });

                    // Cada download recebe seu próprio config.json dentro do ZIP.
                    arquivo.append(JSON.stringify(config, null, 4), { name: "agente/config.json" });

                    return arquivo.finalize();
                });
        })
        .catch(tratarErro);
}

module.exports = { baixar };
