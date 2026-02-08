const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); // Keep for logs if you want
const QRCode = require('qrcode'); // New library for image
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

// Variable to save the QR code
let qrCodeData = null;

// 1. Save QR to variable when generated
client.on('qr', (qr) => {
    qrCodeData = qr; // Save it to use later
    console.log('New QR Received!');
    qrcode.generate(qr, { small: true }); // Print to logs as backup
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.initialize();

// 2. Show QR on the website
app.get('/', async (req, res) => {
    if (qrCodeData) {
        // Convert QR text to an Image Data URL
        try {
            const imgUrl = await QRCode.toDataURL(qrCodeData);
            res.send(`
                <div style="display:flex; justify-content:center; align-items:center; height:100vh;">
                    <div style="text-align:center;">
                        <h1>Scan this QR Code</h1>
                        <img src="${imgUrl}" style="width:300px; height:300px; border: 1px solid black;">
                        <p>Refresh if it expires.</p>
                    </div>
                </div>
            `);
        } catch (err) {
            res.send("Error generating QR image.");
        }
    } else {
        res.send("<h1>Waiting for QR Code...</h1><p>Please wait 10 seconds and refresh this page.</p>");
    }
});

// ... Keep your other /send-otp routes here ...

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
