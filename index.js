const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const app = express();

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one",
        dataPath: "auth_folder_new"
    }),
    puppeteer: {
        // MEMORY FIX: These settings reduce RAM usage significantly
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Key fix for Docker/Render memory issues
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // forces Chrome to use one process (saves huge RAM)
            '--disable-gpu'
        ]
    }
});

let isClientReady = false;
let qrCodeData = null;

client.on('qr', (qr) => {
    console.log('New QR Received!');
    qrCodeData = qr;
    isClientReady = false;
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isClientReady = true;
});

// Auto-reconnect if it crashes
client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isClientReady = false;
    client.initialize();
});

client.initialize();

// Website to Show QR
app.get('/', async (req, res) => {
    if (isClientReady) {
        res.send('<h1>System is Ready!</h1><p>Memory optimized.</p>');
    } else if (qrCodeData) {
        try {
            const imgUrl = await QRCode.toDataURL(qrCodeData);
            res.send(`
                <div style="text-align:center;">
                    <h1>Scan this QR Code</h1>
                    <img src="${imgUrl}" style="width:300px; border:1px solid #333;">
                    <p>Open WhatsApp > Linked Devices > Link a Device</p>
                </div>
            `);
        } catch (err) { res.send("Error generating QR."); }
    } else {
        res.send('<h1>Starting Server...</h1><p>Please wait 10 seconds and refresh.</p>');
    }
});

// API to Send OTP
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone;
    const otp = req.query.otp;

    if (!phone || !otp) return res.status(400).send('Error: Missing phone or otp');

    if (!isClientReady) {
        return res.status(503).send('Bot is restarting or not logged in. Please wait 10 seconds.');
    }

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, `Your Secure OTP is: *${otp}*`);
        res.send(`OTP sent to ${phone}`);
    } catch (error) {
        res.status(500).send('Failed: ' + error.toString());
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
