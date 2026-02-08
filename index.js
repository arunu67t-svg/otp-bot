const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const app = express();

// 1. Initialize WhatsApp Client with the FIX
const client = new Client({
    authStrategy: new LocalAuth({
        // THIS FIXES THE ERROR: We force it to use a new folder for login data
        clientId: "client-one",
        dataPath: "./auth_folder_new"
    }),
    puppeteer: {
        // These args are required for Render/Heroku free tier
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// 2. Generate QR Code in the Terminal (Logs)
client.on('qr', (qr) => {
    console.log('SCAN THIS QR CODE:');
    qrcode.generate(qr, { small: true });
});

// 3. Confirm Connection
client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

// 4. Handle Disconnection (Optional: Helps it restart if it fails)
client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    client.initialize();
});

client.initialize();

// 5. API Endpoint to Send OTP
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone; // e.g., 919876543210
    const otp = req.query.otp;

    if (!phone || !otp) {
        return res.status(400).send('Error: Missing phone or otp parameters');
    }

    try {
        // Format phone number (Append @c.us for WhatsApp ID)
        const chatId = `${phone}@c.us`;
        const message = `Your Secure OTP is: *${otp}*`;
        
        await client.sendMessage(chatId, message);
        res.send(`OTP ${otp} sent to ${phone}`);
    } catch (error) {
        res.status(500).send('Failed: ' + error.toString());
    }
});

// Start the Web Server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
