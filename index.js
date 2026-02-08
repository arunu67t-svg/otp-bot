const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); // For logs
const QRCode = require('qrcode');          // For website image
const express = require('express');
const app = express();

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one",
        dataPath: "auth_folder_new"
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// SAFETY LOCK: Assume client is NOT ready when we start
let isClientReady = false;
let qrCodeData = null;

client.on('qr', (qr) => {
    console.log('New QR Received! Scan it now.');
    qrCodeData = qr;
    isClientReady = false; // Not ready yet
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isClientReady = true; // NOW we are ready
});

// If disconnected, reset the lock
client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isClientReady = false;
    client.initialize();
});

client.initialize();

// Website to Show QR
app.get('/', async (req, res) => {
    if (isClientReady) {
        res.send('<h1>System is Ready!</h1><p>You can now send OTPs.</p>');
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
        res.send('<h1>Starting...</h1><p>Please wait 10 seconds and refresh.</p>');
    }
});

// API to Send OTP (With Crash Prevention)
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone;
    const otp = req.query.otp;

    // 1. Check if parameters exist
    if (!phone || !otp) return res.status(400).send('Error: Missing phone or otp');

    // 2. CHECK IF READY (The Fix)
    if (!isClientReady) {
        return res.status(503).send('Error: Bot is not logged in. Go to the home page (/) and scan the QR code first.');
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
