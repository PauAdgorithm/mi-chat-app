import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { Settings } from './components/Settings';
import { MessageCircle, LogOut, Settings as SettingsIcon } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

// Inicializamos el socket fuera para evitar reconexiones
const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });

function App() {
  const [user, setUser] = useState<{username: string, role: string} | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  
  // Estado Global de Configuración
  const [config, setConfig] = useState<{departments: string[], statuses: string[]}>({ 
      departments: [], 
      statuses: [] 
  });

  useEffect(() => {
    // 1. Recuperar sesión guardada
    const savedUser = localStorage.getItem('chatgorithm_user');
    if (savedUser) {
        try {
            const parsed = JSON.parse(savedUser);
            setUser(parsed);
            socket.emit('login', { username: parsed.username });
        } catch (e) { console.error(e); }
    }

    // 2. Escuchar actualizaciones de configuración en tiempo real
    socket.on('config_list', (list: any[]) => {
        console.log("🔄 Config actualizada:", list);
        
        const depts = list.filter(i => i.type === 'Department').map(i => i.name);
        const stats = list.filter(i => i.type === 'Status').map(i => i.name);
        
        setConfig({ 
            departments: depts.length > 0 ? depts : ['Ventas', 'Taller', 'Admin'], 
            statuses: stats.length > 0 ? stats : ['Nuevo', 'Abierto', 'Cerrado'] 
        });
    });

    // Pedir la config inicial
    socket.emit('request_config');

    return () => {
        socket.off('config_list');
    };
  }, []);

  const handleLogin = (username: string, role: string) => {
    const u = { username, role };
    setUser(u);
    localStorage.setItem('chatgorithm_user', JSON.stringify(u));
    socket.emit('login', { username }); 
  };

  const handleLogout = () => {
      localStorage.removeItem('chatgorithm_user');
      setUser(null); 
      setSelectedContact(null); 
      window.location.reload();
  };

  // --- PANTALLA DE LOGIN ---
  if (!user) {
      return (
        <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
                <Login onLogin={handleLogin} socket={socket} />
            </div>
        </div>
      );
  }

  // --- PANTALLA DE AJUSTES (NUEVO: Pasamos el rol) ---
  if (view === 'settings') {
      return (
        <Settings 
            onBack={() => setView('chat')} 
            socket={socket} 
            currentUserRole={user.role} 
        />
      );
  }

  // --- PANTALLA PRINCIPAL (CHAT) ---
  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
        <div className="flex w-full h-full max-w-[1800px] mx-auto bg-white shadow-2xl overflow-hidden md:h-screen border-x border-gray-200">
          
          {/* Barra Lateral */}
          <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-100 bg-slate-50/50">
            <Sidebar 
                user={user} 
                socket={socket} 
                onSelectContact={setSelectedContact} 
                selectedContactId={selectedContact?.id} 
            />
            
            {/* Footer Sidebar */}
            <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
                <button onClick={() => setView('settings')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition" title="Configuración"><SettingsIcon className="w-5 h-5" /></button>
                <div className="flex-1 flex items-center gap-2 bg-slate-50 px-3 rounded-lg border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs font-bold text-slate-600 truncate">{user.username}</span>
                </div>
                <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Salir"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Área Principal */}
          <main className="flex-1 flex flex-col min-w-0 bg-white relative">
            <div className="flex-1 overflow-hidden relative">
              {selectedContact ? (
                <ChatWindow 
                    socket={socket} 
                    user={user} 
                    contact={selectedContact} 
                    config={config} // Pasamos la configuración dinámica
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