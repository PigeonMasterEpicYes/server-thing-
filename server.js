const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`CSS-Inlining Asset Bundler active on port ${port}`);

async function getAsBase64(targetUrl) {
    try {
        const response = await axios.get(targetUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${contentType};base64,${base64}`;
    } catch (e) { return null; }
}

async function getAsText(targetUrl) {
    try {
        const response = await axios.get(targetUrl);
        return response.data;
    } catch (e) { return ''; }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Compiling comprehensive styles for: ${data.url}`);
                
                const response = await axios.get(data.url);
                let html = response.data;
                const baseUrl = data.url;

                // 1. COMPREHENSIVE CSS EXTRACTION: Target link stylesheets, style.css, and styling configurations
                // This regex scans flexibly for any link containing stylesheets or .css paths
                const cssRegex = /<link[^>]+(?:rel=["']stylesheet["']|href=["'][^"']+\.css[^"']*["'])[^>]*>/g;
                const hrefExtractRegex = /href=["']([^"']+)["']/;
                
                let cssMatches = html.match(cssRegex) || [];
                for (const matchTag of cssMatches) {
                    const hrefMatch = matchTag.match(hrefExtractRegex);
                    if (hrefMatch && hrefMatch[1]) {
                        const originalHref = hrefMatch[1];
                        try {
                            const absoluteUrl = new URL(originalHref, baseUrl).href;
                            console.log(`Downloading and inlining style sheet: ${absoluteUrl}`);
                            const cssText = await getAsText(absoluteUrl);
                            
                            // Swap out the link tag for an direct internal style block container
                            html = html.replace(matchTag, `<style data-origin="${originalHref}">${cssText}</style>`);
                        } catch (err) {
                            console.log(`Failed styling capture for: ${originalHref}`);
                        }
                    }
                }

                // 2. Inline Images (Kept active so style structures look correct)
                const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
                let imgMatch;
                while ((imgMatch = imgRegex.exec(html)) !== null) {
                    const originalSrc = imgMatch[1];
                    try {
                        const absoluteUrl = new URL(originalSrc, baseUrl).href;
                        const dataUrl = await getAsBase64(absoluteUrl);
                        if (dataUrl) html = html.replace(imgMatch[0], imgMatch[0].replace(originalSrc, dataUrl));
                    } catch (err) {}
                }

                // 3. Transmit the standalone package back across the socket pipeline
                ws.send(JSON.stringify({
                    type: 'HTML_DATA',
                    url: data.url,
                    html: html
                }));
                console.log(`Single-page bundling with compiled CSS complete!`);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Compilation or asset capture blocked.' }));
        }
    });
});
