import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { MessageCircle, LogOut } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });

function App() {
  const [user, setUser] = useState<{username: string, role: string} | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // 1. AL CARGAR: Comprobar si ya estábamos logueados
  useEffect(() => {
    const savedUser = localStorage.getItem('chatgorithm_user');
    if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        // Reconectar socket con info de usuario si fuera necesario
        socket.emit('login', { username: parsedUser.username });
    }

    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleLogin = (username: string, role: string) => {
    const userData = { username, role };
    setUser(userData);
    localStorage.setItem('chatgorithm_user', JSON.stringify(userData)); // Guardar sesión
    socket.emit('login', { username }); 
  };

  const handleLogout = () => {
      localStorage.removeItem('chatgorithm_user'); // Borrar sesión
      setUser(null);
      setSelectedContact(null);
      // Opcional: Recargar para limpiar estados de socket
      window.location.reload();
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {!user ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
          <Login onLogin={handleLogin} socket={socket} />
        </div>
      ) : (
        <div className="flex w-full h-full max-w-[1800px] mx-auto bg-white shadow-2xl overflow-hidden md:h-screen border-x border-gray-200">
          <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-100 bg-slate-50/50">
            <Sidebar 
              user={user} 
              socket={socket} 
              onSelectContact={setSelectedContact}
              selectedContactId={selectedContact?.id}
            />
            
            {/* BOTÓN CERRAR SESIÓN */}
            <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conectado como</span>
                    </div>
                </div>
                <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="font-bold text-slate-700 text-sm px-2">{user.username}</div>
                    <button 
                        onClick={handleLogout} 
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
                        title="Cerrar Sesión"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
          </div>
          
          <main className="flex-1 flex flex-col min-w-0 bg-white relative">
            <header className="h-16 border-b border-gray-100 flex justify-between items-center px-6 bg-white sticky top-0 z-20">
              <div className="flex items-center gap-3">
                {selectedContact ? (
                  <>
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {String(selectedContact.name || selectedContact.phone || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="text-sm font-bold text-slate-800">{String(selectedContact.name || selectedContact.phone)}</h1>
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
            </header>
            <div className="flex-1 overflow-hidden relative">
              {selectedContact ? (
                <ChatWindow socket={socket} user={user} contact={selectedContact} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                  <p>Selecciona un chat</p>
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