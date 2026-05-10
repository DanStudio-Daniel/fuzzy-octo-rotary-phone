const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');

const app = express().use(bodyParser.json());

// --- CONFIGURATION ---
const PAGE_ACCESS_TOKEN = 'EAAW7bgNPIuABRef4gSwZAyYwtTbDPdRn5uLpCE9RxVoPc5fMfJaoqncUZCdWRBf9ItbcB0ASxKuLTy82dEjzKZC3PAneB9l8jbdDTl3x1tmOf74gQMKW7nBY17S7pqF10Kv6h1J7xnSGhM5I2RCKk1J2xaPVG27XO91gwso09bhxIyN6qovxgAyM7vrwvMF5I2twwZDZD';
const VERIFY_TOKEN = 'key';
const FONT_STYLE = "sans-serif";

const sessions = new Map();

// 1. WEBHOOK VERIFICATION
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// 2. MESSAGE HANDLER
app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhook_event = entry.messaging[0];
            const psid = webhook_event.sender.id;
            if (webhook_event.message) handleMessage(psid, webhook_event.message);
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function handleMessage(psid, msg) {
    const text = msg.text ? msg.text.trim() : "";
    const session = sessions.get(psid);

    if (text.toLowerCase() === 'create') {
        sessions.set(psid, { step: 'PHOTO' });
        return callSendAPI(psid, "📸 **iFake Phone Engine Ready**\n\n[1/3] Please send the **Profile Picture**.");
    }

    if (!session) {
        return callSendAPI(psid, "👋 Welcome! Please type **create** to generate a phone conversation screenshot.");
    }

    switch(session.step) {
        case 'PHOTO':
            if (msg.attachments && msg.attachments[0].type === 'image') {
                session.pfpUrl = msg.attachments[0].payload.url;
                session.step = 'NAME';
                callSendAPI(psid, "👤 [2/3] What is the **Partner's Name**?");
            } else {
                callSendAPI(psid, "❌ Please send an image to continue.");
            }
            break;

        case 'NAME':
            session.partnerName = text;
            session.step = 'MESSAGES';
            callSendAPI(psid, "💬 [3/3] Enter the messages.\n\n**Format:**\nme: Hello\npartner: Hi!\\nHow are you?\n\n*Type 'create' to restart.*");
            break;

        case 'MESSAGES':
            if (!text.includes(':')) return callSendAPI(psid, "❌ Format error. Use `me: text` or `partner: text`.");
            
            callSendAPI(psid, "⏳ Rendering professional phone screenshot...");
            try {
                const chatData = parseMessages(text);
                const buffer = await renderChat(session.partnerName, session.pfpUrl, chatData);
                await sendImage(psid, buffer);
                sessions.delete(psid);
                setTimeout(() => callSendAPI(psid, "✅ Done! Type **create** for a new one."), 1500);
            } catch (e) {
                console.error(e);
                callSendAPI(psid, "❌ Render failed. Please try again.");
                sessions.delete(psid);
            }
            break;
    }
}

// 3. RENDER ENGINE (Phone & UI)
async function renderChat(name, pfpUrl, chatData) {
    const width = 750;
    const height = 1334; 
    const bubbleMaxW = 480;
    const padding = 30;
    const fontSize = 28;
    const lineHeight = 38;

    const avatar = await loadImage(pfpUrl);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // BG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // --- STATUS BAR ---
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillStyle = '#000';
    ctx.font = `bold 24px ${FONT_STYLE}`;
    ctx.fillText(timeStr, 50, 45);
    // Battery
    ctx.strokeRect(660, 25, 45, 22);
    ctx.fillRect(705, 31, 4, 10);
    ctx.fillStyle = '#28a745';
    ctx.fillRect(663, 28, 32, 16); // 80% charge
    // Signal
    ctx.fillStyle = '#000';
    for(let i=0; i<4; i++) ctx.fillRect(600 + (i*12), 45 - (i*5), 8, 5 + (i*5));

    // --- HEADER ---
    ctx.font = `bold ${fontSize + 6}px ${FONT_STYLE}`;
    ctx.fillText(name, 145, 115);
    ctx.fillStyle = '#8e8e8e';
    ctx.font = `${fontSize - 4}px ${FONT_STYLE}`;
    ctx.fillText("Active Now", 145, 150);
    // Back Icon
    ctx.strokeStyle = '#0084ff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(45, 105); ctx.lineTo(30, 120); ctx.lineTo(45, 135); ctx.stroke();
    // Avatar
    ctx.save();
    ctx.beginPath(); ctx.arc(95, 120, 35, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, 60, 85, 70, 70);
    ctx.restore();

    // --- MESSAGES ---
    let currentY = 210;
    const ctxMeasurer = canvas.getContext('2d');
    ctxMeasurer.font = `${fontSize}px ${FONT_STYLE}`;

    chatData.forEach((msg, i) => {
        const isMe = msg.sender === 'me';
        const lines = wrapText(ctxMeasurer, msg.text, bubbleMaxW);
        const bHeight = (lines.length * lineHeight) + 30;
        
        if (currentY + bHeight > height - 120) return; // Screen limit

        const longestLine = Math.max(...lines.map(l => ctxMeasurer.measureText(l).width));
        const bWidth = longestLine + 45;
        const x = isMe ? (width - bWidth - padding) : (padding + 80);

        ctx.fillStyle = isMe ? '#0084ff' : '#f0f0f0';
        drawRoundedRect(ctx, x, currentY, bWidth, bHeight, 28);
        ctx.fill();

        ctx.fillStyle = isMe ? '#fff' : '#000';
        ctx.font = `${fontSize}px ${FONT_STYLE}`;
        lines.forEach((line, idx) => {
            ctx.fillText(line, x + 22, currentY + 42 + (idx * lineHeight));
        });

        if (!isMe) {
            ctx.save();
            ctx.beginPath(); ctx.arc(45, currentY + bHeight - 15, 15, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, 30, currentY + bHeight - 30, 30, 30);
            ctx.restore();
        }

        const isSame = chatData[i+1]?.sender === msg.sender;
        currentY += bHeight + (isSame ? 10 : 30);
    });

    // --- BOTTOM INPUT ---
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, height - 100, width, 100);
    ctx.fillStyle = '#f0f0f0';
    drawRoundedRect(ctx, 130, height - 85, 480, 65, 32);
    ctx.fill();
    ctx.fillStyle = '#8e8e8e';
    ctx.font = `26px ${FONT_STYLE}`;
    ctx.fillText("Aa", 160, height - 42);

    return canvas.toBuffer();
}

// 4. HELPERS
function parseMessages(input) {
    return input.split('\n').filter(l => l.includes(':')).map(line => {
        const [s, ...r] = line.split(':');
        return { sender: s.trim().toLowerCase() === 'me' ? 'me' : 'partner', text: r.join(':').trim().replace(/\\n/g, '\n') };
    });
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' '), lines = [];
    let currentLine = '';
    words.forEach(w => {
        const test = currentLine + w + ' ';
        if (ctx.measureText(test).width > maxWidth && currentLine !== '') {
            lines.push(currentLine.trim());
            currentLine = w + ' ';
        } else { currentLine = test; }
    });
    lines.push(currentLine.trim());
    return lines;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

function callSendAPI(psid, text) {
    axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { text }
    }).catch(e => console.error("Send Error", e.response.data));
}

async function sendImage(psid, buffer) {
    const form = new FormData();
    form.append('recipient', JSON.stringify({ id: psid }));
    form.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
    form.append('filedata', buffer, { filename: 'ifake.png' });
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, form, { headers: form.getHeaders() });
}

app.listen(process.env.PORT || 3000, () => console.log('Bot Active on Port 3000'));
