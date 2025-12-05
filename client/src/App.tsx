import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { Settings } from './components/Settings';
import { MessageCircle, LogOut, Settings as SettingsIcon, WifiOff } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

// Configuración de socket más agresiva para reconectar
const socket = io(BACKEND_URL, { 
    transports: ['websocket', 'polling'], 
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

// Helper fuera del componente para leer storage de forma síncrona
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
  // CAMBIO CLAVE: Inicialización "Lazy" (perezosa).
  // Se ejecuta ANTES del primer renderizado visual. 
  // Si hay usuario guardado, la App arranca directamente en el Chat, evitando el salto visual.
  const [user, setUser] = useState<{username: string, role: string} | null>(getSavedUser);
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const [config, setConfig] = useState<{departments: string[], statuses: string[]}>({ 
      departments: [], 
      statuses: [] 
  });

  useEffect(() => {
    // Si arrancamos con usuario (leído de storage en el useState), nos identificamos al socket
    if (user) {
        socket.emit('login', { username: user.username });
    }

    // Eventos de conexión
    const onConnect = () => {
        setIsConnected(true);
        console.log("🟢 Conectado/Reconectado");
        
        // Al volver a conectar, pedimos config
        socket.emit('request_config');
        
        // Recuperar credenciales frescas del storage para re-autenticar si hubo desconexión larga
        const currentUser = getSavedUser();
        if (currentUser) {
            // Actualizamos estado por seguridad
            setUser(currentUser);
            socket.emit('login', { username: currentUser.username });
        }
    };

    const onDisconnect = () => {
        setIsConnected(false);
        console.log("🔴 Desconectado");
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Cargar configuración
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
    };
  }, []); // Array vacío está bien porque usamos getSavedUser() dentro para datos frescos

  const handleLogin = (username: string, role: string, password: string, remember: boolean) => {
    const u = { username, role, password }; 
    setUser(u);
    
    if (remember) {
        localStorage.setItem('chatgorithm_user', JSON.stringify(u));
        sessionStorage.removeItem('chatgorithm_user');
    } else {
        sessionStorage.setItem('chatgorithm_user', JSON.stringify(u));
        localStorage.removeItem('chatgorithm_user');
    }
    
    socket.emit('login', { username }); 
  };

  const handleLogout = () => {
      localStorage.removeItem('chatgorithm_user');
      sessionStorage.removeItem('chatgorithm_user');
      setUser(null); 
      setSelectedContact(null); 
      socket.disconnect();
      socket.connect(); // Reinicia el socket limpio
  };

  // --- PANTALLA LOGIN ---
  if (!user) {
      return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
                <Login onLogin={handleLogin} socket={socket} />
            </div>
        </div>
      );
  }

  // --- SETTINGS ---
  if (view === 'settings') {
      return <Settings onBack={() => setView('chat')} socket={socket} currentUserRole={user.role} />;
  }

  // --- CHAT ---
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
              {/* Aviso de desconexión sutil */}
              {!isConnected && (
                  <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-xs text-center py-1 z-50 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 flex items-center justify-center"><WifiOff className="w-3 h-3" /></div>
                      <span>Sin conexión con el servidor. Reconectando...</span>
                  </div>
              )}
              
              {selectedContact ? (
                <ChatWindow 
                    socket={socket} 
                    user={user} 
                    contact={selectedContact} 
                    config={config}
                    onBack={() => setSelectedContact(null)}
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
    </div>
  );
}

export default App;