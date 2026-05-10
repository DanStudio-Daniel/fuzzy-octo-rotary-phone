const express = require('express');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');

const app = express();
app.use(express.json());

// -------------------------- HARDCODED TOKENS --------------------------
const PAGE_ACCESS_TOKEN = "YOUR_PAGE_ACCESS_TOKEN_HERE";
const VERIFY_TOKEN = "YOUR_VERIFY_TOKEN_HERE";
const PORT = 3000;

// -------------------------- CONSTANTS --------------------------
const SCREEN_W = 375;
const SCREEN_H = 812;
const PADDING = 16;
const AVATAR_SIZE = 32;
const STATUS_BAR_H = 44;
const HEADER_H = 56;
const BUBBLE_MAX_W = 260;

const COLORS = {
  bg: "#FFFFFF",
  statusBar: "#F2F2F2",
  textDark: "#000000",
  textGray: "#6E6E6E",
  bubbleLeft: "#F0F1F3",
  bubbleRight: "#0084FF",
  textLeft: "#000000",
  textRight: "#FFFFFF",
  onlineDot: "#34C759" // Green dot (NOT blue)
};

// Temporary memory storage only
const userState = {};

// -------------------------- FACEBOOK API --------------------------
async function sendMessage(psid, text) {
  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: psid },
    message: { text }
  });
}

async function sendImageBuffer(psid, buffer) {
  const form = new FormData();
  form.append('recipient', JSON.stringify({ id: psid }));
  form.append('message', JSON.stringify({ attachment: { type: 'image', payload: {} } }));
  form.append('filedata', buffer, { filename: 'chat.png', contentType: 'image/png' });

  await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, form, {
    headers: form.getHeaders()
  });
}

// -------------------------- DRAW UI PARTS --------------------------
function drawStatusBar(ctx) {
  ctx.fillStyle = COLORS.statusBar;
  ctx.fillRect(0, 0, SCREEN_W, STATUS_BAR_H);

  // Time only — NO WIFI
  ctx.font = "bold 14px -apple-system, Arial";
  ctx.fillStyle = COLORS.textDark;
  ctx.fillText("9:41 AM", PADDING, STATUS_BAR_H - 14);

  // Signal
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(SCREEN_W - 60 + (i * 6), STATUS_BAR_H - 18 - (i * 3), 3, 6 + (i * 3));
  }
  // Battery
  ctx.fillRect(SCREEN_W - 25, STATUS_BAR_H - 18, 18, 10);
  ctx.fillStyle = COLORS.statusBar;
  ctx.fillRect(SCREEN_W - 23, STATUS_BAR_H - 16, 14, 6);
  ctx.fillStyle = COLORS.textDark;
  ctx.fillRect(SCREEN_W - 21, STATUS_BAR_H - 14, 10, 2);
}

async function drawHeader(ctx, partnerName, avatarImg) {
  // Back button <
  ctx.font = "bold 18px -apple-system, Arial";
  ctx.fillStyle = COLORS.textDark;
  ctx.fillText("<", PADDING, STATUS_BAR_H + HEADER_H/2 + 4);

  // Avatar
  ctx.drawImage(avatarImg, PADDING + 24, STATUS_BAR_H + 12, AVATAR_SIZE, AVATAR_SIZE);

  // ✅ Green online circle (NOT blue)
  ctx.fillStyle = COLORS.onlineDot;
  ctx.beginPath();
  ctx.arc(
    PADDING + 24 + AVATAR_SIZE - 6,
    STATUS_BAR_H + 12 + AVATAR_SIZE - 6,
    6, 0, Math.PI * 2
  );
  ctx.fill();

  // Name
  ctx.font = "bold 16px -apple-system, Arial";
  ctx.fillStyle = COLORS.textDark;
  ctx.fillText(partnerName, PADDING + 24 + AVATAR_SIZE + 8, STATUS_BAR_H + 24);

  // Status text
  ctx.font = "12px -apple-system, Arial";
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText("You're friends on Facebook", PADDING + 24 + AVATAR_SIZE + 8, STATUS_BAR_H + 42);
}

function wrapText(ctx, text, maxW) {
  const lines = [];
  let current = "";
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current);
      current = char;
    } else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

// -------------------------- GENERATE IMAGES --------------------------
async function generateChatImages(partnerName, avatarBuffer, conversation) {
  const messages = [];
  conversation.split("\n").forEach(line => {
    line = line.trim();
    if (!line) return;
    const lower = line.toLowerCase();
    if (lower.startsWith("me:")) {
      messages.push({ sender: "me", text: line.slice(3).trim() });
    } else if (lower.startsWith("partner:")) {
      messages.push({ sender: "partner", text: line.slice(8).trim() });
    }
  });

  const avatarImg = await loadImage(avatarBuffer);
  const ctxTemp = createCanvas(100, 100).getContext("2d");
  ctxTemp.font = "15px -apple-system, Arial";

  // Split long conversation into multiple screens
  const chunks = [];
  let currentChunk = [];
  let usedH = STATUS_BAR_H + HEADER_H + 8;

  for (const msg of messages) {
    const lines = wrapText(ctxTemp, msg.text, BUBBLE_MAX_W);
    const msgH = lines.length * 20 + 16 + 12;
    if (usedH + msgH > SCREEN_H - 20) {
      chunks.push(currentChunk);
      currentChunk = [];
      usedH = STATUS_BAR_H + HEADER_H + 8;
    }
    currentChunk.push(msg);
    usedH += msgH;
  }
  if (currentChunk.length) chunks.push(currentChunk);

  // Create each image
  const buffers = [];
  for (const chunk of chunks) {
    const canvas = createCanvas(SCREEN_W, SCREEN_H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx.font = "15px -apple-system, Arial";

    drawStatusBar(ctx);
    await drawHeader(ctx, partnerName, avatarImg);

    let y = STATUS_BAR_H + HEADER_H + 8;
    for (const m of chunk) {
      const isMe = m.sender === "me";
      const lines = wrapText(ctx, m.text, BUBBLE_MAX_W);
      const bubbleH = lines.length * 20 + 16;

      let bx, tx, align;
      if (isMe) {
        // ✅ Fully right aligned
        bx = SCREEN_W - PADDING - BUBBLE_MAX_W;
        ctx.fillStyle = COLORS.bubbleRight;
        tx = SCREEN_W - PADDING - 8;
        align = "right";
      } else {
        bx = PADDING + 24 + AVATAR_SIZE + 8;
        ctx.fillStyle = COLORS.bubbleLeft;
        tx = bx + 8;
        align = "left";
        ctx.drawImage(avatarImg, PADDING + 24, y, AVATAR_SIZE, AVATAR_SIZE);
      }

      // Bubble shape
      ctx.beginPath();
      ctx.moveTo(bx + 12, y);
      ctx.arcTo(bx + BUBBLE_MAX_W, y, bx + BUBBLE_MAX_W, y + bubbleH, 18);
      ctx.arcTo(bx + BUBBLE_MAX_W, y + bubbleH, bx, y + bubbleH, 18);
      ctx.arcTo(bx, y + bubbleH, bx, y, 18);
      ctx.arcTo(bx, y, bx + BUBBLE_MAX_W, y, 18);
      ctx.fill();

      // Text
      ctx.fillStyle = isMe ? COLORS.textRight : COLORS.textLeft;
      ctx.textAlign = align;
      lines.forEach((line, i) => {
        ctx.fillText(line, tx, y + 12 + (i * 20));
      });

      y += bubbleH + 12;
    }

    buffers.push(canvas.toBuffer("image/png"));
  }

  return buffers;
}

// -------------------------- WEBHOOK --------------------------
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", express.json({ type: "application/json" }), async (req, res) => {
  const event = req.body.entry?.[0]?.messaging?.[0];
  if (!event) return res.sendStatus(200);

  const psid = event.sender.id;

  // TEXT HANDLING
  if (event.message?.text) {
    const txt = event.message.text.trim().toLowerCase();

    if (txt === "create") {
      userState[psid] = { step: "await_pic" };
      return sendMessage(psid, "📸 Step 1: Send profile picture of partner.");
    }

    if (!userState[psid]) {
      return sendMessage(psid, `👋 Type *create* to start.\n\n📌 GUIDE:\n- Use \\n to make new line / space down\n- Format:\nme: text\npartner: text\n\n✅ Supports: Emojis, symbols, new lines`);
    }

    if (userState[psid].step === "await_name") {
      userState[psid].name = event.message.text.trim();
      userState[psid].step = "await_convo";
      return sendMessage(psid, `✅ Name set: ${userState[psid].name}\n\n✍️ Step 3: Send conversation like this:\n\nme: hi\npartner: hello\npartner: what do you need?\nme: I need:\ncoke\ncake 🧁\n\n⚠️ Use \\n to go down line`);
    }

    if (userState[psid].step === "await_convo") {
      userState[psid].convo = event.message.text;
      await sendMessage(psid, "⏳ Generating image(s)... please wait.");

      try {
        const buffers = await generateChatImages(
          userState[psid].name,
          userState[psid].avatarBuffer,
          userState[psid].convo
        );

        // Send all images
        for (const buf of buffers) await sendImageBuffer(psid, buf);

      } catch (err) {
        console.error(err);
        await sendMessage(psid, "❌ Error creating image. Try again.");
      }

      // ✅ CLEAN ALL MEMORY AFTER FINISH
      delete userState[psid];
    }
  }

  // IMAGE HANDLING
  if (event.message?.attachments) {
    const att = event.message.attachments[0];
    if (att.type === "image" && userState[psid]?.step === "await_pic") {
      try {
        const resImg = await axios.get(att.payload.url, { responseType: "arraybuffer" });
        userState[psid].avatarBuffer = Buffer.from(resImg.data);
        userState[psid].step = "await_name";
        await sendMessage(psid, "✅ Picture received!\n\n✍️ Step 2: Send name of partner.");
      } catch (err) {
        await sendMessage(psid, "❌ Failed to load picture, send again.");
      }
    }
  }

  res.sendStatus(200);
});

// -------------------------- START SERVER --------------------------
app.listen(PORT, () => console.log(`✅ Bot running on port ${PORT}`));
  
