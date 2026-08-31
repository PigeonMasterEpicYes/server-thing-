const WebSocket = require('ws');
const axios = require('axios');
const { URL } = require('url');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`Deep-Caching Asset Bundler active on port ${port}`);

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

// Compiles a single page with all its images and stylesheets baked directly in
async function compileSinglePage(targetUrl) {
    try {
        const response = await axios.get(targetUrl);
        let html = response.data;
        const baseUrl = targetUrl;

        // Inline Images
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

        // Inline Stylesheets
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

        return html;
    } catch (e) {
        return null;
    }
}

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'FETCH') {
                console.log(`Deep crawling site root: ${data.url}`);
                const originUrl = new URL(data.url);
                
                // 1. Compile the landing page
                const mainHtml = await compileSinglePage(data.url);
                if (!mainHtml) throw new Error("Could not fetch root page.");

                // Send the main page immediately
                ws.send(JSON.stringify({ type: 'HTML_DATA', url: data.url, html: mainHtml, isRoot: true }));

                // 2. Scan for internal anchor links to harvest sub-pages (e.g. /about, /contact)
                const linkRegex = /<a[^>]+href=["']([^"']+)["']/g;
                let linkMatch;
                const pagesToHarvest = new Set();

                while ((linkMatch = linkRegex.exec(mainHtml)) !== null) {
                    const originalHref = linkMatch[1];
                    try {
                        const absoluteUrl = new URL(originalHref, data.url);
                        // Security check: Only crawl sub-pages belonging to the exact same website domain
                        if (absoluteUrl.origin === originUrl.origin && absoluteUrl.href !== data.url) {
                            pagesToHarvest.add(absoluteUrl.href);
                        }
                    } catch (e) {}
                }

                // Crawl and push up to 5 linked sub-pages to prevent server melting
                const harvestList = Array.from(pagesToHarvest).slice(0, 5);
                console.log(`Found ${harvestList.length} internal links to cache for offline browsing.`);

                for (const subUrl of harvestList) {
                    console.log(`Deep caching linked page: ${subUrl}`);
                    const subHtml = await compileSinglePage(subUrl);
                    if (subHtml) {
                        ws.send(JSON.stringify({ type: 'HTML_DATA', url: subUrl, html: subHtml, isRoot: false }));
                    }
                }
                
                ws.send(JSON.stringify({ type: 'STATUS', message: "Deep caching complete!" }));
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        }
    });
});
