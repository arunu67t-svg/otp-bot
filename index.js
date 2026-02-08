const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const app = express();

// 1. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// 2. Generate QR Code in the Terminal (Logs)
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: true });
});

// 3. Confirm Connection
client.on('ready', () => {
    console.log('Client is ready!');
});

client.initialize();

// 4. API Endpoint to Send OTP
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone; // e.g., 919876543210
    const otp = req.query.otp;

    if (!phone || !otp) {
        return res.status(400).send('Missing phone or otp');
    }

    try {
        // Format phone number to WhatsApp ID (e.g., 919999999999@c.us)
        const chatId = `${phone}@c.us`;
        const message = `Your Secure OTP is: *${otp}*`;
        
        await client.sendMessage(chatId, message);
        res.send('OTP Sent Successfully');
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

// Start the Web Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});