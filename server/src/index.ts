import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import OpenAI from 'openai';

console.log("🚀 [BOOT] Arrancando servidor con IA...");
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
const openaiApiKey = process.env.OPENAI_API_KEY;

const TABLE_TEMPLATES = 'Templates';

// --- CONFIGURACIÓN ---
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    Airtable.configure({ apiKey: airtableApiKey });
    base = Airtable.base(airtableBaseId);
    console.log("✅ Airtable configurado");
  } catch (e) { console.error("Error Airtable:", e); }
}

let openai: OpenAI | null = null;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log("🧠 OpenAI Conectado");
} else {
    console.warn("⚠️ Falta OPENAI_API_KEY. El bot no funcionará.");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

// ==========================================
//  HERRAMIENTAS DE LA IA (TOOLS)
// ==========================================

async function getAvailableAppointments() {
    if (!base) return "Error de base de datos";
    const records = await base('Appointments').select({
        filterByFormula: "{Status} = 'Available'",
        sort: [{ field: "Date", direction: "asc" }],
        maxRecords: 5
    }).all();
    
    if (records.length === 0) return "No hay citas disponibles próximamente.";
    
    return records.map(r => {
        const date = new Date(r.get('Date') as string);
        const humanDate = date.toLocaleString('es-ES', { 
            weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
        });
        return `ID_CITA: ${r.id} -> FECHA: ${humanDate}`;
    }).join("\n");
}

async function bookAppointment(appointmentId: string, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";
    try {
        await base('Appointments').update([
            { 
                id: appointmentId, 
                fields: { 
                    "Status": "Booked", 
                    "ClientPhone": clientPhone,
                    "ClientName": clientName
                } 
            }
        ]);
        return "Cita reservada con éxito.";
    } catch (e) { return "Error al reservar. Puede que el ID sea incorrecto o ya no esté disponible."; }
}

async function assignDepartment(clientPhone: string, department: string) {
    if (!base) return "Error BD";
    try {
        const clean = cleanNumber(clientPhone);
        const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage();
        if (contacts.length > 0) {
            await base('Contacts').update([{ id: contacts[0].id, fields: { "department": department, "status": "Abierto" } }]);
            io.emit('contact_updated_notification');
            return `Cliente asignado correctamente a ${department}.`;
        }
        return "No encontré el contacto para asignar.";
    } catch (e) { return "Error al asignar departamento."; }
}

// ==========================================
//  PROCESADOR INTELIGENTE (CEREBRO)
// ==========================================

async function processAI(text: string, contactPhone: string, contactName: string) {
    if (!openai || !waToken || !waPhoneId) return;

    console.log(`🤖 IA Pensando para ${contactPhone}...`);

    try {
        const runner = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `Eres 'Auto-Bot', el asistente del taller Chatgorithm.
                Tu tono es profesional pero cercano. Eres eficiente.

                TUS OBJETIVOS:
                1. GESTIONAR CITAS: Si el cliente quiere cita, usa 'get_available_appointments'. Múestrale las opciones. Si elige una, usa 'book_appointment' con el ID correspondiente.
                2. CLASIFICAR: Si el cliente tiene dudas de precios o ventas, usa 'assign_department' con 'Ventas'. Si es avería técnica, 'Taller'.
                3. ATENCIÓN: Si no sabes qué hacer, pide más detalles amablemente.

                REGLAS:
                - Respuestas cortas (máx 2 frases si es posible).
                - NO inventes horas. Usa solo las que te da la herramienta.
                - Si reservas cita, confirma la hora exacta al cliente.
                ` },
                { role: "user", content: `Cliente (${contactName}): ${text}` }
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "get_available_appointments",
                        description: "Consultar horas disponibles para citas."
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "book_appointment",
                        description: "Reservar una cita cuando el cliente elige una hora.",
                        parameters: {
                            type: "object",
                            properties: {
                                appointmentId: { type: "string", description: "El ID_CITA que eligió el cliente" }
                            },
                            required: ["appointmentId"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "assign_department",
                        description: "Asignar cliente a un departamento (Ventas, Taller, Admin).",
                        parameters: {
                            type: "object",
                            properties: {
                                department: { type: "string", enum: ["Ventas", "Taller", "Admin"] }
                            },
                            required: ["department"]
                        }
                    }
                }
            ],
            tool_choice: "auto"
        });

        const msg = runner.choices[0].message;

        // Si la IA decide usar una herramienta
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCall = msg.tool_calls[0];
            // @ts-ignore - Bypass para el error de tipado de OpenAI
            const fnName = toolCall.function.name;
            // @ts-ignore
            const args = JSON.parse(toolCall.function.arguments);
            let toolResult = "";

            if (fnName === "get_available_appointments") {
                toolResult = await getAvailableAppointments();
            } else if (fnName === "book_appointment") {
                toolResult = await bookAppointment(args.appointmentId, contactPhone, contactName);
            } else if (fnName === "assign_department") {
                toolResult = await assignDepartment(contactPhone, args.department);
            }

            // Segunda vuelta: La IA genera la respuesta final
            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Genera respuesta final al cliente basada en la acción realizada." },
                    { role: "user", content: text },
                    msg,
                    { role: "tool", tool_call_id: toolCall.id, content: toolResult }
                ]
            });
            const finalReply = secondResponse.choices[0].message.content;
            if (finalReply) await sendWhatsAppText(contactPhone, finalReply);

        } else if (msg.content) {
            // Respuesta normal sin herramientas
            await sendWhatsAppText(contactPhone, msg.content);
        }

    } catch (error) {
        console.error("❌ Error OpenAI:", error);
    }
}

async function sendWhatsAppText(to: string, body: string) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanNumber(to), type: "text", text: { body } },
            { headers: { Authorization: `Bearer ${waToken}` } }
        );
        await saveAndEmitMessage({ 
            text: body, sender: "Bot IA", recipient: cleanNumber(to), 
            timestamp: new Date().toISOString(), type: "text" 
        });
        await handleContactUpdate(to, `🤖 Bot: ${body}`);
    } catch (e) { console.error("Error enviando WA:", e); }
}

// ==========================================
//  WEBHOOKS (CON IA)
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
        const profileName = value.contacts?.[0]?.profile?.name || "Cliente";
        const from = msgData.from; 
        
        let text = "(Media)";
        if (msgData.type === 'text') text = msgData.text.body;

        console.log(`📩 Mensaje de ${from}: ${text}`);

        // 1. Guardar mensaje y obtener datos del contacto
        const contactRecord = await handleContactUpdate(from, text, profileName);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type: 'text' });

        // 2. TRIGGER AUTOMÁTICO IA
        if (contactRecord && msgData.type === 'text') {
             const status = contactRecord.get('status');
             const assigned = contactRecord.get('assigned_to');
             // Solo si es nuevo y no tiene agente
             if (status === 'Nuevo' && !assigned) {
                 processAI(text, from, profileName);
             }
        }
    }
    
    // Status updates de plantillas
    if (body.object && body.entry?.[0]?.changes?.[0]?.field === 'message_template_status_update') {
        const event = body.entry[0].changes[0].value;
        const metaId = event.message_template_id;
        const newStatus = event.event; 
        if (base) {
            try {
                const records = await base(TABLE_TEMPLATES).select({ filterByFormula: `{MetaId} = '${metaId}'` }).firstPage();
                if (records.length > 0) await base(TABLE_TEMPLATES).update([{ id: records[0].id, fields: { "Status": newStatus } }]);
            } catch(e) { console.error("Error status plantilla:", e); }
        }
    }

    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

// ==========================================
//  RESTO DE RUTAS (PLANTILLAS, ANALYTICS, ETC)
// ==========================================

// ANALÍTICAS
app.get('/api/analytics', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    try {
        const contacts = await base('Contacts').select().all();
        const messages = await base('Messages').select().all();
        
        const totalContacts = contacts.length;
        const totalMessages = messages.length;
        const newLeads = contacts.filter(c => c.get('status') === 'Nuevo').length;
        
        const last7Days = [...Array(7)].map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0];
        }).reverse();

        const activityData = last7Days.map(date => {
            const count = messages.filter(m => {
                const mDate = (m.get('timestamp') as string || "").split('T')[0];
                return mDate === date;
            }).length;
            const label = new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            return { date, label, count };
        });

        const agentStats: Record<string, { msgs: number, uniqueChats: Set<string> }> = {};
        messages.forEach(m => {
            const sender = (m.get('sender') as string) || "";
            const recipient = (m.get('recipient') as string) || "";
            const isPhone = /^\d+$/.test(sender.replace(/\D/g, '')); 
            if (!isPhone && sender.toLowerCase() !== 'sistema' && sender.trim() !== '') {
                if (!agentStats[sender]) agentStats[sender] = { msgs: 0, uniqueChats: new Set() };
                agentStats[sender].msgs += 1;
                if (recipient) agentStats[sender].uniqueChats.add(recipient);
            }
        });

        const agentPerformance = Object.entries(agentStats)
            .map(([name, data]) => ({ name, msgCount: data.msgs, chatCount: data.uniqueChats.size }))
            .sort((a, b) => b.msgCount - a.msgCount).slice(0, 5);

        const statusMap: Record<string, number> = {};
        contacts.forEach(c => {
            const s = (c.get('status') as string) || 'Otros';
            statusMap[s] = (statusMap[s] || 0) + 1;
        });
        const statusDistribution = Object.entries(statusMap).map(([name, count]) => ({ name, count }));

        res.json({ kpis: { totalContacts, totalMessages, newLeads }, activity: activityData, agents: agentPerformance, statuses: statusDistribution });
    } catch (error: any) { console.error("Error analíticas:", error); res.status(500).json({ error: "Error interno" }); }
});

// PLANTILLAS
app.get('/api/templates', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
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
            variableMapping: record.get('VariableMapping') ? JSON.parse(record.get('VariableMapping') as string) : {}
        }));
        res.json(formatted);
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.post('/api/create-template', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const { name, category, body, language, footer, variableExamples } = req.body;
        let metaId = "meta_simulado_" + Date.now();
        let status = "PENDING";

        if (waToken && waBusinessId) {
            try {
                const metaPayload: any = { name, category, allow_category_change: true, language, components: [{ type: "BODY", text: body }] };
                if (footer) metaPayload.components.push({ type: "FOOTER", text: footer });
                const metaRes = await axios.post(`https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`, metaPayload, { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } });
                metaId = metaRes.data.id; status = metaRes.data.status || "PENDING";
            } catch (metaError: any) { status = "REJECTED"; }
        }
        const createdRecords = await base(TABLE_TEMPLATES).create([{ fields: { "Name": name, "Category": category, "Language": language, "Body": body, "Footer": footer, "Status": status, "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {}) } }]);
        res.json({ success: true, template: { id: createdRecords[0].id, name, category, language, body, footer, status, variableMapping: variableExamples } });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
});

app.delete('/api/delete-template/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try { await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "Error" }); }
});

// ENVÍO DE PLANTILLAS (CON SENDER NAME)
app.post('/api/send-template', async (req, res) => {
    if (!waToken || !waPhoneId) return res.status(500).json({ error: "Credenciales" });
    try {
        const { templateName, language, phone, variables, previewText, senderName } = req.body;
        const parameters = variables.map((val: string) => ({ type: "text", text: val }));
        
        await axios.post(
            `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanNumber(phone), type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: parameters }] } },
            { headers: { Authorization: `Bearer ${waToken}` } }
        );

        const finalMessage = previewText || `📝 [Plantilla] ${templateName}`;
        await saveAndEmitMessage({ 
            text: finalMessage, 
            sender: senderName || "Agente", // <--- NOMBRE REAL
            recipient: cleanNumber(phone), 
            timestamp: new Date().toISOString(), 
            type: "template" 
        });
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: "Error envío" }); }
});

// MEDIA & UPLOAD
app.get('/api/media/:id', async (req, res) => {
    if (!waToken) return res.sendStatus(500);
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${req.params.id}`, { headers: { 'Authorization': `Bearer ${waToken}` } });
        const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' });
        res.setHeader('Content-Type', mediaRes.headers['content-type']);
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file; const { targetPhone, senderName } = req.body;
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });
    const formData = new FormData(); formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype }); formData.append('messaging_product', 'whatsapp');
    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() } });
    const mediaId = uploadRes.data.id;
    let msgType = 'document'; if (file.mimetype.startsWith('image')) msgType = 'image'; else if (file.mimetype.startsWith('audio')) msgType = 'audio';
    const payload: any = { messaging_product: "whatsapp", to: cleanNumber(targetPhone), type: msgType };
    payload[msgType] = { id: mediaId, ...(msgType === 'document' && { filename: file.originalname }) };
    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${waToken}` } });
    await saveAndEmitMessage({ text: file.originalname, sender: senderName || "Agente", recipient: cleanNumber(targetPhone), timestamp: new Date().toISOString(), type: msgType, mediaId });
    await handleContactUpdate(targetPhone, `Tú (${senderName}): 📎 Archivo`);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error subiendo" }); }
});

// --- HELPERS ---
async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return null;
  const clean = cleanNumber(phone); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage();
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]);
      return contacts[0];
    } else {
      const newContact = await base('Contacts').create([{ fields: { "phone": clean, "name": profileName || clean, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString() } }]);
      io.emit('contact_updated_notification');
      return newContact[0];
    }
  } catch (e) { console.error("Error Contactos:", e); return null; }
}

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "recipient": msg.recipient, "timestamp": msg.timestamp, "type": msg.type, "media_id": msg.mediaId || "" } }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

// ==========================================
//  SOCKET.IO LOGIC
// ==========================================

io.on('connection', (socket) => {
  // CONFIG & CRUD
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); const r = await base('Config').select().all(); io.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('delete_config', async (id) => { if (base) { await base('Config').destroy([id]); const r = await base('Config').select().all(); io.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); const r = await base('Config').select().all(); io.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });

  // Quick Replies
  socket.on('request_quick_replies', async () => { if (base) { const r = await base('QuickReplies').select().all(); socket.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('add_quick_reply', async (d) => { if (base) { await base('QuickReplies').create([{ fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('delete_quick_reply', async (id) => { if (base) { await base('QuickReplies').destroy([id]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('update_quick_reply', async (d) => { if (base) { await base('QuickReplies').update([{ id: d.id, fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });

  // AGENTES & LOGIN
  socket.on('request_agents', async () => { if (base) { const r = await base('Agents').select().all(); socket.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); } });
  socket.on('login_attempt', async (data) => { if(!base) return; const r = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage(); if (r.length > 0) { const pwd = r[0].get('password'); if (!pwd || String(pwd).trim() === "") socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role') }); else if (String(pwd) === String(data.password)) socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role') }); else socket.emit('login_error', 'Contraseña incorrecta'); } else socket.emit('login_error', 'Usuario no encontrado'); });
  socket.on('create_agent', async (d) => { if (!base) return; await base('Agents').create([{ fields: { "name": d.newAgent.name, "role": d.newAgent.role, "password": d.newAgent.password || "" } }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Creado'); });
  socket.on('delete_agent', async (d) => { if (!base) return; await base('Agents').destroy([d.agentId]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Eliminado'); });
  socket.on('update_agent', async (d) => { if (!base) return; const f: any = { "name": d.updates.name, "role": d.updates.role }; if (d.updates.password !== undefined) f["password"] = d.updates.password; await base('Agents').update([{ id: d.agentId, fields: f }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Actualizado'); });

  // CONTACTS & CHAT
  socket.on('request_contacts', async () => { if (base) { const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all(); socket.emit('contacts_update', r.map(x => ({ id: x.id, phone: x.get('phone'), name: x.get('name'), status: x.get('status'), department: x.get('department'), assigned_to: x.get('assigned_to'), last_message: x.get('last_message'), last_message_time: x.get('last_message_time'), avatar: (x.get('avatar') as any[])?.[0]?.url, tags: x.get('tags') || [] }))); } });
  socket.on('request_conversation', async (p) => { if (base) { const c = cleanNumber(p); const r = await base('Messages').select({ filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all(); socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') }))); } });
  socket.on('update_contact_info', async (data) => { if(base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });

  socket.on('chatMessage', async (msg) => { const targetPhone = cleanNumber(msg.targetPhone || process.env.TEST_TARGET_PHONE); if (waToken && waPhoneId) { try { if (msg.type !== 'note') { await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${waToken}` } }); } else { console.log("📝 Nota"); } await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: targetPhone, timestamp: new Date().toISOString(), type: msg.type || 'text' }); const previewText = msg.type === 'note' ? `📝 Nota: ${msg.text}` : `Tú (${msg.sender}): ${msg.text}`; await handleContactUpdate(targetPhone, previewText); } catch (error: any) { console.error("Error envío:", error.message); } } });

  // MANUAL AI TRIGGER
  socket.on('trigger_ai_manual', async (data) => {
    const { phone } = data;
    console.log(`🤖 Trigger Manual IA para ${phone}`);
    let name = "Cliente";
    if (base) {
        const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanNumber(phone)}'` }).firstPage();
        if (records.length > 0) name = (records[0].get('name') as string) || "Cliente";
        
        const msgs = await base('Messages').select({ 
            filterByFormula: `{sender} = '${cleanNumber(phone)}'`, 
            sort: [{field: "timestamp", direction: "desc"}],
            maxRecords: 1
        }).firstPage();
        
        if (msgs.length > 0) processAI(msgs[0].get('text') as string, phone, name);
        else processAI("Hola", phone, name);
    }
  });

  socket.on('register_presence', (u: string) => { if (u) { onlineUsers.set(socket.id, u); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { onlineUsers.delete(socket.id); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('typing', (d) => { socket.broadcast.emit('remote_typing', d); });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo en puerto ${PORT}`); });