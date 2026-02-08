const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const app = express();

// 1. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        // FIX: This saves login data to a completely new folder to avoid errors
        dataPath: 'auth_folder_new'
    }),
    puppeteer: {
        // These args are required for the server to run Chrome without crashing
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// 2. Generate QR Code in the Logs
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: true });
});

// 3. Confirm Connection
client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

// 4. Restart if disconnected
client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    client.initialize();
});

client.initialize();

// 5. API Endpoint
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
        res.send(`OTP Sent to ${phone}`);
    } catch (error) {
        res.status(500).send('Failed: ' + error.toString());
    }
});

// Start Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
