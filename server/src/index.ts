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
  Airtable.configure({ apiKey: airtableApiKey });
  base = Airtable.base(airtableBaseId);
  console.log("✅ Airtable configurado");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- NUEVO: TUNEL PARA VER IMÁGENES DE WHATSAPP ---
// El frontend pedirá: /api/media/MEDIA_ID
app.get('/api/media/:id', async (req, res) => {
    const { id } = req.params;
    if (!waToken) return res.sendStatus(500);

    try {
        // 1. Preguntar a Facebook la URL real de descarga
        const urlResponse = await axios.get(`https://graph.facebook.com/v17.0/${id}`, {
            headers: { 'Authorization': `Bearer ${waToken}` }
        });
        const mediaUrl = urlResponse.data.url;

        // 2. Descargar la imagen (Stream) y pasarla al frontend
        const imageResponse = await axios.get(mediaUrl, {
            headers: { 'Authorization': `Bearer ${waToken}` },
            responseType: 'stream'
        });

        // Copiamos el tipo de archivo (jpeg, png...)
        res.setHeader('Content-Type', imageResponse.headers['content-type']);
        imageResponse.data.pipe(res);

    } catch (error) {
        console.error("Error descargando media:", error);
        res.sendStatus(404);
    }
});

// --- SUBIR IMAGEN (App -> WhatsApp) ---
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const targetPhone = req.body.targetPhone;
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });

    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    // 1. Subir a Meta
    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, {
        headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() }
    });
    const mediaId = uploadRes.data.id;

    // 2. Enviar mensaje
    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, {
        messaging_product: "whatsapp", to: targetPhone, type: "image", image: { id: mediaId }
    }, { headers: { Authorization: `Bearer ${waToken}` } });

    // 3. Guardar (Guardamos el mediaId también)
    await saveAndEmitMessage({
        text: "📷 Imagen enviada", 
        sender: "Agente", 
        recipient: targetPhone,
        timestamp: new Date().toISOString(),
        type: "image",
        mediaId: mediaId // Guardamos el ID para poder verla nosotros también
    });
    await handleContactUpdate(targetPhone, "Tú: 📷 Imagen");
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error upload" }); }
});

// --- WEBHOOK (Recibir de WhatsApp) ---
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msgData = body.entry[0].changes[0].value.messages[0];
        const from = msgData.from; 
        
        let text = "(Desconocido)";
        let type = msgData.type;
        let mediaId = "";

        if (type === 'text') {
            text = msgData.text.body;
        } else if (type === 'image') {
            text = msgData.image.caption || "📷 Imagen recibida";
            mediaId = msgData.image.id; // ¡CAPTURAMOS EL ID!
        } else {
            text = `[${type}]`;
        }
        
        console.log(`📩 De ${from}: ${text} (MediaID: ${mediaId})`);
        
        await handleContactUpdate(from, text);
        await saveAndEmitMessage({ 
            text, sender: from, timestamp: new Date().toISOString(), type, mediaId 
        });
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});

// --- HELPERS ---
async function handleContactUpdate(phone: string, text: string) {
  if (!base) return;
  const cleanPhone = phone.replace(/\D/g, ''); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${phone}'`, maxRecords: 1 }).firstPage();
    const now = new Date().toISOString();
    const data = { "last_message": text, "last_message_time": now };
    
    if (contacts.length > 0) await base('Contacts').update([{ id: contacts[0].id, fields: data }], { typecast: true });
    else {
        await base('Contacts').create([{ fields: { "phone": phone, "name": phone, "status": "Nuevo", ...data } }], { typecast: true });
        io.emit('contact_updated_notification');
    }
  } catch (e) { console.error("Error Contactos:", e); }
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('request_contacts', async () => {
    if (base) {
      const records = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all();
      socket.emit('contacts_update', records.map(r => ({
          id: r.id,
          phone: (r.get('phone') as string) || "",
          name: (r.get('name') as string) || (r.get('phone') as string) || "Desconocido",
          status: (r.get('status') as string) || "Nuevo",
          department: (r.get('department') as string) || "",
          last_message: (r.get('last_message') as string) || "",
          last_message_time: (r.get('last_message_time') as string) || new Date().toISOString()
      })));
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
        mediaId: (r.get('media_id') as string) || "" // Enviamos el ID al frontend
      })));
    }
  });

  // ... (Resto de eventos igual, update_contact_info y chatMessage)
  // chatMessage sigue igual que antes, solo texto
  socket.on('chatMessage', async (msg) => {
      // ... (Lógica de envío texto) ...
      // Asegúrate de copiar la lógica de chatMessage del código anterior o avísame
      // (Por simplicidad, asumo que usas la misma lógica de axios.post para texto)
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
         } catch (error: any) { console.error("Error enviando:", error.message); }
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
            "media_id": msg.mediaId || "" // GUARDAMOS EL ID
        } 
      }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

httpServer.listen(PORT, () => { console.log(`🚀 Listo ${PORT}`); });