import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { Settings } from './components/Settings';
import { MessageCircle, LogOut, Settings as SettingsIcon, WifiOff } from 'lucide-react';
// IMPORTANTE: Importamos el selector de plantillas
import ChatTemplateSelector from './components/ChatTemplateSelector';

const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

const socket = io(BACKEND_URL, { 
    transports: ['websocket', 'polling'], 
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

const getSavedUser = () => {
    try {
        const saved = localStorage.getItem('chatgorithm_user') || sessionStorage.getItem('chatgorithm_user');
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error parsing user", e);
    }
    return null;
};

function App() {
  const [user, setUser] = useState<{username: string, role: string} | null>(getSavedUser);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [isConnected, setIsConnected] = useState(true);
  
  // --- ESTADO PARA EL MODAL DE PLANTILLAS ---
  const [showTemplates, setShowTemplates] = useState(false);

  // --- ESTADOS GLOBALES NUEVOS ---
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingStatus, setTypingStatus] = useState<{[chatId: string]: string}>({}); 

  const [config, setConfig] = useState<{departments: string[], statuses: string[]}>({ 
      departments: [], 
      statuses: [] 
  });

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    if (user) {
        socket.emit('register_presence', user.username);
    }

    const onConnect = () => {
        setIsConnected(true);
        console.log("🟢 Conectado/Reconectado");
        if (user) socket.emit('register_presence', user.username);
        socket.emit('request_config');
    };

    const onDisconnect = () => {
        setIsConnected(false);
        console.log("🔴 Desconectado");
    };

    // --- LISTENERS GLOBALES ---
    const onOnlineUsersUpdate = (users: string[]) => {
        setOnlineUsers(users);
    };

    const onRemoteTyping = (data: { user: string, phone: string }) => {
        if (data.user !== user?.username) {
            setTypingStatus(prev => ({ ...prev, [data.phone]: data.user }));
            setTimeout(() => {
                setTypingStatus(prev => {
                    if (prev[data.phone] === data.user) {
                        const newState = { ...prev };
                        delete newState[data.phone];
                        return newState;
                    }
                    return prev;
                });
            }, 3000);
        }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('online_users_update', onOnlineUsersUpdate);
    socket.on('remote_typing', onRemoteTyping);

    const connectionCheckTimeout = setTimeout(() => {
        setIsConnected(socket.connected);
    }, 1500);

    socket.on('config_list', (list: any[]) => {
        const depts = list.filter(i => i.type === 'Department').map(i => i.name);
        const stats = list.filter(i => i.type === 'Status').map(i => i.name);
        setConfig({ 
            departments: depts.length > 0 ? depts : ['Ventas', 'Taller', 'Admin'], 
            statuses: stats.length > 0 ? stats : ['Nuevo', 'Abierto', 'Cerrado'] 
        });
    });

    socket.emit('request_config');

    return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('config_list');
        socket.off('online_users_update');
        socket.off('remote_typing');
        clearTimeout(connectionCheckTimeout);
    };
  }, [user]); 

  const handleLogin = (username: string, role: string, password: string, remember: boolean) => {
    const u = { username, role };
    setUser(u);
    const dataToSave = JSON.stringify(u);
    if (remember) {
        localStorage.setItem('chatgorithm_user', dataToSave);
        sessionStorage.removeItem('chatgorithm_user');
    } else {
        sessionStorage.setItem('chatgorithm_user', dataToSave);
        localStorage.removeItem('chatgorithm_user');
    }
    socket.emit('register_presence', username);
  };

  const handleLogout = () => {
      localStorage.removeItem('chatgorithm_user');
      sessionStorage.removeItem('chatgorithm_user');
      setUser(null); 
      setSelectedContact(null); 
      socket.disconnect();
      socket.connect(); 
  };

  if (!user) {
      return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
                <Login onLogin={handleLogin} socket={socket} />
            </div>
        </div>
      );
  }

  if (view === 'settings') {
      return <Settings onBack={() => setView('chat')} socket={socket} currentUserRole={user.role} />;
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
        <div className="flex w-full h-full max-w-[1800px] mx-auto bg-white shadow-2xl overflow-hidden md:h-screen border-x border-gray-200">
          
          {/* Barra Lateral */}
          <div className={`w-full md:w-80 flex-shrink-0 flex-col border-r border-gray-100 bg-slate-50/50 ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
            <Sidebar 
                user={user} 
                socket={socket} 
                onSelectContact={setSelectedContact} 
                selectedContactId={selectedContact?.id} 
                isConnected={isConnected}
                onlineUsers={onlineUsers}
                typingStatus={typingStatus}
            />
            
            <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
                <button onClick={() => setView('settings')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition" title="Configuración"><SettingsIcon className="w-5 h-5" /></button>
                <div className="flex-1 flex items-center gap-2 bg-slate-50 px-3 rounded-lg border border-slate-100">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                    <span className="text-xs font-bold text-slate-600 truncate">{user.username}</span>
                </div>
                <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Salir"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Área Principal */}
          <main className={`flex-1 flex-col min-w-0 bg-white relative ${selectedContact ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex-1 overflow-hidden relative">
              {!isConnected && (
                  <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-xs text-center py-1 z-50 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 flex items-center justify-center"><WifiOff className="w-3 h-3" /></div>
                      <span>Sin conexión con el servidor. Reconectando...</span>
                  </div>
              )}
              
              {selectedContact ? (
                // @ts-ignore
                <ChatWindow 
                    socket={socket} 
                    user={user} 
                    contact={selectedContact} 
                    config={config}
                    onBack={() => setSelectedContact(null)}
                    onlineUsers={onlineUsers}
                    typingInfo={typingStatus}
                    // PASAMOS LA FUNCIÓN PARA ABRIR EL MODAL DE PLANTILLAS
                    onOpenTemplates={() => setShowTemplates(true)}
                /> 
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                    <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                    <p>Selecciona un chat</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* --- MODAL SELECTOR DE PLANTILLAS --- */}
        <ChatTemplateSelector 
            isOpen={showTemplates} 
            onClose={() => setShowTemplates(false)} 
            targetPhone={selectedContact?.phone || ""}
        />
    </div>
  );
}

export default App;