const { GoogleGenAI } = require("@google/genai");

const TIMEOUT_MS = 8000;

// se o gemini demorar demais ou der erro, desiste em 8s - quem chama cai pro texto fixo
async function chamarGemini(prompt) {
    const chatIA = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const resultado = await Promise.race([
        chatIA.models.generateContent({ model: "gemini-3.5-flash-lite", contents: prompt }),
        new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("Tempo esgotado")), TIMEOUT_MS))
    ]);

    return resultado.text;
}

module.exports = { chamarGemini };
