import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { MessageCircle } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');

const BACKEND_URL = isProduction
  ? "https://chatgorithm.onrender.com"
  : "http://localhost:3000";

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
  // Aquí guardamos qué cliente está seleccionado ahora mismo
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }

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
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
          <Login onLogin={handleLogin} socket={socket} />
        </div>
      ) : (
        <div className="flex w-full h-full max-w-[1800px] mx-auto bg-white shadow-2xl overflow-hidden md:my-0 md:h-screen md:border-x border-gray-200">
          
          {/* BARRA LATERAL (LISTA DE CLIENTES) */}
          <div className="w-80 flex-shrink-0 flex border-r border-gray-100 bg-slate-50/50">
            <Sidebar 
              user={user} 
              socket={socket} 
              onSelectContact={setSelectedContact}
              selectedContactId={selectedContact?.id}
            />
          </div>

          {/* AREA PRINCIPAL */}
          <main className="flex-1 flex flex-col min-w-0 bg-white relative">
            
            {/* CABECERA */}
            <header className="h-16 border-b border-gray-100 flex justify-between items-center px-6 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
              <div className="flex items-center gap-3">
                {selectedContact ? (
                  <>
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {selectedContact.name ? selectedContact.name[0].toUpperCase() : '#'}
                    </div>
                    <div>
                      <h1 className="text-sm font-bold text-slate-800">{selectedContact.name || selectedContact.phone}</h1>
                      <span className="text-xs text-slate-500">{selectedContact.phone}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-slate-400" />
                    <h1 className="text-lg font-bold text-slate-700">Chatgorithm CRM</h1>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                 <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                 <span className="text-xs font-semibold text-slate-600 mr-2">{user.username}</span>
              </div>
            </header>
            
            {/* VENTANA DE CHAT */}
            <div className="flex-1 overflow-hidden relative">
              {selectedContact ? (
                <ChatWindow 
                  socket={socket} 
                  user={user} 
                  targetPhone={selectedContact.phone} // Pasamos el teléfono destino
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Selecciona un chat para empezar</p>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;