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

console.log("🚀 [BOOT] Arrancando servidor con IA Robusta (JSON + Catch)...");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// RUTA "PING"
app.get('/', (req, res) => {
  res.send('🤖 Servidor Chatgorithm (Laura JSON) funcionando correctamente 🚀');
});

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
    base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
    console.log("✅ Conexión Airtable inicializada");
  } catch (e) { console.error("Error crítico configurando Airtable:", e); }
}

let openai: OpenAI | null = null;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log("🧠 OpenAI Conectado");
} else {
    console.warn("⚠️ Falta OPENAI_API_KEY.");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const activeAiChats = new Set<string>();

const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

// --- PROMPT POR DEFECTO ---
const DEFAULT_SYSTEM_PROMPT = `Eres 'Laura', la asistente del taller Chatgorithm.
TU OBJETIVO: Gestionar citas y clasificar clientes de forma natural.
REGLAS:
1. Usa 'get_available_appointments' para ver los huecos. Recibirás un JSON.
2. Muestra las opciones al cliente de forma clara y humana (ej: "Tengo libre el martes a las 10").
3. Para reservar, COPIA EL CAMPO "id" DEL JSON EXACTAMENTE. No lo resumas.
4. Si la reserva falla, inténtalo de nuevo o pide perdón.
5. Tono profesional, amable, SIN EMOJIS.`;

async function getSystemPrompt() {
    if (!base) return DEFAULT_SYSTEM_PROMPT;
    try {
        const records = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage();
        return records.length > 0 ? (records[0].get('Value') as string) : DEFAULT_SYSTEM_PROMPT;
    } catch (e) { return DEFAULT_SYSTEM_PROMPT; }
}

// ==========================================
//  HERRAMIENTAS DE LA IA (TOOLS)
// ==========================================

async function getAvailableAppointments() {
    if (!base) return "Error: Base de datos no conectada";
    try {
        console.log("🔍 IA solicitando agenda (JSON)...");
        const records = await base('Appointments').select({
            filterByFormula: "{Status} = 'Available'",
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 60
        }).all();
        
        const now = new Date();
        const validRecords = records.filter(r => new Date(r.get('Date') as string) > now).slice(0, 15);

        if (validRecords.length === 0) return "No hay citas disponibles. Pide al cliente otra fecha.";
        
        // FORMATO JSON PARA PRECISIÓN MÁXIMA
        const jsonList = validRecords.map(r => {
            const date = new Date(r.get('Date') as string);
            const humanDate = date.toLocaleString('es-ES', { 
                timeZone: 'Europe/Madrid',
                weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });
            return { id: r.id, fecha: humanDate };
        });

        return JSON.stringify(jsonList);

    } catch (error: any) {
        console.error("Error leyendo citas:", error);
        return "Error técnico al leer la agenda.";
    }
}

async function bookAppointment(appointmentId: string, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";
    
    // LIMPIEZA Y VALIDACIÓN
    let cleanId = appointmentId.trim().replace(/['"]/g, '');
    if (cleanId.toUpperCase().startsWith("ID:")) cleanId = cleanId.substring(3).trim();
    
    console.log(`📅 RESERVA INTENTO | ID: "${cleanId}" | Cliente: ${clientName}`);
    
    // Si el ID es sospechosamente corto (ej: "rec4"), rechazamos antes de llamar a Airtable
    if (cleanId.length < 10) {
        return `❌ Error: El ID '${cleanId}' es inválido o incompleto. Debes usar el ID completo que empieza por 'rec' que aparece en el JSON de disponibilidad.`;
    }
    
    try {
        const record = await base('Appointments').find(cleanId);
        if (!record) return "❌ Error: ID no encontrado. Verifica la lista.";
        if (record.get('Status') !== 'Available') return "❌ Esa hora ya no está libre. Pide elegir otra.";

        const dateVal = new Date(record.get('Date') as string);
        const humanDate = dateVal.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

        await base('Appointments').update([{ 
            id: cleanId, 
            fields: { "Status": "Booked", "ClientPhone": clientPhone, "ClientName": clientName } 
        }]);
        
        activeAiChats.delete(cleanNumber(clientPhone));
        io.emit('ai_active_change', { phone: cleanNumber(clientPhone), active: false });
        
        return `✅ RESERVA ÉXITO para el ${humanDate}. CONFIRMA AL CLIENTE Y DESPÍDETE.`;
    } catch (e: any) { 
        console.error("Error reservando:", e);
        if (e.error === 'NOT_FOUND') return "❌ Error: ID no encontrado en la base de datos.";
        return "❌ Error técnico al guardar."; 
    }
}

async function assignDepartment(clientPhone: string, department: string) {
    if (!base) return "Error BD";
    try {
        const clean = cleanNumber(clientPhone);
        const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage();
        if (contacts.length > 0) {
            await base('Contacts').update([{ id: contacts[0].id, fields: { "department": department, "status": "Abierto" } }]);
            io.emit('contact_updated_notification');
            activeAiChats.delete(clean);
            io.emit('ai_active_change', { phone: clean, active: false });
            return `Asignado a ${department}.`;
        }
        return "Contacto no encontrado.";
    } catch (e) { return "Error asignando."; }
}

async function stopConversation(phone: string) {
    activeAiChats.delete(cleanNumber(phone));
    io.emit('ai_active_change', { phone: cleanNumber(phone), active: false });
    return "Fin de conversación.";
}

async function getChatHistory(phone: string, limit = 10) {
    if (!base) return [];
    try {
        const records = await base('Messages').select({
            filterByFormula: `OR({sender} = '${cleanNumber(phone)}', {recipient} = '${cleanNumber(phone)}')`,
            sort: [{ field: "timestamp", direction: "desc" }],
            maxRecords: limit
        }).all();

        return [...records].reverse().map((r: any) => {
            const sender = r.get('sender') as string;
            const isBot = sender === 'Bot IA' || sender === 'Agente' || /[a-zA-Z]/.test(sender);
            return {
                role: isBot ? "assistant" : "user",
                content: r.get('text') as string || ""
            } as any; 
        });
    } catch (e) { return []; }
}

// ==========================================
//  CEREBRO DE LA IA
// ==========================================

async function processAI(text: string, contactPhone: string, contactName: string) {
    if (!openai || !waToken || !waPhoneId) return;
    
    activeAiChats.add(cleanNumber(contactPhone));
    io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'thinking' });
    io.emit('ai_active_change', { phone: cleanNumber(contactPhone), active: true });

    try {
        const history = await getChatHistory(contactPhone);
        const systemPrompt = await getSystemPrompt();
        
        const now = new Date().toLocaleString('es-ES', { 
            timeZone: 'Europe/Madrid', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        });

        const messages = [
            { role: "system", content: `${systemPrompt}\n\n[SISTEMA: Hoy es ${now}. Para ver citas usa 'get_available_appointments'. Recibirás un JSON con IDs y Fechas. Para reservar, debes usar el ID exacto del JSON (ej: rec...).]` },
            ...history, 
            { role: "user", content: text } 
        ];

        const runner = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages as any,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "get_available_appointments",
                        description: "Obtener JSON con las citas disponibles (id y fecha)."
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "book_appointment",
                        description: "Reservar cita. REQUIERE el ID completo (rec...).",
                        parameters: {
                            type: "object",
                            properties: {
                                appointmentId: { type: "string", description: "El ID exacto de la cita (rec...)" }
                            },
                            required: ["appointmentId"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "assign_department",
                        description: "Derivar a humano.",
                        parameters: {
                            type: "object",
                            properties: { department: { type: "string", enum: ["Ventas", "Taller", "Admin"] } },
                            required: ["department"]
                        }
                    }
                },
                { type: "function", function: { name: "stop_conversation", description: "Detener bot." } }
            ],
            tool_choice: "auto"
        });

        const msg = runner.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCall = msg.tool_calls[0];
            // @ts-ignore
            const fnName = toolCall.function.name;
            // @ts-ignore
            const args = JSON.parse(toolCall.function.arguments);
            let toolResult = "";

            console.log(`⚙️ IA Tool: ${fnName}`, args);

            if (fnName === "get_available_appointments") {
                toolResult = await getAvailableAppointments();
            } else if (fnName === "book_appointment") {
                toolResult = await bookAppointment(args.appointmentId, contactPhone, contactName);
            } else if (fnName === "assign_department") {
                toolResult = await assignDepartment(contactPhone, args.department);
            } else if (fnName === "stop_conversation") {
                toolResult = await stopConversation(contactPhone);
            }

            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    ...messages,
                    msg,
                    { role: "tool", tool_call_id: toolCall.id, content: toolResult }
                ] as any
            });
            
            const finalReply = secondResponse.choices[0].message.content;
            if (finalReply) await sendWhatsAppText(contactPhone, finalReply);

        } else if (msg.content) {
            await sendWhatsAppText(contactPhone, msg.content);
        }

    } catch (error) { console.error("❌ Error OpenAI:", error); } finally { io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'idle' }); }
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
        await handleContactUpdate(to, `🤖 Laura: ${body}`);
    } catch (e) { console.error("Error enviando WA:", e); }
}

// ==========================================
//  WEBHOOKS
// ==========================================
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from; 
        const cleanFrom = cleanNumber(from);
        
        let text = "(Media)";
        if (msg.type === 'text') text = msg.text.body;

        console.log(`📩 Mensaje de ${from}: ${text}`);

        const contactRecord = await handleContactUpdate(from, text, body.entry[0].changes[0].value.contacts?.[0]?.profile?.name);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type: 'text' });

        if (activeAiChats.has(cleanFrom) && msg.type === 'text') {
             processAI(text, from, contactRecord?.get('name') as string || "Cliente");
        } else if (contactRecord && msg.type === 'text') {
             const status = contactRecord.get('status');
             const assigned = contactRecord.get('assigned_to');
             if (status === 'Nuevo' && !assigned) {
                 processAI(text, from, contactRecord.get('name') as string || "Cliente");
             }
        }
    }
    
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
//  RUTAS API
// ==========================================

app.get('/api/appointments', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const records = await base('Appointments').select({ sort: [{ field: "Date", direction: "asc" }] }).all();
        res.json(records.map(r => ({ id: r.id, date: r.get('Date'), status: r.get('Status'), clientPhone: r.get('ClientPhone'), clientName: r.get('ClientName') })));
    } catch(e) { res.status(500).json({error:"Error fetching appointments"}); }
});

app.post('/api/appointments', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const { date, status, clientPhone, clientName } = req.body;
        const created = await base('Appointments').create([{
            fields: { "Date": date, "Status": status || 'Available', "ClientPhone": clientPhone, "ClientName": clientName }
        }]);
        res.json({ success: true, appointment: { id: created[0].id, ...created[0].fields } });
    } catch(e) { res.status(400).json({error: "Error creating"}); }
});

app.post('/api/appointments/generate', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const { days, startTime, endTime, duration } = req.body;
        const newSlots = [];
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + 30); 

        for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (days.includes(d.getDay())) {
                const start = new Date(d);
                const [startH, startM] = startTime.split(':').map(Number);
                start.setHours(startH, startM, 0, 0);
                const end = new Date(d);
                const [endH, endM] = endTime.split(':').map(Number);
                end.setHours(endH, endM, 0, 0);

                while (start < end) {
                    newSlots.push({ fields: { "Date": start.toISOString(), "Status": "Available" } });
                    start.setMinutes(start.getMinutes() + duration);
                }
            }
        }
        
        while (newSlots.length > 0) {
            const batch = newSlots.splice(0, 10);
            await base('Appointments').create(batch);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        res.json({ success: true });
    } catch(e: any) { res.status(400).json({error: "Error", details: e.message}); }
});

app.put('/api/appointments/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const { date, status, clientPhone, clientName } = req.body;
        const fields: any = {};
        if (date) fields["Date"] = date;
        if (status) fields["Status"] = status;
        if (clientPhone !== undefined) fields["ClientPhone"] = clientPhone;
        if (clientName !== undefined) fields["ClientName"] = clientName;
        await base('Appointments').update([{ id: req.params.id, fields }]);
        res.json({ success: true });
    } catch(e) { res.status(400).json({error: "Error updating"}); }
});

app.delete('/api/appointments/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try { await base('Appointments').destroy([req.params.id]); res.json({ success: true }); } catch(e) { res.status(400).json({error: "Error deleting"}); }
});

app.get('/api/templates', async (req, res) => { if (!base) return res.status(500).json({}); const r = await base(TABLE_TEMPLATES).select().all(); res.json(r.map(x => ({ id: x.id, name: x.get('Name'), status: x.get('Status'), body: x.get('Body'), variableMapping: x.get('VariableMapping') ? JSON.parse(x.get('VariableMapping') as string) : {} }))); });
app.post('/api/create-template', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { const { name, category, body, language, footer, variableExamples } = req.body; let metaId = "meta_simulado_" + Date.now(); let status = "PENDING"; if (waToken && waBusinessId) { try { const metaPayload: any = { name, category, allow_category_change: true, language, components: [{ type: "BODY", text: body }] }; if (footer) metaPayload.components.push({ type: "FOOTER", text: footer }); const metaRes = await axios.post(`https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`, metaPayload, { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } }); metaId = metaRes.data.id; status = metaRes.data.status || "PENDING"; } catch (metaError: any) { status = "REJECTED"; } } const createdRecords = await base(TABLE_TEMPLATES).create([{ fields: { "Name": name, "Category": category, "Language": language, "Body": body, "Footer": footer, "Status": status, "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {}) } }]); res.json({ success: true, template: { id: createdRecords[0].id, name, category, language, body, footer, status, variableMapping: variableExamples } }); } catch (error: any) { res.status(400).json({ success: false, error: error.message }); } });
app.delete('/api/delete-template/:id', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "Error" }); } });
app.post('/api/send-template', async (req, res) => { if (!waToken || !waPhoneId) return res.status(500).json({ error: "Credenciales" }); try { const { templateName, language, phone, variables, previewText, senderName } = req.body; const parameters = variables.map((val: string) => ({ type: "text", text: val })); await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: cleanNumber(phone), type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: parameters }] } }, { headers: { Authorization: `Bearer ${waToken}` } }); const finalMessage = previewText || `📝 [Plantilla] ${templateName}`; await saveAndEmitMessage({ text: finalMessage, sender: senderName || "Agente", recipient: cleanNumber(phone), timestamp: new Date().toISOString(), type: "template" }); res.json({ success: true }); } catch (error: any) { res.status(400).json({ error: "Error envío" }); } });
app.get('/api/analytics', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { const contacts = await base('Contacts').select().all(); const messages = await base('Messages').select().all(); const totalContacts = contacts.length; const totalMessages = messages.length; const newLeads = contacts.filter(c => c.get('status') === 'Nuevo').length; const last7Days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse(); const activityData = last7Days.map(date => { const count = messages.filter(m => { const mDate = (m.get('timestamp') as string || "").split('T')[0]; return mDate === date; }).length; return { date, label: new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count }; }); const agentStats: Record<string, { msgs: number, uniqueChats: Set<string> }> = {}; messages.forEach(m => { const sender = (m.get('sender') as string) || ""; const recipient = (m.get('recipient') as string) || ""; const isPhone = /^\d+$/.test(sender.replace(/\D/g, '')); if (!isPhone && sender.toLowerCase() !== 'sistema' && sender.trim() !== '') { if (!agentStats[sender]) agentStats[sender] = { msgs: 0, uniqueChats: new Set() }; agentStats[sender].msgs += 1; if (recipient) agentStats[sender].uniqueChats.add(recipient); } }); const agentPerformance = Object.entries(agentStats).map(([name, data]) => ({ name, msgCount: data.msgs, chatCount: data.uniqueChats.size })).sort((a, b) => b.msgCount - a.msgCount).slice(0, 5); const statusMap: Record<string, number> = {}; contacts.forEach(c => { const s = (c.get('status') as string) || 'Otros'; statusMap[s] = (statusMap[s] || 0) + 1; }); const statusDistribution = Object.entries(statusMap).map(([name, count]) => ({ name, count })); res.json({ kpis: { totalContacts, totalMessages, newLeads }, activity: activityData, agents: agentPerformance, statuses: statusDistribution }); } catch (e) { res.status(500).json({ error: "Error" }); } });
app.get('/api/media/:id', async (req, res) => { if (!waToken) return res.sendStatus(500); try { const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${req.params.id}`, { headers: { 'Authorization': `Bearer ${waToken}` } }); const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' }); res.setHeader('Content-Type', mediaRes.headers['content-type']); mediaRes.data.pipe(res); } catch (e) { res.sendStatus(404); } });
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => { try { const file = req.file; const { targetPhone, senderName } = req.body; if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" }); const formData = new FormData(); formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype }); formData.append('messaging_product', 'whatsapp'); const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() } }); const mediaId = uploadRes.data.id; let msgType = 'document'; if (file.mimetype.startsWith('image')) msgType = 'image'; else if (file.mimetype.startsWith('audio')) msgType = 'audio'; const payload: any = { messaging_product: "whatsapp", to: cleanNumber(targetPhone), type: msgType }; payload[msgType] = { id: mediaId, ...(msgType === 'document' && { filename: file.originalname }) }; await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${waToken}` } }); let textLog = file.originalname; let saveType = 'document'; if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; } else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; } else if (file.mimetype.includes('audio')) { textLog = "🎤 [Audio WebM]"; saveType = 'audio'; } await saveAndEmitMessage({ text: textLog, sender: senderName || "Agente", recipient: cleanNumber(targetPhone), timestamp: new Date().toISOString(), type: saveType, mediaId }); await handleContactUpdate(targetPhone, `Tú (${senderName}): 📎 Archivo`); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "Error subiendo archivo" }); } });
app.get('/api/bot-config', async (req, res) => { if (!base) return res.status(500).json({}); try { const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); res.json({ prompt: r.length > 0 ? r[0].get('Value') : DEFAULT_SYSTEM_PROMPT }); } catch(e) { res.status(500).json({error:"Error"}); } });
app.post('/api/bot-config', async (req, res) => { if (!base) return res.status(500).json({}); try { const { prompt } = req.body; const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); if (r.length > 0) await base('BotSettings').update([{ id: r[0].id, fields: { "Value": prompt } }]); else await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": prompt } }]); res.json({ success: true }); } catch(e) { res.status(500).json({error: "Error"}); } });

// --- HELPERS & SOCKETS ---
async function handleContactUpdate(phone: string, text: string, profileName?: string) { if (!base) return null; const clean = cleanNumber(phone); try { const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage(); if (contacts.length > 0) { await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]); return contacts[0]; } else { const newContact = await base('Contacts').create([{ fields: { "phone": clean, "name": profileName || clean, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString() } }]); io.emit('contact_updated_notification'); return newContact[0]; } } catch (e) { console.error("Error Contactos:", e); return null; } }
async function saveAndEmitMessage(msg: any) { io.emit('message', msg); if (base) { try { await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "recipient": msg.recipient, "timestamp": msg.timestamp, "type": msg.type, "media_id": msg.mediaId || "" } }], { typecast: true }); } catch (e) { console.error("Error guardando:", e); } } }

// --- SOCKETS ---
io.on('connection', (socket) => {
  // ... (Tus sockets anteriores) ...
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('Name'), type: x.get('Type') }))); } });
  
  // PROTECCIÓN TRY-CATCH EN SOCKETS
  socket.on('trigger_ai_manual', async (data) => {
    try {
        const { phone } = data;
        console.log(`🤖 Trigger Manual IA para ${phone}`);
        let name = "Cliente";
        if (base) {
            activeAiChats.add(cleanNumber(phone));
            io.emit('ai_active_change', { phone: cleanNumber(phone), active: true });
            
            const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanNumber(phone)}'` }).firstPage();
            if (records.length > 0) name = (records[0].get('name') as string) || "Cliente";
            
            const msgs = await base('Messages').select({ 
                filterByFormula: `OR({sender}='${cleanNumber(phone)}',{recipient}='${cleanNumber(phone)}')`, 
                sort: [{field: "timestamp", direction: "desc"}],
                maxRecords: 1
            }).firstPage();
            
            const text = msgs.length > 0 ? (msgs[0].get('text') as string) : "Hola";
            processAI(text, phone, name);
        }
    } catch(e) { console.error("Error Trigger IA:", e); }
  });
  
  // ... resto sockets ...
  socket.on('stop_ai_manual', (d) => { activeAiChats.delete(cleanNumber(d.phone)); io.emit('ai_active_change', { phone: cleanNumber(d.phone), active: false }); });
  socket.on('register_presence', (u: string) => { if (u) { onlineUsers.set(socket.id, u); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { onlineUsers.delete(socket.id); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('typing', (d) => { socket.broadcast.emit('remote_typing', d); });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo ${PORT}`); });