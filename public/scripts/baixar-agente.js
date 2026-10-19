function baixarAgente(idPerfilServidor, botao, feedback) {
    const idEmpresa = Number(sessionStorage.ID_EMPRESA);

    if (botao.disabled) return;

    feedback.hidden = false;

    if (!Number.isSafeInteger(idEmpresa) || idEmpresa <= 0) {
        feedback.textContent = "Faça login novamente para baixar o agente da sua empresa.";
        return;
    }

    if (!Number.isSafeInteger(idPerfilServidor) || idPerfilServidor <= 0) {
        feedback.textContent = "Selecione um perfil de servidor para baixar o agente.";
        return;
    }

    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Gerando ZIP...";
    feedback.textContent = "Preparando o download do agente...";

    return fetch("/agente/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id_empresa: idEmpresa,
            id_perfil_servidor: idPerfilServidor
        })
    })
        .then(function (resposta) {
            if (resposta.ok) return resposta.blob();

            return resposta.text().then(function (mensagem) {
                throw new Error(mensagem || "Não foi possível baixar o agente.");
            });
        })
        .then(function (zip) {
            const url = URL.createObjectURL(zip);
            const link = document.createElement("a");
            link.href = url;
            link.download = "agente.zip";
            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 1000);

            feedback.textContent = "Download do agente iniciado.";
        })
        .catch(function (erro) {
            feedback.textContent = erro instanceof TypeError
                ? "Não foi possível conectar ao servidor. Tente novamente."
                : erro.message;
        })
        .finally(function () {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        });
}
