import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar } from './components/Sidebar';
import { MessageCircle } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');

const BACKEND_URL = isProduction
  ? "https://chatgorithm.onrender.com"
  : "http://localhost:3000";

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
    }
    function onDisconnect() {
      setIsConnected(false);
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
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {!user ? (
        // PANTALLA DE LOGIN
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
          <Login onLogin={handleLogin} socket={socket} />
        </div>
      ) : (
        // PANTALLA DE CHAT PRINCIPAL
        <div className="flex w-full h-full max-w-[1600px] mx-auto bg-white shadow-2xl overflow-hidden md:my-4 md:rounded-2xl md:h-[calc(100vh-2rem)] md:border border-gray-200">
          
          {/* BARRA LATERAL */}
          <div className="w-72 flex-shrink-0 hidden md:flex border-r border-gray-100 bg-slate-50/50">
            <Sidebar user={user} socket={socket} />
          </div>

          {/* AREA PRINCIPAL */}
          <main className="flex-1 flex flex-col min-w-0 bg-white relative">
            
            {/* CABECERA */}
            <header className="h-16 border-b border-gray-100 flex justify-between items-center px-6 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-lg shadow-md shadow-blue-200">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-800 leading-tight tracking-tight">Chatgorithm</h1>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                    <span className="text-xs font-medium text-slate-500">
                      {isConnected ? 'En línea' : 'Reconectando...'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 bg-slate-50 py-1.5 px-3 rounded-full border border-slate-200 shadow-sm">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <span className="text-sm font-semibold text-slate-700">{user.username}</span>
              </div>
            </header>
            
            {/* VENTANA DE CHAT */}
            <div className="flex-1 overflow-hidden relative">
              <ChatWindow socket={socket} user={user} />
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;