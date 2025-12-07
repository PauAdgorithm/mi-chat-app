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

// --- VARIABLES DE ENTORNO ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const waBusinessId = process.env.WHATSAPP_BUSINESS_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

const TABLE_TEMPLATES = 'Templates';

// --- CONFIGURACIÓN AIRTABLE ---
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    Airtable.configure({ apiKey: airtableApiKey });
    base = Airtable.base(airtableBaseId);
    console.log("✅ Airtable configurado correctamente");
  } catch (e) { console.error("Error Airtable:", e); }
} else {
    console.error("❌ FALTA CONFIGURACIÓN: Revisa AIRTABLE_API_KEY y AIRTABLE_BASE_ID");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

// ==========================================
//  RUTAS DE PLANTILLAS (CRUD + ENVÍO)
// ==========================================

// 1. OBTENER PLANTILLAS
app.get('/api/templates', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    try {
        const records = await base(TABLE_TEMPLATES).select().all();
        const formatted = records.map((record) => ({
            id: record.id,
            name: (record.get('Name') as string) || '',
            category: (record.get('Category') as string) || 'MARKETING',
            language: (record.get('Language') as string) || 'es',
            body: (record.get('Body') as string) || '',
            footer: (record.get('Footer') as string) || '',
            status: (record.get('Status') as string) || 'PENDING',
            metaId: (record.get('MetaId') as string) || '',
            variableMapping: record.get('VariableMapping') 
                ? JSON.parse(record.get('VariableMapping') as string) : {}
        }));
        res.json(formatted);
    } catch (error: any) {
        console.error("❌ Error GET templates:", error);
        res.status(500).json({ error: "Error interno" });
    }
});

// 2. CREAR PLANTILLA (Y REGISTRAR EN META)
app.post('/api/create-template', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });

    try {
        const { name, category, body, language, footer, variableExamples } = req.body;
        
        let metaId = "meta_simulado_" + Date.now();
        let status = "PENDING";

        // Envío real a Meta si tenemos credenciales
        if (waToken && waBusinessId) {
            try {
                console.log("📤 Enviando plantilla a Meta API...");
                const metaPayload: any = {
                    name: name,
                    category: category,
                    allow_category_change: true,
                    language: language,
                    components: [
                        { type: "BODY", text: body }
                    ]
                };
                if (footer) metaPayload.components.push({ type: "FOOTER", text: footer });

                const metaRes = await axios.post(
                    `https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`,
                    metaPayload,
                    { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } }
                );
                
                metaId = metaRes.data.id;
                status = metaRes.data.status || "PENDING";
                console.log("✅ Plantilla creada en Meta ID:", metaId);
            } catch (metaError: any) {
                console.error("⚠️ Error Meta:", metaError.response?.data || metaError.message);
                status = "REJECTED"; 
            }
        }

        const createdRecords = await base(TABLE_TEMPLATES).create([{
            "fields": {
                "Name": name, "Category": category, "Language": language,
                "Body": body, "Footer": footer, "Status": status,
                "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {})
            }
        }]);

        res.json({ success: true, template: { id: createdRecords[0].id, name, category, language, body, footer, status, variableMapping: variableExamples } });

    } catch (error: any) {
        console.error("❌ Error creando:", error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// 3. ELIMINAR PLANTILLA
app.delete('/api/delete-template/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    const { id } = req.params;
    try {
        await base(TABLE_TEMPLATES).destroy([id]);
        console.log("🗑️ Plantilla eliminada de Airtable:", id);
        res.json({ success: true });
    } catch (error: any) {
        console.error("❌ Error eliminando:", error);
        res.status(500).json({ error: "No se pudo eliminar" });
    }
});

// 4. ENVIAR PLANTILLA (CORREGIDO: Sin placeholders vacíos)
app.post('/api/send-template', async (req, res) => {
    if (!waToken || !waPhoneId) return res.status(500).json({ error: "Faltan credenciales de WhatsApp" });

    try {
        // AÑADIDO: senderName en la desestructuración
        const { templateName, language, phone, variables, previewText, senderName } = req.body;
        
        const parameters = variables.map((val: string) => ({ type: "text", text: val }));

        // Payload completo para Meta
        const payload = {
            messaging_product: "whatsapp",
            to: cleanNumber(phone),
            type: "template",
            template: {
                name: templateName,
                language: { code: language },
                components: [{ type: "body", parameters: parameters }]
            }
        };

        console.log("📤 Enviando plantilla a:", phone);

        // Envío real a Meta (AQUÍ ESTABA EL ERROR ANTES, AHORA ESTÁ COMPLETO)
        await axios.post(
            `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${waToken}` } }
        );

        // Guardar el TEXTO REAL en el chat con el REMITENTE CORRECTO
        const finalMessage = previewText || `📝 [Plantilla] ${templateName}`;
        
        await saveAndEmitMessage({ 
            text: finalMessage, 
            sender: senderName || "Agente", // <--- USAMOS EL NOMBRE REAL (o Agente si no llega)
            recipient: cleanNumber(phone), 
            timestamp: new Date().toISOString(), 
            type: "template" 
        });
        
        res.json({ success: true });

    } catch (error: any) {
        console.error("❌ Error enviando plantilla:", error.response?.data || error.message);
        res.status(400).json({ error: error.response?.data?.error?.message || "Error al enviar" });
    }
});

// ==========================================
//  RUTAS DE ANALÍTICAS
// ==========================================

app.get('/api/analytics', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    
    try {
        const contacts = await base('Contacts').select().all();
        const messages = await base('Messages').select().all();
        
        // 1. KPIs Generales
        const totalContacts = contacts.length;
        const totalMessages = messages.length;
        const newLeads = contacts.filter(c => c.get('status') === 'Nuevo').length;
        
        // 2. Actividad (Gráfico)
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const activityData = last7Days.map(date => {
            const count = messages.filter(m => {
                const mDate = (m.get('timestamp') as string || "").split('T')[0];
                return mDate === date;
            }).length;
            const label = new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            return { date, label, count };
        });

        // 3. RENDIMIENTO AGENTES
        const agentStats: Record<string, { msgs: number, uniqueChats: Set<string> }> = {};

        messages.forEach(m => {
            const sender = (m.get('sender') as string) || "";
            const recipient = (m.get('recipient') as string) || "";
            
            // Detectar si es agente: NO es un número de teléfono (contiene letras)
            const isPhone = /^\d+$/.test(sender.replace(/\D/g, '')); 
            
            // Si el remitente tiene letras (es un nombre de usuario/agente) y no es 'Sistema'
            if (!isPhone && sender.toLowerCase() !== 'sistema' && sender.trim() !== '') {
                if (!agentStats[sender]) {
                    agentStats[sender] = { msgs: 0, uniqueChats: new Set() };
                }
                agentStats[sender].msgs += 1;
                if (recipient) agentStats[sender].uniqueChats.add(recipient);
            }
        });

        const agentPerformance = Object.entries(agentStats)
            .map(([name, data]) => ({ 
                name, 
                msgCount: data.msgs,
                chatCount: data.uniqueChats.size 
            }))
            .sort((a, b) => b.msgCount - a.msgCount)
            .slice(0, 5);

        // 4. Distribución por Estado
        const statusMap: Record<string, number> = {};
        contacts.forEach(c => {
            const s = (c.get('status') as string) || 'Otros';
            statusMap[s] = (statusMap[s] || 0) + 1;
        });
        const statusDistribution = Object.entries(statusMap).map(([name, count]) => ({ name, count }));

        res.json({
            kpis: { totalContacts, totalMessages, newLeads },
            activity: activityData,
            agents: agentPerformance,
            statuses: statusDistribution
        });

    } catch (error: any) {
        console.error("❌ Error calculando analíticas:", error);
        res.status(500).json({ error: "Error interno" });
    }
});

// ==========================================
//  RUTAS DE ARCHIVOS Y MEDIA
// ==========================================

app.get('/api/media/:id', async (req, res) => {
    const { id } = req.params;
    if (!waToken) return res.sendStatus(500);
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${id}`, { headers: { 'Authorization': `Bearer ${waToken}` } });
        const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' });
        res.setHeader('Content-Type', mediaRes.headers['content-type']);
        if (mediaRes.headers['content-length']) res.setHeader('Content-Length', mediaRes.headers['content-length']);
        res.setHeader('Accept-Ranges', 'bytes');
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    let targetPhone = req.body.targetPhone;
    const senderName = req.body.senderName || "Agente";
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });
    targetPhone = cleanNumber(targetPhone);
    const mime = file.mimetype;
    let msgType = 'document'; 
    if (mime === 'image/jpeg' || mime === 'image/png') msgType = 'image';
    else if (mime.startsWith('audio/') || ['audio/aac', 'audio/mp4', 'audio/amr', 'audio/mpeg', 'audio/ogg'].includes(mime)) msgType = 'audio';
    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');
    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() } });
    const mediaId = uploadRes.data.id;
    const payload: any = { messaging_product: "whatsapp", to: targetPhone, type: msgType };
    if (msgType === 'image') payload.image = { id: mediaId }; else if (msgType === 'audio') payload.audio = { id: mediaId }; else payload.document = { id: mediaId, filename: file.originalname };
    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${waToken}` } });
    let textLog = file.originalname; let saveType = 'document';
    if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; } else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; } else if (mime.includes('audio')) { textLog = "🎤 [Audio WebM]"; saveType = 'audio'; }
    await saveAndEmitMessage({ text: textLog, sender: senderName, recipient: targetPhone, timestamp: new Date().toISOString(), type: saveType, mediaId: mediaId });
    await handleContactUpdate(targetPhone, `Tú (${senderName}): 📎 Archivo`);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error subiendo archivo" }); }
});

// ==========================================
//  WEBHOOKS
// ==========================================

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const value = body.entry[0].changes[0].value;
        const msgData = value.messages[0];
        const profileName = value.contacts?.[0]?.profile?.name || "";
        const from = msgData.from; 
        let text = "(Desconocido)"; let type = msgData.type; let mediaId = "";
        if (type === 'text') text = msgData.text.body; else if (type === 'image') { text = msgData.image.caption || "📷 Imagen"; mediaId = msgData.image.id; } else if (type === 'audio' || type === 'voice') { text = "🎤 Audio"; mediaId = (msgData.audio || msgData.voice).id; type = 'audio'; } else if (type === 'document') { text = msgData.document.filename || "📄 Documento"; mediaId = msgData.document.id; } else if (type === 'sticker') text = "👾 Sticker";
        console.log(`📩 Webhook de ${from}: ${text}`);
        await handleContactUpdate(from, text, profileName);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type, mediaId });
    }
    
    // ACTUALIZACIÓN DE ESTADO DE PLANTILLAS
    if (body.object && body.entry?.[0]?.changes?.[0]?.field === 'message_template_status_update') {
        const event = body.entry[0].changes[0].value;
        const metaId = event.message_template_id;
        const newStatus = event.event; 
        console.log(`🔔 Cambio estado plantilla ${metaId}: ${newStatus}`);
        if (base) {
            try {
                const records = await base(TABLE_TEMPLATES).select({ filterByFormula: `{MetaId} = '${metaId}'` }).firstPage();
                if (records.length > 0) {
                    await base(TABLE_TEMPLATES).update([{ id: records[0].id, fields: { "Status": newStatus } }]);
                }
            } catch(e) { console.error("Error actualizando estado plantilla:", e); }
        }
    }

    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

// --- HELPER FUNCTIONS ---

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

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ fields: { "text": msg.text || "", "sender": msg.sender || "Desc", "recipient": msg.recipient || "", "timestamp": msg.timestamp || new Date().toISOString(), "type": msg.type || "text", "media_id": msg.mediaId || "" } }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

// ==========================================
//  SOCKET.IO LOGIC
// ==========================================

io.on('connection', (socket) => {
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Añadido correctamente'); } });
  socket.on('delete_config', async (id) => { if (base) { await base('Config').destroy([id]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Eliminado correctamente'); } });
  socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Actualizado correctamente'); } });

  // Quick Replies
  socket.on('request_quick_replies', async () => { if (base) { const r = await base('QuickReplies').select().all(); socket.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('add_quick_reply', async (d) => { if (base) { await base('QuickReplies').create([{ fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); socket.emit('action_success', 'Creado'); } });
  socket.on('delete_quick_reply', async (id) => { if (base) { await base('QuickReplies').destroy([id]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); socket.emit('action_success', 'Eliminado'); } });
  socket.on('update_quick_reply', async (d) => { if (base) { await base('QuickReplies').update([{ id: d.id, fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); socket.emit('action_success', 'Actualizado'); } });

  socket.on('request_agents', async () => { if (base) { const records = await base('Agents').select().all(); socket.emit('agents_list', records.map(r => ({ id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!r.get('password') }))); } });
  socket.on('login_attempt', async (data) => { if(!base) return; const records = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage(); if (records.length > 0) { const dbPassword = records[0].get('password'); if (!dbPassword || String(dbPassword).trim() === "") { socket.emit('login_success', { username: records[0].get('name'), role: records[0].get('role') }); } else { if (String(dbPassword) === String(data.password)) { socket.emit('login_success', { username: records[0].get('name'), role: records[0].get('role') }); } else { socket.emit('login_error', 'Contraseña incorrecta'); } } } else { socket.emit('login_error', 'Usuario no encontrado'); } });
  socket.on('create_agent', async (data) => { if (!base) return; const { newAgent } = data; await base('Agents').create([{ fields: { "name": newAgent.name, "role": newAgent.role, "password": newAgent.password || "" } }]); const updatedRecords = await base('Agents').select().all(); io.emit('agents_list', updatedRecords.map(r => ({ id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!r.get('password') }))); socket.emit('action_success', 'Perfil creado'); });
  socket.on('delete_agent', async (data) => { if (!base) return; const { agentId } = data; await base('Agents').destroy([agentId]); const updated = await base('Agents').select().all(); io.emit('agents_list', updated.map(r => ({ id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!r.get('password') }))); socket.emit('action_success', 'Perfil eliminado'); });
  socket.on('update_agent', async (data) => { if (!base) return; const fields: any = { "name": data.updates.name, "role": data.updates.role }; if (data.updates.password !== undefined) fields["password"] = data.updates.password; await base('Agents').update([{ id: data.agentId, fields: fields }]); const updated = await base('Agents').select().all(); io.emit('agents_list', updated.map(r => ({ id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!r.get('password') }))); socket.emit('action_success', 'Perfil actualizado'); });
  socket.on('request_contacts', async () => { if (base) { const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all(); socket.emit('contacts_update', r.map(x => ({ id: x.id, phone: x.get('phone'), name: x.get('name'), status: x.get('status'), department: x.get('department'), assigned_to: x.get('assigned_to'), last_message: x.get('last_message'), last_message_time: x.get('last_message_time'), avatar: (x.get('avatar') as any[])?.[0]?.url, email: x.get('email'), address: x.get('address'), notes: x.get('notes'), signup_date: x.get('signup_date'), tags: x.get('tags') || [] }))); } });
  socket.on('request_conversation', async (p) => { if (base) { const c = cleanNumber(p); const r = await base('Messages').select({ filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all(); socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') }))); } });
  socket.on('update_contact_info', async (data) => { if(base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });
  socket.on('chatMessage', async (msg) => { const targetPhone = cleanNumber(msg.targetPhone || process.env.TEST_TARGET_PHONE); if (waToken && waPhoneId) { try { if (msg.type !== 'note') { await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${waToken}` } }); } else { console.log("📝 Nota interna guardada"); } await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: targetPhone, timestamp: new Date().toISOString(), type: msg.type || 'text' }); const previewText = msg.type === 'note' ? `📝 Nota: ${msg.text}` : `Tú (${msg.sender}): ${msg.text}`; await handleContactUpdate(targetPhone, previewText); } catch (error: any) { console.error("Error envío:", error.message); } } });
  socket.on('register_presence', (username: string) => { if (username) { onlineUsers.set(socket.id, username); console.log(`🟢 Usuario online: ${username} (ID: ${socket.id})`); const uniqueUsers = Array.from(new Set(onlineUsers.values())); io.emit('online_users_update', uniqueUsers); } });
  socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { const leaver = onlineUsers.get(socket.id); onlineUsers.delete(socket.id); console.log(`🔴 Usuario offline: ${leaver} (ID: ${socket.id})`); const uniqueUsers = Array.from(new Set(onlineUsers.values())); io.emit('online_users_update', uniqueUsers); } });
  socket.on('typing', (data) => { console.log(`🔔 [SERVER] Recibido evento typing de usuario: ${data.user} para el chat: ${data.phone}`); socket.broadcast.emit('remote_typing', data); });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo en puerto ${PORT}`); });