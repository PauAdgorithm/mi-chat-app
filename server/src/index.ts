import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer'; // Para manejar archivos
import FormData from 'form-data'; // Para enviarlos a Meta

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Multer (Guardar archivos en memoria temporalmente)
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
  Airtable.configure({ apiKey: airtableApiKey });
  base = Airtable.base(airtableBaseId);
  console.log("✅ Airtable configurado");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- NUEVO: RUTA PARA SUBIR IMÁGENES ---
// 1. Recibe el archivo del Frontend
// 2. Lo sube a Meta
// 3. Envía el mensaje a WhatsApp
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const targetPhone = req.body.targetPhone;
    const senderName = req.body.senderName || "Agente";

    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });

    console.log(`📤 Subiendo imagen para ${targetPhone}...`);

    // A) Subir el archivo a los servidores de Meta para obtener un ID
    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${waPhoneId}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${waToken}`,
          ...formData.getHeaders()
        }
      }
    );

    const mediaId = uploadResponse.data.id;
    console.log(`✅ Imagen subida a Meta. ID: ${mediaId}`);

    // B) Enviar el mensaje con la imagen usando ese ID
    await axios.post(
      `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to: targetPhone,
        type: "image",
        image: { id: mediaId } // Usamos el ID que nos dio Meta
      },
      { headers: { Authorization: `Bearer ${waToken}` } }
    );

    // C) Guardar en Airtable y avisar al Frontend
    // Nota: Guardamos "[IMAGEN]" en el texto porque Airtable requiere gestión compleja para adjuntos reales
    await saveAndEmitMessage({
        text: "📷 [Imagen enviada]", 
        sender: "Agente", 
        recipient: targetPhone,
        timestamp: new Date().toISOString(),
        type: "image"
    });

    await handleContactUpdate(targetPhone, `Tú: 📷 [Imagen]`);

    res.json({ success: true });

  } catch (error: any) {
    console.error("❌ Error subiendo imagen:", error.response?.data || error.message);
    res.status(500).json({ error: "Error enviando imagen" });
  }
});

// --- HELPER CRM ---
async function handleContactUpdate(phone: string, text: string) {
  if (!base) return;
  const cleanPhone = phone.replace(/\D/g, ''); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${phone}'`, maxRecords: 1 }).firstPage();
    const now = new Date().toISOString();
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": now } }], { typecast: true });
    } else {
      await base('Contacts').create([{ fields: { "phone": phone, "name": phone, "status": "Nuevo", "last_message": text, "last_message_time": now } }], { typecast: true });
      io.emit('contact_updated_notification');
    }
  } catch (error: any) { console.error("Error Contactos:", error); }
}

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
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const from = messageData.from;
        
        // Detectar si es texto o imagen
        let text = "(Desconocido)";
        let type = messageData.type;

        if (type === 'text') {
            text = messageData.text.body;
        } else if (type === 'image') {
            text = "📷 [Imagen recibida]";
        } else if (type === 'document') {
            text = "📄 [Documento recibido]";
        } else {
            text = `[${type}]`;
        }
        
        console.log(`📩 WhatsApp de ${from}: ${text}`);
        await handleContactUpdate(from, text);
        await saveAndEmitMessage({ text: text, sender: from, timestamp: new Date().toISOString(), type: type });
      }
      res.sendStatus(200);
    } else res.sendStatus(404);
  } catch (error) { res.sendStatus(500); }
});

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

  socket.on('request_conversation', async (phoneNumber) => {
    if (base) {
      const records = await base('Messages').select({
        filterByFormula: `OR({sender} = '${phoneNumber}', {recipient} = '${phoneNumber}')`, 
        sort: [{ field: "timestamp", direction: "asc" }]
      }).all();
      socket.emit('conversation_history', records.map(r => ({
        text: (r.get('text') as string) || "",
        sender: (r.get('sender') as string) || "Desconocido",
        timestamp: (r.get('timestamp') as string) || new Date().toISOString(),
        type: (r.get('type') as string) || "text"
      })));
    }
  });

  socket.on('update_contact_info', async (data) => {
    if (base) {
        const records = await base('Contacts').select({ filterByFormula: `{phone} = '${data.phone}'`, maxRecords: 1 }).firstPage();
        if (records.length > 0) {
            await base('Contacts').update([{ id: records[0].id, fields: data.updates }], { typecast: true });
            io.emit('contact_updated_notification');
        }
    }
  });

  socket.on('chatMessage', async (msg) => {
    // Solo manejamos texto por aquí. Las imágenes van por /api/upload
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
            "type": msg.type || "text" // Guardamos el tipo
        } 
      }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});