const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const app = express();

// 1. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        // FIX: Use a new folder to avoid the ENOTDIR crash
        clientId: "client-one",
        dataPath: "auth_folder_new"
    }),
    puppeteer: {
        // REQUIRED: These arguments allow Chrome to run on the cloud
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// 2. Generate QR Code
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: true });
});

// 3. Confirm Connection
client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.initialize();

// 4. API Endpoints

// Home Page (Fixes "Cannot GET /")
app.get('/', (req, res) => {
    res.send('<h1>Server is Active!</h1><p>Check your Render Logs to scan the QR Code.</p>');
});

// OTP Sender
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone; 
    const otp = req.query.otp;

    if (!phone || !otp) {
        return res.status(400).send('Error: Missing phone or otp');
    }

    try {
        const chatId = `${phone}@c.us`;
        const message = `Your Secure OTP is: *${otp}*`;
        
        await client.sendMessage(chatId, message);
        res.send(`OTP sent to ${phone}`);
    } catch (error) {
        res.status(500).send('Failed: ' + error.toString());
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
