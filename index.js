const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); // For logs (backup)
const QRCode = require('qrcode');          // For website image (primary)
const express = require('express');
const app = express();

const client = new Client({
    authStrategy: new LocalAuth({
        // FIX 1: We use a new folder name to avoid the "ENOTDIR" crash
        clientId: "client-one",
        dataPath: "auth_folder_new"
    }),
    puppeteer: {
        // FIX 2: These arguments let Chrome run on the Cloud without crashing
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

// Variable to store the QR code
let qrCodeData = null;

// 1. Capture the QR Code
client.on('qr', (qr) => {
    console.log('New QR Received! Check the website.');
    qrCodeData = qr; // Save it
    qrcode.generate(qr, { small: true }); // Print to logs too
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
});

client.initialize();

// 2. Website Route (Fixes "Cannot GET /")
app.get('/', async (req, res) => {
    // If we have a QR code, show it as an image
    if (qrCodeData) {
        try {
            const imgUrl = await QRCode.toDataURL(qrCodeData);
            res.send(`
                <html>
                    <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
                        <div>
                            <h1>Scan this QR Code</h1>
                            <img src="${imgUrl}" style="width:300px; height:300px; border:1px solid #333;">
                            <p>Open WhatsApp > Linked Devices > Link a Device</p>
                        </div>
                    </body>
                </html>
            `);
        } catch (err) {
            res.send("Error generating QR image.");
        }
    } else {
        res.send(`
            <html>
                <body style="text-align:center; padding-top:50px; font-family:sans-serif;">
                    <h1>Starting Server...</h1>
                    <p>Please wait 10 seconds and <a href="/">Refresh this page</a></p>
                </body>
            </html>
        `);
    }
});

// 3. API to Send OTP
app.get('/send-otp', async (req, res) => {
    const phone = req.query.phone;
    const otp = req.query.otp;

    if (!phone || !otp) return res.status(400).send('Missing phone or otp');

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
