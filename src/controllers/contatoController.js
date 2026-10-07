const { Resend } = require("resend")
const dotenv = require("dotenv")

dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY)

async function enviarContato(req, res){
    const nome = req.body.nome;
    const email = req.body.email;
    const assunto = req.body.assunto;
    const conteudo = req.body.conteudo;
    
    try{
        await resend.emails.send({
            from:"CoreTrace <onboarding@resend.dev>",
            to: "kadu12020@gmail.com",
            replyTo: "kadu12020@gmail.com",
            subject: `[CoreTrace] ${assunto}`,
            html: `
            <h2> Nova mensagem de contato! </h2>
            <p><strong>Nome: </strong> ${nome} </p>
            <p><strong>Email: </strong> ${email} </p>
            <p><strong>Mensagem: </strong> ${conteudo} </p>
            `
        });

        return res.status(200).json({
            mensagem: "Mensagem enviada com sucesso!"
        });
    } catch (erro) {
        console.log(erro);

        return res.status(500).json({
            mensagem: "Erro ao enviar mensagem!"
        })
    }
}

module.exports = {enviarContato}