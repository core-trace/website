async function enviar() {
    const nome = document.getElementById("id_nome").value
    const email = document.getElementById("id_email").value
    const assunto = document.getElementById("id_assunto").value
    const conteudo = document.getElementById("id_conteudo").value


    if(nome == "" || email == "" || assunto == "" || conteudo == ""){
        alert("Preencha todos os campos!")
        return
    }

    const resposta = await fetch("/contato", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            nome,
            email,
            assunto,
            conteudo
        })
    });

    if (resposta.ok) {
        alert("Mensagem enviada")


    } else {
        alert("Erro ao enviar")
    }
}

document.getElementById("btn-contato").addEventListener("click", function () {
    document.getElementById("estamos-prontos").scrollIntoView({
        behavior: "smooth"
    });
});