import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';

console.log("🚀 [BOOT] Arrancando servidor...");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN ---
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
  } catch (e) { console.error("Error Airtable:", e); }
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- HELPER: LIMPIAR NÚMERO ---
// Quita +, espacios y guiones. Deja solo dígitos.
const cleanNumber = (phone: string) => {
    if (!phone) return "";
    return phone.replace(/\D/g, '');
};

// --- RUTA: TUNEL MEDIA ---
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
        if (mediaRes.headers['content-length']) res.setHeader('Content-Length', mediaRes.headers['content-length']);
        res.setHeader('Accept-Ranges', 'bytes');
        
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

// --- SUBIDA DE ARCHIVOS ---
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    let targetPhone = req.body.targetPhone;
    const senderName = req.body.senderName || "Agente";

    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });

    // LIMPIEZA DE NÚMERO IMPORTANTE
    targetPhone = cleanNumber(targetPhone);

    const mime = file.mimetype;
    let msgType = 'document'; 
    
    // WhatsApp admite jpg/png como imagen, y ogg/mp4/aac/amr como audio.
    // Webm (grabación de PC) NO es soportado como audio nativo, se envía como documento.
    if (mime === 'image/jpeg' || mime === 'image/png') msgType = 'image';
    else if (['audio/aac', 'audio/mp4', 'audio/amr', 'audio/mpeg', 'audio/ogg'].includes(mime)) msgType = 'audio';
    
    console.log(`📤 Subiendo ${msgType} (${mime}) para ${targetPhone}...`);

    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, {
        headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() }
    });
    const mediaId = uploadRes.data.id;

    const payload: any = { messaging_product: "whatsapp", to: targetPhone, type: msgType };
    if (msgType === 'image') payload.image = { id: mediaId };
    else if (msgType === 'audio') payload.audio = { id: mediaId };
    else payload.document = { id: mediaId, filename: file.originalname };

    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { 
        headers: { Authorization: `Bearer ${waToken}` } 
    });

    let textLog = file.originalname;
    let saveType = 'document';
    if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; }
    else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; }
    else if (mime.includes('audio')) { textLog = "🎤 [Audio WebM]"; saveType = 'audio'; } // Lo guardamos como audio en DB para que el chat intente reproducirlo

    await saveAndEmitMessage({
        text: textLog, 
        sender: senderName, 
        recipient: targetPhone,
        timestamp: new Date().toISOString(),
        type: saveType,
        mediaId: mediaId
    });
    
    await handleContactUpdate(targetPhone, `Tú (${senderName}): 📎 Archivo`);
    res.json({ success: true });

  } catch (error: any) { 
      console.error("❌ Error Upload:", error.response?.data || error.message);
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
        const profileName = value.contacts?.[0]?.profile?.name || "";
        const from = msgData.from; // Este suele venir limpio de Meta
        
        let text = "(Desconocido)";
        let type = msgData.type;
        let mediaId = "";

        if (type === 'text') text = msgData.text.body;
        else if (type === 'image') { text = msgData.image.caption || "📷 Imagen"; mediaId = msgData.image.id; }
        else if (type === 'audio' || type === 'voice') { 
            text = "🎤 Audio"; mediaId = (msgData.audio || msgData.voice).id; type = 'audio'; 
        } else if (type === 'document') { 
            text = msgData.document.filename || "📄 Documento"; mediaId = msgData.document.id; 
        } else if (type === 'sticker') text = "👾 Sticker";
        
        console.log(`📩 De ${from}: ${text}`);
        await handleContactUpdate(from, text, profileName);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type, mediaId });
    }
    res.sendStatus(200);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return;
  const cleanPhone = cleanNumber(phone); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanPhone}'`, maxRecords: 1 }).firstPage();
    const now = new Date().toISOString();
    
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": now } }], { typecast: true });
    } else {
      const newName = profileName ? `${cleanPhone} (${profileName})` : cleanPhone;
      await base('Contacts').create([{ fields: { "phone": cleanPhone, "name": newName, "status": "Nuevo", "last_message": text, "last_message_time": now } }], { typecast: true });
      io.emit('contact_updated_notification');
    }
  } catch (e) { console.error("Error Contactos:", e); }
}

io.on('connection', (socket) => {
  // ... (Resto de lógica de Sockets igual)
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
      } catch(e) { console.error(e); }
    }
  });

  socket.on('request_conversation', async (phone) => {
    if (base) {
      const cleanPhone = cleanNumber(phone);
      try {
        const records = await base('Messages').select({
            // Buscamos por número limpio para evitar fallos si uno tiene + y el otro no
            filterByFormula: `OR({sender} = '${cleanPhone}', {recipient} = '${cleanPhone}')`, 
            sort: [{ field: "timestamp", direction: "asc" }]
        }).all();
        socket.emit('conversation_history', records.map(r => ({
            text: (r.get('text') as string) || "",
            sender: (r.get('sender') as string) || "",
            timestamp: (r.get('timestamp') as string) || "",
            type: (r.get('type') as string) || "text",
            mediaId: (r.get('media_id') as string) || "" 
        })));
      } catch(e) { console.error(e); }
    }
  });

  socket.on('update_contact_info', async (data) => {
      if(base) {
          const cleanPhone = cleanNumber(data.phone);
          const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanPhone}'`, maxRecords: 1 }).firstPage();
          if (records.length > 0) {
              await base('Contacts').update([{ id: records[0].id, fields: data.updates }], { typecast: true });
              io.emit('contact_updated_notification');
          }
      }
  });

  socket.on('chatMessage', async (msg) => {
    const targetPhone = cleanNumber(msg.targetPhone || process.env.TEST_TARGET_PHONE); // LIMPIEZA AQUÍ TAMBIÉN
    if (waToken && waPhoneId) {
       try {
         await axios.post(
           `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
           { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } },
           { headers: { Authorization: `Bearer ${waToken}` } }
         );
         await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: targetPhone, timestamp: new Date().toISOString() });
         await handleContactUpdate(targetPhone, `Tú (${msg.sender}): ${msg.text}`);
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