const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Asset Bundler Engine active on port ${port}`);

// Helper to download assets and convert them into inline Base64 data strings
async function getAsBase64(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) {
        return null; // Fallback if a specific asset fails to load
    }
}

// Helper to fetch external scripts or styles as raw text strings
async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl);
        return response.data;
    } catch (e) {
        return '';
    }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Compiling bundle for: ${data.url}`);
                
                // 1. Fetch primary HTML source shell
                const response = await axios.get(data.url);
                let html = response.data;
                const baseUrl = data.url;

                // 2. Bundle Images: Find standard image sources
                const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(html)) !== null) {
                    const originalSrc = imgMatch[1];
                    try {
                        const absoluteUrl = new URL(originalSrc, baseUrl).href;
                        const dataUrl = await getAsBase64(absoluteUrl);
                        if (dataUrl) {
                            html = html.replace(originalSrc, dataUrl);
                        }
                    } catch (err) {}
                }

                // 3. Bundle Stylesheets: Convert link tags to inline style blocks
                const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g;
                let cssMatch;
                while ((cssMatch = cssRegex.exec(html)) !== null) {
                    const originalHref = cssMatch[1];
                    try {
                        const absoluteUrl = new URL(originalHref, baseUrl).href;
                        const cssText = await getAsText(absoluteUrl);
                        html = html.replace(cssMatch[0], `<style>${cssText}</style>`);
                    } catch (err) {}
                }

                // 4. Stream the completely compiled self-contained bundle back to the client
                ws.send(JSON.stringify({
                    type: 'HTML_DATA',
                    url: data.url,
                    html: html
                }));
                console.log(`Bundle complete and transmitted!`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Compilation timeout or source block.' }));
        }
    });
});
