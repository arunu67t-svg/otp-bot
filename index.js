const express = require('express');
const QRCode = require('qrcode');
const { useMultiFileAuthState, makeWASocket, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');

const app = express();
app.use(express.json());

// ==================== CONFIG ====================
const PORT = process.env.PORT || 10000;
const KEEP_ALIVE_INTERVAL = 8 * 60 * 1000;

// ==================== STATE ====================
const accounts = new Map();
let serverStartTime = Date.now();
let keepAliveTimer = null;

// ==================== RATE LIMIT ====================
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60000;

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    for (const [k, v] of rateLimitMap.entries()) {
        if (now - v > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
    }
    const requests = Array.from(rateLimitMap.keys()).filter(k => k.startsWith(ip));
    if (requests.length >= RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    rateLimitMap.set(`${ip}:${now}`, now);
    next();
}

// ==================== SERVER ====================
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Port ${PORT}`);
    startKeepAlive();
});

function startKeepAlive() {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        fetch(url + '/health', { method: 'GET' })
            .then(() => console.log('[KEEPALIVE] Ping'))
            .catch(() => console.log('[KEEPALIVE] Wake...'));
    }, KEEP_ALIVE_INTERVAL);
}

// ==================== WHATSAPP ====================
async function connectWhatsApp(accountId) {
    const sessionFolder = `./session_${accountId}`;

    if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
    }

    console.log(`[WA:${accountId}] Starting connection...`);

    const account = {
        sock: null,
        connected: false,
        qr: null,
        messageCount: 0,
        reconnectAttempts: 0,
        error: null
    };
    accounts.set(accountId, account);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version, isLatest } = await fetchLatestWaWebVersion();
        console.log(`[WA:${accountId}] using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            browser: ['Ubuntu', 'Chrome', '20.0.04']
        });

        account.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, qr } = update;

            console.log(`[WA:${accountId}] Connection: ${connection}`);

            if (qr) {
                console.log(`[WA:${accountId}] QR received`);
                account.qr = qr;
            }

            if (connection === 'close') {
                const reason = update.lastDisconnect?.error?.message || 'Unknown';
                console.log(`[WA:${accountId}] Closed: ${reason}`);
                account.connected = false;

                if (account.reconnectAttempts < 3) {
                    account.reconnectAttempts++;
                    setTimeout(() => connectWhatsApp(accountId), 5000 * account.reconnectAttempts);
                }
            }

            if (connection === 'open') {
                console.log(`[WA:${accountId}] ✓ Connected!`);
                account.connected = true;
                account.qr = null;
                account.error = null;
                account.reconnectAttempts = 0;
            }
        });

        sock.ev.on('messages.upsert', ({ messages }) => {
            account.messageCount++;
        });

    } catch (error) {
        console.error(`[WA:${accountId}] Error:`, error.message);
        account.error = error.message;
        setTimeout(() => connectWhatsApp(accountId), 10000);
    }
}

// ==================== LANDING PAGE ====================
function getLandingPage() {
    let accountsHtml = '';

    for (const [id, acc] of accounts) {
        let status = '';
        if (acc.error) {
            status = `<span style="color:#dc2626">● Error: ${acc.error}</span>`;
        } else if (acc.connected) {
            status = '<span style="color:#22c55e">● Connected</span>';
        } else if (acc.qr) {
            status = '<span style="color:#f59e0b">● Scan QR</span>';
        } else {
            status = '<span style="color:#6b7280">● Connecting...</span>';
        }

        const actionBtn = acc.connected
            ? `<button onclick="testSend('${id}')">Test</button>`
            : acc.qr
                ? `<a href="/qr/${id}"><button style="background:#f59e0b">Scan QR</button></a>`
                : `<button disabled style="opacity:0.5">Wait...</button>`;

        accountsHtml += `
            <div class="account-card">
                <div class="account-info">
                    <h3>${id}</h3>
                    <p>${status}</p>
                    <p>Messages: ${acc.messageCount}</p>
                </div>
                <div class="account-actions">
                    ${actionBtn}
                </div>
            </div>
        `;
    }

    const addButton = accounts.size < 4
        ? `<a href="/add" class="add-btn">+ Add WhatsApp Account</a>`
        : `<p class="limit-text">Max 4 accounts reached</p>`;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp OTP Sender</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            .header h1 { font-size: 28px; margin-bottom: 10px; }
            .stats {
                display: flex;
                justify-content: center;
                gap: 30px;
                padding: 20px;
                background: #f8fafc;
                border-bottom: 1px solid #e2e8f0;
            }
            .stat { text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #1e293b; }
            .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
            .accounts { padding: 20px; }
            .account-card {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                background: #f8fafc;
                border-radius: 12px;
                margin-bottom: 15px;
                border: 2px solid #e2e8f0;
            }
            .account-info h3 { color: #1e293b; margin-bottom: 5px; }
            .account-info p { color: #64748b; font-size: 14px; }
            .account-actions button {
                padding: 10px 20px;
                background: #25D366;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                text-decoration: none;
            }
            .add-btn {
                display: block;
                text-align: center;
                padding: 20px;
                background: #f1f5f9;
                border: 2px dashed #cbd5e1;
                border-radius: 12px;
                color: #64748b;
                text-decoration: none;
                font-weight: 600;
            }
            .add-btn:hover { border-color: #25D366; color: #25D366; }
            .limit-text { text-align: center; color: #94a3b8; padding: 20px; }
            .api-section {
                padding: 20px;
                background: #1e293b;
                color: #e2e8f0;
                margin: 20px;
                border-radius: 12px;
            }
            .api-section code {
                display: block;
                background: #0f172a;
                padding: 12px;
                border-radius: 8px;
                font-size: 13px;
                margin-bottom: 10px;
            }
            .footer {
                text-align: center;
                padding: 20px;
                color: #94a3b8;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📱 WhatsApp OTP Sender</h1>
                <p>Send OTPs via WhatsApp</p>
            </div>
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${accounts.size}</div>
                    <div class="stat-label">Accounts</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${Math.floor((Date.now() - serverStartTime) / 1000)}s</div>
                    <div class="stat-label">Uptime</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</div>
                    <div class="stat-label">Memory</div>
                </div>
            </div>
            <div class="accounts">
                ${accountsHtml || '<p style="text-align:center;color:#94a3b8;padding:20px;">No accounts yet. Add one below.</p>'}
                ${addButton}
            </div>
            <div class="api-section">
                <h3>📡 API Endpoints</h3>
                <code>/send-otp?phone=1234567890&otp=123456</code>
                <code>/send?phone=1234567890&message=Hello</code>
            </div>
            <div class="footer">
                Running on Render Free Tier
            </div>
        </div>
        <script>
            function testSend(id) {
                const phone = prompt('Enter phone (with country code):');
                if (phone) {
                    fetch('/' + id + '/send?phone=' + phone + '&message=Test')
                        .then(r => r.json())
                        .then(d => alert(d.success ? 'Sent!' : d.error))
                        .catch(e => alert(e));
                }
            }
            // Auto-refresh every 5 seconds
            setTimeout(() => location.reload(), 5000);
        </script>
    </body>
    </html>
    `;
}

// ==================== ROUTES ====================
app.get('/', rateLimit, (req, res) => {
    res.send(getLandingPage());
});

app.get('/health', (req, res) => {
    const accountStats = {};
    for (const [id, acc] of accounts) {
        accountStats[id] = { connected: acc.connected, messages: acc.messageCount, error: acc.error };
    }
    res.json({
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        accounts: accountStats,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

app.get('/add', (req, res) => {
    const id = 'account' + (accounts.size + 1);
    console.log('[ADD] Creating:', id);
    connectWhatsApp(id);
    res.redirect('/qr/' + id);
});

app.get('/qr/:accountId', async (req, res) => {
    const { accountId } = req.params;
    const acc = accounts.get(accountId);

    if (!acc) {
        return res.redirect('/add');
    }

    if (acc.error) {
        return res.send(`
            <div style="text-align:center;padding:50px;font-family:Arial;">
                <h1 style="color:#dc2626;">Error</h1>
                <p>${acc.error}</p>
                <a href="/add" style="display:inline-block;margin-top:20px;padding:15px 30px;background:#25D366;color:white;text-decoration:none;border-radius:8px;">Try Again</a>
            </div>
        `);
    }

    if (acc.connected) {
        return res.send(`
            <div style="text-align:center;padding:50px;font-family:Arial;">
                <h1 style="color:#22c55e;">✓ Connected!</h1>
                <p>This account is ready.</p>
                <a href="/" style="display:inline-block;margin-top:20px;padding:15px 30px;background:#25D366;color:white;text-decoration:none;border-radius:8px;">Home</a>
            </div>
        `);
    }

    if (!acc.qr) {
        return res.send(`
            <div style="text-align:center;padding:50px;font-family:Arial;">
                <h1>⏳ Generating QR...</h1>
                <p>Please wait and refresh.</p>
                <button onclick="location.reload()" style="margin-top:20px;padding:15px 30px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;">Refresh</button>
            </div>
        `);
    }

    try {
        const img = await QRCode.toDataURL(acc.qr);
        res.send(`
            <div style="text-align:center;padding:30px;font-family:Arial;max-width:400px;margin:0 auto;">
                <h2>Scan QR Code</h2>
                <p style="color:#64748b;">Account: <strong>${accountId}</strong></p>
                <img src="${img}" style="width:100%;border:3px solid #333;border-radius:12px;">
                <p style="margin-top:20px;color:#dc2626;font-weight:bold;">Scan within 45 seconds!</p>
                <p style="color:#64748b;">WhatsApp → Linked Devices</p>
                <button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:#25D366;color:white;border:none;border-radius:8px;cursor:pointer;">Refresh</button>
            </div>
        `);
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

// Send OTP
app.get('/send-otp', rateLimit, async (req, res) => {
    const { phone, otp } = req.query;

    if (!phone || !otp) {
        return res.status(400).json({ error: 'Missing phone or otp' });
    }

    let account = null;
    for (const [, acc] of accounts) {
        if (acc.connected) {
            account = acc;
            break;
        }
    }

    if (!account) {
        return res.status(503).json({ error: 'No connected account' });
    }

    try {
        const jid = `${phone}@s.whatsapp.net`;
        await account.sock.sendMessage(jid, { text: `Your OTP: *${otp}*` });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send Message
app.get('/send', rateLimit, async (req, res) => {
    const { phone, message } = req.query;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Missing params' });
    }

    let account = null;
    for (const [, acc] of accounts) {
        if (acc.connected) {
            account = acc;
            break;
        }
    }

    if (!account) {
        return res.status(503).json({ error: 'No connected account' });
    }

    try {
        const jid = `${phone}@s.whatsapp.net`;
        await account.sock.sendMessage(jid, { text: message });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Account-specific endpoints
app.get('/:accountId/send', rateLimit, async (req, res) => {
    const { accountId } = req.params;
    const { phone, message } = req.query;

    const acc = accounts.get(accountId);
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    if (!acc.connected) return res.status(503).json({ error: 'Not connected' });

    try {
        await acc.sock.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SHUTDOWN ====================
process.on('SIGTERM', async () => {
    console.log('[SHUTDOWN]');
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    for (const [, acc] of accounts) {
        if (acc.sock) acc.sock.end(undefined);
    }
    server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
    console.log('[SHUTDOWN]');
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    for (const [, acc] of accounts) {
        if (acc.sock) acc.sock.end(undefined);
    }
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => console.error('[ERROR]', err.message));
process.on('unhandledRejection', (reason) => console.error('[REJECTION]', reason));

console.log('[APP] WhatsApp OTP Sender');
