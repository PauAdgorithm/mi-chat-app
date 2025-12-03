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

// --- HELPER: GESTIÓN DE CONTACTOS CON NOMBRE REAL ---
// Ahora acepta un tercer parámetro opcional: profileName
async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return;
  const cleanPhone = phone.replace(/\D/g, ''); 

  try {
    const contacts = await base('Contacts').select({
      filterByFormula: `{phone} = '${phone}'`,
      maxRecords: 1
    }).firstPage();

    const now = new Date().toISOString();

    if (contacts.length > 0) {
      // Si ya existe, solo actualizamos el último mensaje
      await base('Contacts').update([{
        id: contacts[0].id,
        fields: { "last_message": text, "last_message_time": now }
      }], { typecast: true });
    } else {
      // SI ES NUEVO: Usamos el nombre de WhatsApp si existe
      // Formato: "34666... (Pau)"
      const newName = profileName ? `${phone} (${profileName})` : phone;

      await base('Contacts').create([{
        fields: {
          "phone": phone,
          "name": newName, // <--- AQUÍ GUARDAMOS EL NOMBRE
          "status": "Nuevo",
          "last_message": text,
          "last_message_time": now
        }
      }], { typecast: true });
      
      console.log(`✨ Nuevo contacto creado: ${newName}`);
      io.emit('contact_updated_notification');
    }
  } catch (error: any) {
    console.error("❌ Error Contactos:", error?.error || error);
  }
}

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
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

// --- RUTA: SUBIR IMAGEN ---
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const targetPhone = req.body.targetPhone;
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });

    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, {
        headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() }
    });
    const mediaId = uploadRes.data.id;

    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, {
        messaging_product: "whatsapp", to: targetPhone, type: "image", image: { id: mediaId }
    }, { headers: { Authorization: `Bearer ${waToken}` } });

    await saveAndEmitMessage({
        text: "📷 Imagen enviada", sender: "Agente", recipient: targetPhone,
        timestamp: new Date().toISOString(), type: "image", mediaId: mediaId
    });
    await handleContactUpdate(targetPhone, "Tú: 📷 Imagen");
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error upload" }); }
});

// --- WEBHOOK ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === verifyToken) res.status(200).send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      // Comprobamos si hay mensajes
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const value = body.entry[0].changes[0].value;
        const messageData = value.messages[0];
        
        // --- AQUÍ ATRAPAMOS EL NOMBRE DEL PERFIL ---
        const contacts = value.contacts;
        let profileName = "";
        if (contacts && contacts[0] && contacts[0].profile) {
            profileName = contacts[0].profile.name;
        }
        
        const from = messageData.from; 
        
        let text = "(Desconocido)";
        let type = messageData.type;
        let mediaId = "";

        if (type === 'text') text = messageData.text.body;
        else if (type === 'image') {
            text = messageData.image.caption || "📷 Imagen recibida";
            mediaId = messageData.image.id;
        }
        
        console.log(`📩 De ${from} (${profileName}): ${text}`);
        
        // Pasamos el nombre al helper para que lo guarde en Airtable
        await handleContactUpdate(from, text, profileName);
        
        await saveAndEmitMessage({ 
            text, sender: from, timestamp: new Date().toISOString(), type, mediaId 
        });
      }
      res.sendStatus(200);
    } else res.sendStatus(404);
  } catch (error) { 
      console.error("Error Webhook:", error);
      res.sendStatus(500); 
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  // 1. Enviar CONTACTOS
  socket.on('request_contacts', async () => {
    if (base) {
      try {
        const records = await base('Contacts').select({
          sort: [{ field: "last_message_time", direction: "desc" }]
        }).all();
        
        const contacts = records.map(r => {
            const avatarField = r.get('avatar') as any[];
            const avatarUrl = (avatarField && avatarField.length > 0) ? avatarField[0].url : null;
            return {
              id: r.id,
              phone: (r.get('phone') as string) || "",
              name: (r.get('name') as string) || (r.get('phone') as string) || "Desconocido",
              status: (r.get('status') as string) || "Nuevo",
              department: (r.get('department') as string) || "",
              last_message: (r.get('last_message') as string) || "",
              last_message_time: (r.get('last_message_time') as string) || new Date().toISOString(),
              avatar: avatarUrl
            };
        });
        socket.emit('contacts_update', contacts);
      } catch (e) { console.error("Error contactos:", e); }
    }
  });

  // 2. Enviar MENSAJES
  socket.on('request_conversation', async (phoneNumber) => {
    if (base) {
      const records = await base('Messages').select({
        filterByFormula: `OR({sender} = '${phoneNumber}', {recipient} = '${phoneNumber}')`, 
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

  // 3. Actualizar Info
  socket.on('update_contact_info', async (data) => {
    if (base) {
        const records = await base('Contacts').select({ filterByFormula: `{phone} = '${data.phone}'`, maxRecords: 1 }).firstPage();
        if (records.length > 0) {
            await base('Contacts').update([{ id: records[0].id, fields: data.updates }], { typecast: true });
            io.emit('contact_updated_notification');
        }
    }
  });

  // 4. Enviar Mensaje Texto
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

httpServer.listen(PORT, () => {
  console.log(`🚀 SERVIDOR ONLINE en puerto ${PORT}`);
});