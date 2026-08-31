const WebSocket = require('ws');
const https = require('https');

// Codespaces run dynamically, so we fetch the active assigned port
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Proxy WebSocket Engine active on port ${port}`);

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                https.get(data.url, (res) => {
                    let html = '';
                    res.on('data', (chunk) => { html += chunk; });
                    res.on('end', () => {
                        ws.send(JSON.stringify({
                            type: 'HTML_DATA',
                            url: data.url,
                            html: html
                        }));
                    });
                }).on('error', (e) => {
                    ws.send(JSON.stringify({ type: 'ERROR', message: e.message }));
                });
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid payload execution.' }));
        }
    });
});
