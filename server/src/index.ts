import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// --- CONFIG ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    Airtable.configure({ apiKey: airtableApiKey });
    base = Airtable.base(airtableBaseId);
    console.log("✅ Airtable configurado");
  } catch (e) { console.error("Error Airtable config:", e); }
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- RUTA: TUNEL MEDIA (Descargar fotos/audios de Meta) ---
app.get('/api/media/:id', async (req, res) => {
    const { id } = req.params;
    if (!waToken) return res.sendStatus(500);
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${id}`, {
            headers: { 'Authorization': `Bearer ${waToken}` }
        });
        const mediaRes = await axios.get(urlRes.data.url, {
            headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream'
        });
        res.setHeader('Content-Type', mediaRes.headers['content-type']);
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

// --- RUTA: SUBIR ARCHIVOS (Imágenes y Audios) ---
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const targetPhone = req.body.targetPhone;
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });

    // Detectar tipo de archivo
    const isAudio = file.mimetype.includes('audio');
    const msgType = isAudio ? 'audio' : 'image';

    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    // 1. Subir a Meta
    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, {
        headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() }
    });
    const mediaId = uploadRes.data.id;

    // 2. Enviar mensaje
    const messagePayload: any = {
        messaging_product: "whatsapp", 
        to: targetPhone, 
        type: msgType
    };
    // WhatsApp pide objetos distintos según el tipo
    if (isAudio) messagePayload.audio = { id: mediaId };
    else messagePayload.image = { id: mediaId };

    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, messagePayload, { 
        headers: { Authorization: `Bearer ${waToken}` } 
    });

    // 3. Guardar en Airtable
    const textLog = isAudio ? "🎤 [Audio enviado]" : "📷 [Imagen enviada]";
    await saveAndEmitMessage({
        text: textLog, 
        sender: "Agente", 
        recipient: targetPhone,
        timestamp: new Date().toISOString(),
        type: msgType,
        mediaId: mediaId
    });
    await handleContactUpdate(targetPhone, `Tú: ${textLog}`);
    res.json({ success: true });
  } catch (error: any) { 
      console.error("Error upload:", error.response?.data || error.message);
      res.status(500).json({ error: "Error subiendo archivo" }); 
  }
});

// --- WEBHOOK ---
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const value = body.entry[0].changes[0].value;
        const msgData = value.messages[0];
        
        // Capturar nombre perfil
        const profileName = value.contacts?.[0]?.profile?.name || "";
        const from = msgData.from; 
        
        let text = "(Desconocido)";
        let type = msgData.type;
        let mediaId = "";

        if (type === 'text') text = msgData.text.body;
        else if (type === 'image') {
            text = msgData.image.caption || "📷 Imagen recibida";
            mediaId = msgData.image.id;
        } else if (type === 'audio' || type === 'voice') {
            text = "🎤 Audio recibido";
            mediaId = (msgData.audio || msgData.voice).id;
            type = 'audio'; // Normalizamos 'voice' a 'audio'
        }
        
        console.log(`📩 De ${from}: ${text}`);
        
        await handleContactUpdate(from, text, profileName);
        await saveAndEmitMessage({ 
            text, sender: from, timestamp: new Date().toISOString(), type, mediaId 
        });
    }
    res.sendStatus(200);
  } catch (e) { console.error("Error Webhook:", e); res.sendStatus(500); }
});

// --- HELPERS ---
async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return;
  const cleanPhone = phone.replace(/\D/g, ''); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${phone}'`, maxRecords: 1 }).firstPage();
    const now = new Date().toISOString();
    
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": now } }], { typecast: true });
    } else {
      const newName = profileName ? `${phone} (${profileName})` : phone;
      await base('Contacts').create([{ fields: { "phone": phone, "name": newName, "status": "Nuevo", "last_message": text, "last_message_time": now } }], { typecast: true });
      io.emit('contact_updated_notification');
    }
  } catch (e) { console.error("Error Contactos:", e); }
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('request_contacts', async () => {
    if (base) {
      try {
        const records = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all();
        socket.emit('contacts_update', records.map(r => {
            const avatarField = r.get('avatar') as any[];
            return {
              id: r.id,
              phone: (r.get('phone') as string) || "",
              name: (r.get('name') as string) || (r.get('phone') as string) || "Desconocido",
              status: (r.get('status') as string) || "Nuevo",
              department: (r.get('department') as string) || "",
              last_message: (r.get('last_message') as string) || "",
              last_message_time: (r.get('last_message_time') as string) || new Date().toISOString(),
              avatar: (avatarField && avatarField.length > 0) ? avatarField[0].url : null
            };
        }));
      } catch (e) { console.error("Error req contacts:", e); }
    }
  });

  socket.on('request_conversation', async (phone) => {
    if (base) {
      const records = await base('Messages').select({
        filterByFormula: `OR({sender} = '${phone}', {recipient} = '${phone}')`, 
        sort: [{ field: "timestamp", direction: "asc" }]
      }).all();
      socket.emit('conversation_history', records.map(r => ({
        text: (r.get('text') as string) || "",
        sender: (r.get('sender') as string) || "",
        timestamp: (r.get('timestamp') as string) || "",
        type: (r.get('type') as string) || "text",
        mediaId: (r.get('media_id') as string) || "" 
      })));
    }
  });

  socket.on('update_contact_info', async (data) => {
      if(base) {
          const records = await base('Contacts').select({ filterByFormula: `{phone} = '${data.phone}'`, maxRecords: 1 }).firstPage();
          if (records.length > 0) {
              await base('Contacts').update([{ id: records[0].id, fields: data.updates }], { typecast: true });
              io.emit('contact_updated_notification');
          }
      }
  });

  socket.on('chatMessage', async (msg) => {
    const targetPhone = msg.targetPhone || process.env.TEST_TARGET_PHONE;
    if (waToken && waPhoneId) {
       try {
         await axios.post(
           `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
           { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } },
           { headers: { Authorization: `Bearer ${waToken}` } }
         );
         await saveAndEmitMessage({ text: msg.text, sender: "Agente", recipient: targetPhone, timestamp: new Date().toISOString() });
         await handleContactUpdate(targetPhone, `Tú: ${msg.text}`);
       } catch (error: any) { console.error("Error envío:", error.message); }
    }
  });
});

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ 
        fields: { 
            "text": msg.text || "", 
            "sender": msg.sender || "Desc", 
            "recipient": msg.recipient || "", 
            "timestamp": msg.timestamp || new Date().toISOString(),
            "type": msg.type || "text",
            "media_id": msg.mediaId || ""
        } 
      }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

httpServer.listen(PORT, () => { console.log(`🚀 Listo ${PORT}`); });