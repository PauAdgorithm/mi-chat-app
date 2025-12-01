// --- Importaciones ---
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Airtable from 'airtable'; // Asegúrate de instalar: npm install airtable @types/airtable

// --- Inicialización ---
const app = express();
const httpServer = createServer(app);

// Configuración de Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Permitimos cualquier origen para evitar problemas en producción
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const SECRET = "mi-clave-secreta-local-123"; // Idealmente, pon esto también en variables de entorno

// --- Conexión con AIRTABLE ---
// Usamos las variables que pusiste en Render
// "as string" soluciona errores de TypeScript si piensa que pueden ser undefined
const apiKey = process.env.AIRTABLE_API_KEY as string;
const baseId = process.env.AIRTABLE_BASE_ID as string;

// Verificación básica para evitar crash si faltan las variables
if (!apiKey || !baseId) {
  console.warn("⚠️ ADVERTENCIA: Faltan las variables de entorno de Airtable (AIRTABLE_API_KEY o AIRTABLE_BASE_ID).");
}

const base = new Airtable({ apiKey: apiKey }).base(baseId);

// Nombres de las tablas en Airtable (¡Asegúrate de que coincidan en tu Airtable!)
const TBL_USERS = 'Users';
const TBL_CONVERSATIONS = 'Conversations';
const TBL_MESSAGES = 'Messages';

// --- Helper para buscar usuario por nombre ---
async function findUserByUsername(username: string) {
  const records = await base(TBL_USERS).select({
    filterByFormula: `{username} = '${username}'`,
    maxRecords: 1
  }).firstPage();
  
  if (records.length === 0) return null;
  return { 
    id: records[0].id, // ID interno de Airtable
    ...records[0].fields 
  } as any;
}

// --- RUTAS DE LA API (REST) ---

// 1. Registro de Usuario
app.post('/auth/register', async (req: any, res: any) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Faltan datos" });

    // Verificar si existe
    const existing = await findUserByUsername(username);
    if (existing) return res.status(400).json({ error: "El usuario ya existe" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear en Airtable
    const created = await base(TBL_USERS).create([
      {
        "fields": {
          "username": username,
          "password": hashedPassword,
          "avatarUrl": "https://via.placeholder.com/150"
        }
      }
    ]);

    const user = created[0];
    // @ts-ignore
    res.status(201).json({ id: user.id, username: user.get('username') });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al registrar" });
  }
});

// 2. Login de Usuario
app.post('/auth/login', async (req: any, res: any) => {
  try {
    const { username, password } = req.body;
    const user = await findUserByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, SECRET, { expiresIn: '24h' });
    
    // Devolvemos el objeto usuario
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        avatarUrl: user.avatarUrl 
      } 
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error en login" });
  }
});

// 3. Middleware de Autenticación
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// 4. Obtener Conversaciones
app.get('/conversations', authenticate, async (req: any, res: any) => {
  try {
    // Para simplificar en Airtable, vamos a devolver una sala "General" por defecto
    
    // Buscamos si existe la sala General
    const generalChat = await base(TBL_CONVERSATIONS).select({
      filterByFormula: `{name} = 'General'`,
      maxRecords: 1
    }).firstPage();

    let chatId;
    let chatName = "General";

    if (generalChat.length === 0) {
        const newChat = await base(TBL_CONVERSATIONS).create([{ fields: { "name": "General", "type": "GROUP" } }]);
        chatId = newChat[0].id;
    } else {
        chatId = generalChat[0].id;
    }

    // Devolvemos un array con esa conversación
    res.json([{ id: chatId, name: chatName, type: "GROUP" }]);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error cargando conversaciones" });
  }
});

// 5. Obtener Mensajes
app.get('/conversations/:id/messages', authenticate, async (req: any, res: any) => {
  try {
    const conversationId = req.params.id;

    // En Airtable, filtramos los mensajes que pertenecen a esta ID de conversación
    const records = await base(TBL_MESSAGES).select({
      filterByFormula: `{conversationId} = '${conversationId}'`,
      sort: [{ field: "createdAt", direction: "asc" }]
    }).all();

    // AQUÍ ESTABA EL ERROR: Añadimos (record: any) para que TypeScript no se queje
    const messages = records.map((record: any) => ({
      id: record.id,
      content: record.get('content'),
      senderId: record.get('senderId'),
      conversationId: record.get('conversationId'),
      createdAt: record.get('createdAt'),
      sender: { 
        id: record.get('senderId'),
        username: record.get('senderUsername') || "Usuario",
        avatarUrl: "https://via.placeholder.com/150"
      }
    }));

    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error cargando mensajes" });
  }
});

// --- SOCKET.IO ---

// Añadimos 'any' para evitar errores de TypeScript estricto
io.on('connection', (socket: any) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
  });

  socket.on('send_message', async (data: any) => {
    const { conversationId, content, token } = data;
    try {
      const decoded: any = jwt.verify(token, SECRET);
      const userId = decoded.userId;
      const username = decoded.username;

      // Guardar en AIRTABLE
      const created = await base(TBL_MESSAGES).create([
        {
          "fields": {
            "content": content,
            "senderId": userId,
            "senderUsername": username,
            "conversationId": conversationId,
            "createdAt": new Date().toISOString()
          }
        }
      ]);

      const record = created[0];

      // Construir objeto para enviar al frontend
      const newMessage = {
        id: record.id,
        content: content,
        senderId: userId,
        conversationId: conversationId,
        // @ts-ignore
        createdAt: record.get('createdAt'),
        sender: {
            id: userId,
            username: username,
            avatarUrl: "https://via.placeholder.com/150"
        }
      };

      // Emitir a la sala
      io.to(conversationId).emit('receive_message', newMessage);

    } catch (err) {
      console.error("Error socket:", err);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Servidor Airtable corriendo en puerto ${PORT}`);
});