import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuración de CORS para permitir conexiones desde el frontend
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "https://chatgorithm.onrender.com"], // Ajusta según tus dominios
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Base de datos simulada en memoria
const configData = {
    departments: [
        { id: 1, name: 'Ventas', type: 'Department' },
        { id: 2, name: 'Soporte', type: 'Department' },
        { id: 3, name: 'Administración', type: 'Department' }
    ],
    statuses: [
        { id: 1, name: 'Nuevo', type: 'Status' },
        { id: 2, name: 'En Proceso', type: 'Status' },
        { id: 3, name: 'Resuelto', type: 'Status' }
    ]
};

// Interfaz para extender el objeto Socket y añadir propiedades personalizadas
interface CustomSocket extends Socket {
    username?: string;
    role?: string;
}

io.on('connection', (socket: CustomSocket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // 1. Manejo de Login (Asociar usuario al socket)
    socket.on('login', (data) => {
        socket.username = data.username;
        socket.role = data.role;
        console.log(`Usuario autenticado: ${socket.username}`);
        
        // Unir al usuario a una sala con su propio nombre para mensajes privados
        socket.join(data.username);
        
        // Notificar a todos que alguien se conectó (Opcional)
        io.emit('user_connected', { username: data.username });
    });

    // 2. Enviar configuración inicial al cliente
    socket.on('request_config', () => {
        socket.emit('config_list', [...configData.departments, ...configData.statuses]);
    });

    // 3. Manejo de Mensajes
    socket.on('send_message', (data) => {
        console.log(`Mensaje de ${data.sender} a ${data.receiver}: ${data.text}`);
        
        // Opción A: Broadcast a todos (Chat Grupal General)
        // socket.broadcast.emit('receive_message', data);

        // Opción B: Mensaje Directo + Copia al remitente (para chats privados)
        // Envia al destinatario
        io.to(data.receiver).emit('receive_message', data);
        // Envia copia al remitente (para que aparezca en su pantalla si usa múltiples dispositivos)
        io.to(data.sender).emit('receive_message', data);
    });

    // --- NUEVO: LÓGICA DE "ESCRIBIENDO..." ---
    socket.on('typing', (data) => {
        // data.target es a quién le estás escribiendo (para chats privados)
        if (data.target) {
            // Emitir solo al destinatario específico
            io.to(data.target).emit('user_typing', { 
                user: socket.username 
            });
        } else {
            // Si es un chat grupal global, emitir a todos menos al que escribe
            socket.broadcast.emit('user_typing', { 
                user: socket.username 
            });
        }
    });
    // ----------------------------------------

    // 5. Desconexión
    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id} (${socket.username})`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});