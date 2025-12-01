import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// CORRECCIÓN: Usamos llaves { } para importar componentes con "exportación nombrada"
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar } from './components/Sidebar';

// ----------------------------------------------------------------------
// CONFIGURACIÓN DE CONEXIÓN
// Detecta automáticamente si estás en Render o en Local
// ----------------------------------------------------------------------
const isProduction = window.location.hostname.includes('render.com');

const BACKEND_URL = isProduction
  ? "https://chatgorithm.onrender.com"  // TU URL DE RENDER
  : "http://localhost:3000";            // TU URL LOCAL

console.log(`🔌 Conectando a: ${BACKEND_URL}`);

const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5
});

interface User {
  username: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      console.log("🟢 Conectado al servidor WebSocket");
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log("🔴 Desconectado del servidor WebSocket");
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleLogin = (username: string) => {
    setUser({ username });
    socket.emit('login', { username }); 
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      {!user ? (
        // PANTALLA DE LOGIN
        <div className="w-full h-full flex items-center justify-center p-4">
          <Login onLogin={handleLogin} socket={socket} />
        </div>
      ) : (
        // PANTALLA DE CHAT
        <>
          <div className="w-64 flex-shrink-0 hidden md:flex border-r border-gray-200 bg-white">
            <Sidebar user={user} socket={socket} />
          </div>

          <main className="flex-1 flex flex-col min-w-0 bg-white">
            <header className="h-16 border-b flex justify-between items-center px-6 bg-white shadow-sm z-10">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-800">Chatgorithm</h1>
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {isConnected ? 'Online' : 'Offline'}
                </div>
              </div>
              <div className="flex items-center">
                <span className="font-medium text-blue-600">{user.username}</span>
              </div>
            </header>
            
            <div className="flex-1 overflow-hidden relative bg-slate-50">
              <ChatWindow socket={socket} user={user} />
            </div>
          </main>
        </>
      )}
    </div>
  );
}

export default App;