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

console.log("🚀 [BOOT] Arrancando servidor MAESTRO (Full + Contactos + Multi-Cuenta)...");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// RUTA PING
app.get('/', (req, res) => {
  res.send('🤖 Servidor Chatgorithm Online 🚀');
});

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// --- VARIABLES ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const waBusinessId = process.env.WHATSAPP_BUSINESS_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

const TABLE_TEMPLATES = 'Templates';

// --- CONFIGURACIÓN MULTI-CUENTA ---
const BUSINESS_ACCOUNTS: Record<string, string> = {
    [waPhoneId || 'default']: waToken || '',
    // Añade aquí otros números: 'PHONE_ID': 'TOKEN'
};

const getToken = (phoneId: string) => BUSINESS_ACCOUNTS[phoneId] || waToken;

// --- CONEXIÓN AIRTABLE ---
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

// --- PROMPT DEFAULT ---
const DEFAULT_SYSTEM_PROMPT = `Eres 'Laura', la asistente del taller Chatgorithm.
OBJETIVO: Gestionar citas y clasificar clientes.
REGLAS:
1. Usa 'get_available_appointments' para ver huecos.
2. Para reservar, usa 'book_appointment' con el ID exacto.
3. Tono profesional y amable.`;

async function getSystemPrompt() {
    if (!base) return DEFAULT_SYSTEM_PROMPT;
    try {
        const records = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage();
        return records.length > 0 ? (records[0].get('Value') as string) : DEFAULT_SYSTEM_PROMPT;
    } catch (e) { return DEFAULT_SYSTEM_PROMPT; }
}

// ==========================================
//  NUEVAS RUTAS: GESTIÓN DE CONTACTOS
// ==========================================

// 1. Crear Contacto Manual
app.post('/api/contacts', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB no conectada" });
    try {
        const { phone, name, originPhoneId, email } = req.body;
        const cleanP = cleanNumber(phone);
        const originId = originPhoneId || waPhoneId || "default";

        // Verificamos si ya existe en esa línea
        const existing = await base('Contacts').select({ 
            filterByFormula: `AND({phone}='${cleanP}', {origin_phone_id}='${originId}')` 
        }).firstPage();

        if (existing.length > 0) {
            return res.status(400).json({ error: "El contacto ya existe en esta línea." });
        }

        await base('Contacts').create([{
            fields: {
                "phone": cleanP,
                "name": name,
                "origin_phone_id": originId,
                "status": "Nuevo",
                "email": email || "",
                "last_message": "Creado manualmente",
                "last_message_time": new Date().toISOString()
            }
        }]);

        io.emit('contact_updated_notification');
        res.json({ success: true });
    } catch (e: any) {
        console.error("Error creando contacto:", e);
        res.status(500).json({ error: "Error creando contacto" });
    }
});

// 2. Importación Masiva (CSV)
app.post('/api/contacts/import', upload.single('file'), async (req: any, res: any) => {
    if (!base || !req.file) return res.status(400).json({ error: "Faltan datos" });
    
    try {
        const originPhoneId = req.body.originPhoneId || waPhoneId || "default";
        const fileContent = req.file.buffer.toString('utf-8');
        const rows = fileContent.split('\n');
        
        // Parsear CSV simple (Formato esperado: phone,name,email)
        const newContacts = [];
        
        for (let i = 0; i < rows.length; i++) { // Intentamos leer todas las filas
            const row = rows[i].trim();
            if (!row) continue;
            
            // Separar por comas
            const cols = row.split(',');
            const phone = cleanNumber(cols[0]);
            const name = cols[1] || "Importado";
            const email = cols[2] ? cols[2].trim() : "";
            
            // Saltamos cabeceras si detectamos texto no numérico en teléfono
            if (phone.length > 5 && !isNaN(Number(phone))) {
                newContacts.push({
                    fields: {
                        "phone": phone,
                        "name": name.trim(),
                        "email": email,
                        "origin_phone_id": originPhoneId,
                        "status": "Nuevo",
                        "last_message": "Importado por CSV",
                        "last_message_time": new Date().toISOString()
                    }
                });
            }
        }

        console.log(`📥 Importando ${newContacts.length} contactos a línea ${originPhoneId}...`);

        // Insertar en lotes de 10 (Límite Airtable)
        while (newContacts.length > 0) {
            const batch = newContacts.splice(0, 10);
            try {
                await base('Contacts').create(batch);
            } catch(err) {
                console.error("Error en lote:", err);
            }
            await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
        }

        io.emit('contact_updated_notification');
        res.json({ success: true, count: rows.length });
    } catch (e: any) {
        console.error("Error importando:", e);
        res.status(500).json({ error: "Error procesando el archivo" });
    }
});

// ==========================================
//  HERRAMIENTAS IA
// ==========================================

async function getAvailableAppointments() {
    if (!base) return "Error DB";
    try {
        const records = await base('Appointments').select({
            filterByFormula: "{Status} = 'Available'",
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 60 
        }).all();
        
        const now = new Date();
        const validRecords = records.filter(r => new Date(r.get('Date') as string) > now).slice(0, 15);
        if (validRecords.length === 0) return "No hay citas disponibles.";
        
        return validRecords.map(r => {
            const date = new Date(r.get('Date') as string);
            const isoDate = date.toISOString().split('T')[0];
            const time = date.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
            const weekday = date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
            return `ID:${r.id} -> ${weekday} ${isoDate} a las ${time}`;
        }).join("\n");
    } catch (error: any) { return "Error técnico agenda."; }
}

async function bookAppointment(appointmentId: string, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";
    // Fix Regex ID
    const idMatch = appointmentId.match(/rec[a-zA-Z0-9]+/);
    const cleanId = idMatch ? idMatch[0] : appointmentId.trim().replace(/['"]/g, '');
    
    if (cleanId.length < 10) return "❌ Error: ID inválido.";

    try {
        const record = await base('Appointments').find(cleanId);
        if (!record || record.get('Status') !== 'Available') return "❌ Hora no disponible.";
        
        const dateVal = new Date(record.get('Date') as string);
        const humanDate = dateVal.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

        await base('Appointments').update([{ id: cleanId, fields: { "Status": "Booked", "ClientPhone": clientPhone, "ClientName": clientName } }]);
        
        activeAiChats.delete(cleanNumber(clientPhone));
        io.emit('ai_active_change', { phone: cleanNumber(clientPhone), active: false });
        
        return `✅ Cita confirmada para el ${humanDate}.`;
    } catch (e: any) { return "❌ Error técnico al guardar."; }
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
    return "Fin conversación.";
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
            return { role: isBot ? "assistant" : "user", content: r.get('text') as string || "" } as any; 
        });
    } catch (e) { return []; }
}

// ==========================================
//  CEREBRO IA
// ==========================================

async function processAI(text: string, contactPhone: string, contactName: string, originPhoneId: string) {
    if (!openai) return;
    
    const cleanP = cleanNumber(contactPhone);
    activeAiChats.add(cleanP);
    io.emit('ai_status', { phone: cleanP, status: 'thinking' });
    io.emit('ai_active_change', { phone: cleanP, active: true });

    try {
        const history = await getChatHistory(contactPhone);
        const systemPrompt = await getSystemPrompt();
        const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        
        const messages = [
            { role: "system", content: `${systemPrompt}\n\n[SISTEMA: Hoy es ${now}]` },
            ...history, { role: "user", content: text }
        ];

        const runner = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages as any,
            tools: [
                { type: "function", function: { name: "get_available_appointments", description: "Ver horas libres." } },
                { type: "function", function: { name: "book_appointment", description: "Reservar. ID exacto.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } } },
                { type: "function", function: { name: "assign_department", description: "Derivar.", parameters: { type: "object", properties: { department: { type: "string", enum: ["Ventas", "Taller", "Admin"] } }, required: ["department"] } } },
                { type: "function", function: { name: "stop_conversation", description: "Parar." } }
            ],
            tool_choice: "auto"
        });

        const msg = runner.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCall = msg.tool_calls[0] as any;
            const args = JSON.parse(toolCall.function.arguments);
            let toolResult = "";

            if (toolCall.function.name === "get_available_appointments") toolResult = await getAvailableAppointments();
            else if (toolCall.function.name === "book_appointment") toolResult = await bookAppointment(args.appointmentId, contactPhone, contactName);
            else if (toolCall.function.name === "assign_department") toolResult = await assignDepartment(contactPhone, args.department);
            else if (toolCall.function.name === "stop_conversation") toolResult = await stopConversation(contactPhone);

            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [ ...messages, msg, { role: "tool", tool_call_id: toolCall.id, content: toolResult } ] as any
            });
            if (secondResponse.choices[0].message.content) await sendWhatsAppText(contactPhone, secondResponse.choices[0].message.content, originPhoneId);
        } else if (msg.content) {
            await sendWhatsAppText(contactPhone, msg.content, originPhoneId);
        }

    } catch (error) { console.error("❌ Error OpenAI:", error); } finally { io.emit('ai_status', { phone: cleanP, status: 'idle' }); }
}

async function sendWhatsAppText(to: string, body: string, originPhoneId: string) {
    const token = getToken(originPhoneId);
    if (!token) return console.error("❌ Token no encontrado para", originPhoneId);
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${originPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanNumber(to), type: "text", text: { body } },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        await saveAndEmitMessage({ 
            text: body, sender: "Bot IA", recipient: cleanNumber(to), 
            timestamp: new Date().toISOString(), type: "text", origin_phone_id: originPhoneId 
        });
        await handleContactUpdate(to, `🤖 Laura: ${body}`, undefined, originPhoneId);
    } catch (e) { console.error("Error enviando WA:", e); }
}

// ==========================================
//  WEBHOOKS (MULTI-CUENTA)
// ==========================================
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const change = body.entry[0].changes[0].value;
        const msg = change.messages[0];
        const originPhoneId = change.metadata.phone_number_id; 
        const from = msg.from; 
        const cleanFrom = cleanNumber(from);
        let text = "(Media)";
        if (msg.type === 'text') text = msg.text.body;

        console.log(`📩 [${originPhoneId}] Mensaje de ${from}: ${text}`);

        const contactRecord = await handleContactUpdate(from, text, change.contacts?.[0]?.profile?.name, originPhoneId);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type: 'text', origin_phone_id: originPhoneId });

        if (activeAiChats.has(cleanFrom) && msg.type === 'text') {
             processAI(text, from, contactRecord?.get('name') as string || "Cliente", originPhoneId);
        } else if (contactRecord && msg.type === 'text' && contactRecord.get('status') === 'Nuevo' && !contactRecord.get('assigned_to')) {
             processAI(text, from, contactRecord.get('name') as string || "Cliente", originPhoneId);
        }
    }
    
    if (body.object && body.entry?.[0]?.changes?.[0]?.field === 'message_template_status_update') {
        const metaId = body.entry[0].changes[0].value.message_template_id;
        const newStatus = body.entry[0].changes[0].value.event; 
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

// Cuentas
app.get('/api/accounts', (req, res) => {
    const accounts = Object.keys(BUSINESS_ACCOUNTS).map(id => ({ id, name: `Línea ${id.slice(-4)}` }));
    res.json(accounts);
});

// Agenda
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
        await base('Appointments').create([{ fields: { "Date": req.body.date, "Status": "Available" } }]);
        res.json({ success: true });
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
        const f:any={}; 
        if(req.body.status)f["Status"]=req.body.status; 
        if(req.body.clientPhone)f["ClientPhone"]=req.body.clientPhone; 
        if(req.body.clientName)f["ClientName"]=req.body.clientName;
        await base('Appointments').update([{ id: req.params.id, fields: f }]);
        res.json({ success: true });
    } catch(e) { res.status(400).json({error: "Error updating"}); }
});

app.delete('/api/appointments/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try { await base('Appointments').destroy([req.params.id]); res.json({ success: true }); } catch(e) { res.status(400).json({error: "Error deleting"}); }
});

// Templates (FULL LOGIC)
app.get('/api/templates', async (req, res) => { if (!base) return res.status(500).json({}); const r = await base(TABLE_TEMPLATES).select().all(); res.json(r.map(x => ({ id: x.id, name: x.get('Name'), status: x.get('Status'), body: x.get('Body'), variableMapping: x.get('VariableMapping') ? JSON.parse(x.get('VariableMapping') as string) : {} }))); });
app.post('/api/create-template', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { const { name, category, body, language, footer, variableExamples } = req.body; let metaId = "meta_simulado_" + Date.now(); let status = "PENDING"; if (waToken && waBusinessId) { try { const metaPayload: any = { name, category, allow_category_change: true, language, components: [{ type: "BODY", text: body }] }; if (footer) metaPayload.components.push({ type: "FOOTER", text: footer }); const metaRes = await axios.post(`https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`, metaPayload, { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } }); metaId = metaRes.data.id; status = metaRes.data.status || "PENDING"; } catch (metaError: any) { status = "REJECTED"; } } const createdRecords = await base(TABLE_TEMPLATES).create([{ fields: { "Name": name, "Category": category, "Language": language, "Body": body, "Footer": footer, "Status": status, "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {}) } }]); res.json({ success: true, template: { id: createdRecords[0].id } }); } catch (error: any) { res.status(400).json({ success: false, error: error.message }); } });
app.delete('/api/delete-template/:id', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "Error" }); } });
app.post('/api/send-template', async (req, res) => {
    const { templateName, language, phone, variables, senderName, originPhoneId } = req.body;
    const token = getToken(originPhoneId || waPhoneId || "default");
    const fromId = originPhoneId || waPhoneId;

    if (!token) return res.status(500).json({ error: "Credenciales" });
    try {
        const parameters = variables.map((val: string) => ({ type: "text", text: val }));
        await axios.post(`https://graph.facebook.com/v17.0/${fromId}/messages`, { messaging_product: "whatsapp", to: cleanNumber(phone), type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters }] } }, { headers: { Authorization: `Bearer ${token}` } });
        await saveAndEmitMessage({ text: `📝 [Plantilla] ${templateName}`, sender: senderName || "Agente", recipient: cleanNumber(phone), timestamp: new Date().toISOString(), type: "template", origin_phone_id: fromId });
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: "Error envío" }); }
});

// Analytics (FULL LOGIC)
app.get('/api/analytics', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const contacts = await base('Contacts').select().all();
        const messages = await base('Messages').select().all();
        const totalContacts = contacts.length;
        const totalMessages = messages.length;
        const newLeads = contacts.filter(c => c.get('status') === 'Nuevo').length;
        const last7Days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse();
        const activityData = last7Days.map(date => { const count = messages.filter(m => { const mDate = (m.get('timestamp') as string || "").split('T')[0]; return mDate === date; }).length; return { date, label: new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count }; });
        const agentStats: Record<string, any> = {}; 
        messages.forEach(m => { const s = (m.get('sender') as string) || ""; const r = (m.get('recipient') as string) || ""; const isPhone = /^\d+$/.test(s.replace(/\D/g, '')); if (!isPhone && s.toLowerCase() !== 'sistema' && s.trim() !== '') { if (!agentStats[s]) agentStats[s] = { msgs: 0, uniqueChats: new Set() }; agentStats[s].msgs += 1; if (r) agentStats[s].uniqueChats.add(r); } });
        const agentPerformance = Object.entries(agentStats).map(([name, data]) => ({ name, msgCount: data.msgs, chatCount: data.uniqueChats.size })).sort((a, b) => b.msgCount - a.msgCount).slice(0, 5);
        const statusMap: Record<string, number> = {}; contacts.forEach(c => { const s = (c.get('status') as string) || 'Otros'; statusMap[s] = (statusMap[s] || 0) + 1; });
        const statusDistribution = Object.entries(statusMap).map(([name, count]) => ({ name, count }));
        res.json({ kpis: { totalContacts, totalMessages, newLeads }, activity: activityData, agents: agentPerformance, statuses: statusDistribution });
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.get('/api/media/:id', async (req, res) => { if (!waToken) return res.sendStatus(500); try { const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${req.params.id}`, { headers: { 'Authorization': `Bearer ${waToken}` } }); const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' }); res.setHeader('Content-Type', mediaRes.headers['content-type']); mediaRes.data.pipe(res); } catch (e) { res.sendStatus(404); } });
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => { 
    try { 
        const file = req.file; const { targetPhone, senderName, originPhoneId } = req.body; 
        const token = getToken(originPhoneId || waPhoneId || "default");
        const fromId = originPhoneId || waPhoneId;
        if (!file || !targetPhone || !token) return res.status(400).json({ error: "Faltan datos" }); 
        const formData = new FormData(); formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype }); formData.append('messaging_product', 'whatsapp'); 
        const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${fromId}/media`, formData, { headers: { 'Authorization': `Bearer ${token}`, ...formData.getHeaders() } }); 
        const mediaId = uploadRes.data.id; 
        let msgType = 'document'; 
        if (file.mimetype.startsWith('image')) msgType = 'image'; 
        else if (file.mimetype.startsWith('audio')) msgType = 'audio'; 
        const payload: any = { messaging_product: "whatsapp", to: cleanNumber(targetPhone), type: msgType }; payload[msgType] = { id: mediaId, ...(msgType === 'document' && { filename: file.originalname }) }; 
        await axios.post(`https://graph.facebook.com/v17.0/${fromId}/messages`, payload, { headers: { Authorization: `Bearer ${token}` } }); 
        let textLog = file.originalname; let saveType = 'document'; if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; } else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; } 
        await saveAndEmitMessage({ text: textLog, sender: senderName || "Agente", recipient: cleanNumber(targetPhone), timestamp: new Date().toISOString(), type: saveType, mediaId, origin_phone_id: fromId }); 
        await handleContactUpdate(targetPhone, `Tú (${senderName}): 📎 Archivo`, undefined, fromId); 
        res.json({ success: true }); 
    } catch (e) { res.status(500).json({ error: "Error subiendo archivo" }); } 
});

// Config
app.get('/api/bot-config', async (req, res) => { if(!base) return res.sendStatus(500); try { const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); res.json({ prompt: r.length > 0 ? r[0].get('Value') : DEFAULT_SYSTEM_PROMPT }); } catch(e) { res.status(500).json({error:"Error"}); } });
app.post('/api/bot-config', async (req, res) => { if(!base) return res.sendStatus(500); try { const { prompt } = req.body; const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); if (r.length > 0) await base('BotSettings').update([{ id: r[0].id, fields: { "Value": prompt } }]); else await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": prompt } }]); res.json({ success: true }); } catch(e) { res.status(500).json({error: "Error"}); } });

// --- HELPERS DB (FIX DUPLICADOS) ---
async function handleContactUpdate(phone: string, text: string, name: string = "Cliente", originId: string = "unknown") {
  if (!base) return null;
  const clean = cleanNumber(phone);
  try {
    let r = await base('Contacts').select({ filterByFormula: `AND({phone}='${clean}', {origin_phone_id}='${originId}')`, maxRecords: 1 }).firstPage();
    if (r.length === 0) {
        // Buscar huérfano
        const orphan = await base('Contacts').select({ filterByFormula: `AND({phone}='${clean}', {origin_phone_id}='')`, maxRecords: 1 }).firstPage();
        if (orphan.length > 0) {
            await base('Contacts').update([{ id: orphan[0].id, fields: { "origin_phone_id": originId } }]);
            r = [orphan[0]];
        }
    }
    if (r.length > 0) {
      await base('Contacts').update([{ id: r[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]);
      return r[0];
    } else {
      const n = await base('Contacts').create([{ fields: { "phone": clean, "name": name, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString(), "origin_phone_id": originId } }]);
      io.emit('contact_updated_notification');
      return n[0];
    }
  } catch (e) { console.error("Error Contactos:", e); return null; }
}

async function saveAndEmitMessage(msg: any) {
  const payload = { ...msg, timestamp: msg.timestamp || new Date().toISOString() };
  io.emit('message', payload);
  if (base) { try { await base('Messages').create([{ fields: { "text": payload.text, "sender": payload.sender, "recipient": payload.recipient || "", "timestamp": payload.timestamp, "type": payload.type || "text", "media_id": payload.mediaId || "", "origin_phone_id": payload.origin_phone_id || "" } }], { typecast: true }); } catch (e) { console.error("Error guardando:", e); } }
}

// --- SOCKETS ---
io.on('connection', (socket) => {
  // CONFIGURACIÓN (MINÚSCULAS)
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });
  socket.on('delete_config', async (id) => { if (base) { const realId = (typeof id === 'object' && id.id) ? id.id : id; await base('Config').destroy([realId]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });
  socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });

  // Quick Replies
  socket.on('request_quick_replies', async () => { if (base) { const r = await base('QuickReplies').select().all(); socket.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('add_quick_reply', async (d) => { if (base) { await base('QuickReplies').create([{ fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('delete_quick_reply', async (id) => { if (base) { await base('QuickReplies').destroy([id]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('update_quick_reply', async (d) => { if (base) { await base('QuickReplies').update([{ id: d.id, fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });

  // Agents (FIX PREFERENCES - NOTIFICATIONS)
  socket.on('request_agents', async () => { if (base) { const r = await base('Agents').select().all(); socket.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); } });
  socket.on('login_attempt', async (data) => { if(!base) return; const r = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage(); if (r.length > 0) { const pwd = r[0].get('password'); const prefs = r[0].get('Preferences') ? JSON.parse(r[0].get('Preferences') as string) : {}; if (!pwd || String(pwd).trim() === "" || String(pwd) === String(data.password)) socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role'), preferences: prefs }); else socket.emit('login_error', 'Contraseña incorrecta'); } else socket.emit('login_error', 'Usuario no encontrado'); });
  socket.on('create_agent', async (d) => { if (!base) return; await base('Agents').create([{ fields: { "name": d.newAgent.name, "role": d.newAgent.role, "password": d.newAgent.password || "" } }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Creado'); });
  socket.on('delete_agent', async (d) => { if (!base) return; await base('Agents').destroy([d.agentId]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Eliminado'); });
  socket.on('update_agent', async (d) => { if (!base) return; 
    try {
        const f: any = { "name": d.updates.name, "role": d.updates.role }; 
        if (d.updates.password !== undefined) f["password"] = d.updates.password; 
        if (d.updates.preferences !== undefined) f["Preferences"] = JSON.stringify(d.updates.preferences); 
        await base('Agents').update([{ id: d.agentId, fields: f }]); 
        const r = await base('Agents').select().all(); 
        io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); 
        socket.emit('action_success', 'Actualizado');
    } catch(e) { 
        console.error(e);
        socket.emit('action_error', 'Error guardando. Revisa Airtable.'); 
    }
  });

  socket.on('request_contacts', async () => { if (base) { const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all(); socket.emit('contacts_update', r.map(x => ({ id: x.id, phone: x.get('phone'), name: x.get('name'), status: x.get('status'), department: x.get('department'), assigned_to: x.get('assigned_to'), last_message: x.get('last_message'), last_message_time: x.get('last_message_time'), avatar: (x.get('avatar') as any[])?.[0]?.url, tags: x.get('tags') || [], origin_phone_id: x.get('origin_phone_id') }))); } });
  socket.on('request_conversation', async (p) => { if (base) { const c = cleanNumber(p); const r = await base('Messages').select({ filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all(); socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') }))); } });
  socket.on('update_contact_info', async (data) => { if(base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });

  socket.on('chatMessage', async (msg) => { const originId = msg.originPhoneId || waPhoneId || "default"; const token = getToken(originId); if (token) { try { if (msg.type !== 'note') { await axios.post(`https://graph.facebook.com/v17.0/${originId}/messages`, { messaging_product: "whatsapp", to: cleanNumber(msg.targetPhone), type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${token}` } }); } await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: msg.targetPhone, type: msg.type || 'text', origin_phone_id: originId, timestamp: new Date().toISOString() }); const prev = msg.type === 'note' ? `📝 Nota: ${msg.text}` : `Tú: ${msg.text}`; await handleContactUpdate(msg.targetPhone, prev, undefined, originId); } catch (e: any) { console.error("Error envío:", e.message); } } });
  
  socket.on('trigger_ai_manual', async (data) => { const { phone } = data; const originId = waPhoneId || "default"; if (base) { activeAiChats.add(cleanNumber(phone)); io.emit('ai_active_change', { phone: cleanNumber(phone), active: true }); const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanNumber(phone)}'` }).firstPage(); const name = (records.length > 0) ? (records[0].get('name') as string) : "Cliente"; const msgs = await base('Messages').select({ filterByFormula: `OR({sender}='${cleanNumber(phone)}',{recipient}='${cleanNumber(phone)}')`, sort: [{field: "timestamp", direction: "desc"}], maxRecords: 1 }).firstPage(); const text = msgs.length > 0 ? (msgs[0].get('text') as string) : "Hola"; processAI(text, phone, name, originId); } });
  socket.on('stop_ai_manual', (d) => { activeAiChats.delete(cleanNumber(d.phone)); io.emit('ai_active_change', { phone: cleanNumber(d.phone), active: false }); });
  socket.on('register_presence', (u: string) => { if (u) { onlineUsers.set(socket.id, u); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { onlineUsers.delete(socket.id); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('typing', (d) => { socket.broadcast.emit('remote_typing', d); });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo ${PORT}`); });