// Servidor exclusivamente de arquivos estáticos. Não carrega o app, banco ou rotas de API.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const raiz = path.resolve(__dirname, '../public');
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const porta = Number(process.env.DEMO_PORT || 4173);
const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
        const url = new URL(req.url, 'http://localhost');
        const caminho = decodeURIComponent(url.pathname === '/' ? '/pages/inicioDashboard.html' : url.pathname);
        const arquivo = path.resolve(raiz, `.${caminho}`);
        if (!arquivo.startsWith(raiz + path.sep)) { res.writeHead(403); res.end(); return; }
        const conteudo = await fs.readFile(arquivo);
        res.writeHead(200, { 'Content-Type': tipos[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : conteudo);
    } catch { res.writeHead(404); res.end('Arquivo não encontrado.'); }
});
server.on('error', erro => { console.error(`Não foi possível iniciar a demonstração: ${erro.message}`); process.exitCode = 1; });
server.listen(porta, '127.0.0.1', () => console.log(`CoreTrace — demonstração local: http://127.0.0.1:${porta}/pages/inicioDashboard.html`));
