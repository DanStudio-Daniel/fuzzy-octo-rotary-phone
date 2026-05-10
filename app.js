const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');

const app = express().use(bodyParser.json());

// --- CONFIGURATION ---
const PAGE_ACCESS_TOKEN = 'EAAW7bgNPIuABRef4gSwZAyYwtTbDPdRn5uLpCE9RxVoPc5fMfJaoqncUZCdWRBf9ItbcB0ASxKuLTy82dEjzKZC3PAneB9l8jbdDTl3x1tmOf74gQMKW7nBY17S7pqF10Kv6h1J7xnSGhM5I2RCKk1J2xaPVG27XO91gwso09bhxIyN6qovxgAyM7vrwvMF5I2twwZDZD';
const VERIFY_TOKEN = 'key';
const FONT_MAIN = "sans-serif";

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

    // Initial Trigger
    if (text.toLowerCase() === 'create') {
        sessions.set(psid, { step: 'PHOTO' });
        return callSendAPI(psid, "📸 **iFake Messenger Engine**\n\n[1/3] Please send the **Profile Picture** for the partner.");
    }

    if (!session) {
        return callSendAPI(psid, "👋 Hello! To generate a professional Messenger conversation screenshot, please type **create** to start.");
    }

    switch(session.step) {
        case 'PHOTO':
            if (msg.attachments && msg.attachments[0].type === 'image') {
                session.pfpUrl = msg.attachments[0].payload.url;
                session.step = 'NAME';
                callSendAPI(psid, "👤 [2/3] Got it! What is the **Partner's Name**?");
            } else {
                callSendAPI(psid, "❌ Please send an image for the avatar.");
            }
            break;

        case 'NAME':
            session.partnerName = text;
            session.step = 'MESSAGES';
            callSendAPI(psid, "💬 [3/3] Last step! Enter your messages.\n\n**Format:**\nme: Hello\npartner: Hi there!\n\n💡 **Pro Tip:** Use `\\n` inside a message if you want to start a **new line** within the same bubble!\n\n*Example:* `me: Hey!\\nHow are you?` ");
            break;

        case 'MESSAGES':
            if (!text.includes(':')) return callSendAPI(psid, "❌ Format error. Please use `me: message` or `partner: message`.");
            
            callSendAPI(psid, "⏳ Rendering your high-end conversation... Please wait.");
            try {
                const chatData = parseMessages(text);
                const buffer = await renderChat(session.partnerName, session.pfpUrl, chatData);
                await sendImage(psid, buffer);
                sessions.delete(psid);
                setTimeout(() => callSendAPI(psid, "✅ Done! Type **create** to make another one."), 2000);
            } catch (e) {
                console.error(e);
                callSendAPI(psid, "❌ Render failed. Type **create** to restart.");
                sessions.delete(psid);
            }
            break;
    }
}

// 3. ENHANCED RENDER ENGINE
async function renderChat(name, pfpUrl, chatData) {
    const width = 750;
    const height = 1334;
    const bubbleMaxW = 500;
    const padding = 25;
    const fontSize = 28;
    const lineHeight = 38;

    const avatar = await loadImage(pfpUrl);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // --- STATUS BAR ---
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillStyle = '#000';
    ctx.font = `bold 26px ${FONT_MAIN}`;
    ctx.fillText(timeStr, 60, 50);

    // Notch (Dynamic Island)
    ctx.fillStyle = '#000000';
    drawRoundedRect(ctx, width/2 - 100, 20, 200, 40, 20);
    ctx.fill();

    // Signal & Battery
    ctx.fillStyle = '#000';
    for(let i=0; i<4; i++) ctx.fillRect(580 + (i*10), 48 - (i*5), 6, 5 + (i*5));
    ctx.strokeRect(650, 30, 45, 22);
    ctx.fillRect(653, 33, 35, 16); // 90% Battery
    ctx.fillRect(695, 36, 4, 10);

    // --- HEADER ---
    ctx.fillStyle = '#000';
    ctx.font = `bold 32px ${FONT_MAIN}`;
    ctx.fillText(name, 150, 125);
    ctx.fillStyle = '#8e8e8e';
    ctx.font = `22px ${FONT_MAIN}`;
    ctx.fillText("Active Now", 150, 155);

    // Call Icons
    ctx.fillStyle = '#0084ff';
    ctx.beginPath(); ctx.arc(600, 130, 22, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(680, 130, 22, 0, Math.PI*2); ctx.fill();

    // Back Arrow
    ctx.strokeStyle = '#0084ff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(45, 115); ctx.lineTo(30, 130); ctx.lineTo(45, 145); ctx.stroke();
    
    // Header Avatar
    ctx.save();
    ctx.beginPath(); ctx.arc(100, 130, 38, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, 62, 92, 76, 76);
    ctx.restore();

    // --- MESSAGES ---
    let currentY = 220;
    chatData.forEach((msg, i) => {
        const isMe = msg.sender === 'me';
        const lines = wrapText(ctx, msg.text, bubbleMaxW);
        const bHeight = (lines.length * lineHeight) + 32;
        
        if (currentY + bHeight > height - 150) return;

        const longestLine = Math.max(...lines.map(l => ctx.measureText(l).width));
        const bWidth = Math.min(longestLine + 45, bubbleMaxW + 45);
        const x = isMe ? (width - bWidth - padding) : (padding + 85);

        // Shadow
        ctx.shadowColor = "rgba(0,0,0,0.05)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = isMe ? '#0084ff' : '#f0f0f0';
        drawRoundedRect(ctx, x, currentY, bWidth, bHeight, 30);
        ctx.fill();
        ctx.shadowColor = "transparent";

        // Text
        ctx.fillStyle = isMe ? '#ffffff' : '#000000';
        ctx.font = `28px ${FONT_MAIN}`;
        lines.forEach((line, idx) => {
            ctx.fillText(line, x + 22, currentY + 44 + (idx * lineHeight));
        });

        // Partner mini-avatar or Delivery check
        if (!isMe) {
            ctx.save();
            ctx.beginPath(); ctx.arc(45, currentY + bHeight - 15, 16, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, 29, currentY + bHeight - 31, 32, 32);
            ctx.restore();
        } else if (i === chatData.length - 1) {
            ctx.strokeStyle = '#8e8e8e';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(width - 20, currentY + bHeight - 10, 8, 0, Math.PI*2); ctx.stroke();
        }

        const isSame = chatData[i+1]?.sender === msg.sender;
        currentY += bHeight + (isSame ? 8 : 32);
    });

    // --- BOTTOM BAR ---
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, height - 120, width, 120);
    ctx.fillStyle = '#0084ff';
    ctx.font = `bold 40px ${FONT_MAIN}`;
    ctx.fillText("+", 30, height - 60);
    ctx.beginPath(); ctx.arc(100, height - 72, 18, 0, Math.PI*2); ctx.fill();

    // Input Field
    ctx.fillStyle = '#f0f0f0';
    drawRoundedRect(ctx, 150, height - 105, 460, 68, 34);
    ctx.fill();
    ctx.fillStyle = '#8e8e8e';
    ctx.font = `26px ${FONT_MAIN}`;
    ctx.fillText("Aa", 185, height - 62);
    ctx.fillText("☺", 560, height - 62);

    // Send Button (Arrow)
    ctx.fillStyle = '#0084ff';
    ctx.beginPath();
    ctx.moveTo(660, height - 95); ctx.lineTo(710, height - 70); ctx.lineTo(660, height - 45);
    ctx.closePath(); ctx.fill();

    return canvas.toBuffer();
}

// 4. HELPERS & API
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
    form.append('filedata', buffer, { filename: 'ifake_pro.png' });
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, form, { headers: form.getHeaders() });
}

app.listen(process.env.PORT || 3000, () => console.log('Pagebot Engine Online'));
