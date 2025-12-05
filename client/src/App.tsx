import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  MessageCircle, 
  LogOut, 
  Settings as SettingsIcon, 
  WifiOff, 
  Send, 
  User, 
  Phone, 
  MoreVertical, 
  Search,
  Check,
  CheckCheck,
  Paperclip,
  Image as ImageIcon,
  Mic
} from 'lucide-react';

// --- CONFIGURACIÓN GLOBAL ---
const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

const socket = io(BACKEND_URL, { 
    transports: ['websocket', 'polling'], 
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

// --- TIPOS E INTERFACES ---
interface UserData {
    username: string;
    role: string;
}

interface Contact {
    id: string;
    phone: string;
    name: string;
    status: string;
    department: string;
    last_message: string;
    last_message_time: string;
    avatar?: string;
}

interface Message {
    text: string;
    sender: string;
    recipient?: string;
    timestamp: string;
    type: 'text' | 'image' | 'audio' | 'document';
    mediaId?: string;
}

// --- COMPONENTE LOGIN (Inline) ---
const Login = ({ onLogin, socket }: { onLogin: (u: string, r: string, p: string, m: boolean) => void, socket: Socket }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('Agente');
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        socket.on('login_success', (data) => onLogin(data.username, data.role, password, remember));
        socket.on('login_error', (msg) => setError(msg));
        return () => { socket.off('login_success'); socket.off('login_error'); };
    }, [socket, password, remember, onLogin]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        socket.emit('login_attempt', { name: username, password });
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
                    <MessageCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Bienvenido</h2>
                <p className="text-slate-500 mt-2">Inicia sesión para continuar</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
                    <div className="relative">
                        <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} 
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Nombre de usuario" required />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="••••••••" />
                </div>
                {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><WifiOff className="w-4 h-4"/>{error}</div>}
                <div className="flex items-center gap-2">
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} id="remember" className="rounded text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="remember" className="text-sm text-slate-600">Recordar sesión</label>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-200 active:scale-[0.98]">
                    Iniciar Sesión
                </button>
            </form>
        </div>
    );
};

// --- COMPONENTE SETTINGS (Inline) ---
const Settings = ({ onBack, socket, currentUserRole }: { onBack: () => void, socket: Socket, currentUserRole: string }) => {
    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><LogOut className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-lg font-bold text-slate-800">Configuración</h2>
            </header>
            <div className="p-8 max-w-2xl mx-auto w-full">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
                    <SettingsIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">Panel de Administración</h3>
                    <p className="text-slate-500 mt-2">Las opciones de configuración estarán disponibles pronto.</p>
                    <p className="text-sm text-slate-400 mt-4">Rol actual: <span className="font-semibold">{currentUserRole}</span></p>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE SIDEBAR (Inline) ---
const Sidebar = ({ user, socket, onSelectContact, selectedContactId, isConnected, onlineUsers, typingStatus }: any) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        socket.emit('request_contacts');
        socket.on('contacts_update', (data: Contact[]) => setContacts(data));
        return () => { socket.off('contacts_update'); };
    }, [socket]);

    const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

    // Lógica para determinar el estado visual
    const getStatusIndicator = (contact: Contact) => {
        const isTyping = typingStatus[contact.phone]; // ¿Alguien escribe en este chat?
        // Comprobar si el contacto (o un agente asignado) está online. 
        // Nota: onlineUsers son nombres de usuario (agentes).
        // Si quisieras ver si el CONTACTO está online, necesitarías lógica extra.
        // Asumiremos que el indicador verde es para el estado general del chat.
        
        if (isTyping) return <span className="text-xs text-green-500 font-bold animate-pulse">Escribiendo...</span>;
        
        // Formatear hora último mensaje
        const date = new Date(contact.last_message_time);
        return <span className="text-xs text-slate-400">{date.getHours()}:{date.getMinutes().toString().padStart(2, '0')}</span>;
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Buscar chat..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none" />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {filtered.map(contact => (
                    <div key={contact.id} onClick={() => onSelectContact(contact)}
                        className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition border-b border-slate-50 ${selectedContactId === contact.id ? 'bg-blue-50 border-blue-100' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-100 to-indigo-100 flex items-center justify-center text-blue-600 font-bold flex-shrink-0 relative">
                            {contact.avatar ? <img src={contact.avatar} className="w-full h-full rounded-full object-cover" /> : contact.name.charAt(0)}
                            {/* Indicador de estado (opcional, si el contacto tuviera estado online) */}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <h4 className={`font-semibold text-sm truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-800'}`}>{contact.name}</h4>
                                {getStatusIndicator(contact)}
                            </div>
                            <p className="text-xs text-slate-500 truncate">{typingStatus[contact.phone] ? <span className="text-green-600 font-medium">✍️ Escribiendo...</span> : contact.last_message || "Sin mensajes"}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- COMPONENTE CHATWINDOW (Inline) ---
const ChatWindow = ({ socket, user, contact, onBack, onlineUsers, typingInfo }: any) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);

    useEffect(() => {
        socket.emit('request_conversation', contact.phone);
        
        const handleMsg = (msg: Message) => {
            if (msg.recipient === contact.phone || msg.sender === contact.phone) {
                setMessages(prev => [...prev, msg]);
                scrollToBottom();
            }
        };

        socket.on('conversation_history', (hist: Message[]) => { setMessages(hist); scrollToBottom(); });
        socket.on('message', handleMsg);
        
        return () => { socket.off('conversation_history'); socket.off('message', handleMsg); };
    }, [contact.id, socket]);

    const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim()) return;
        socket.emit('chatMessage', { text: input, targetPhone: contact.phone, sender: user.username });
        setInput('');
    };

    const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
        socket.emit('typing', { user: user.username, phone: contact.phone });
        
        // Debounce para dejar de enviar typing si para de escribir (opcional, el server lo maneja con timeout visual)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            // Lógica opcional stop_typing
        }, 2000);
    };

    // Lógica de estado en la cabecera
    const getHeaderStatus = () => {
        const writer = typingInfo[contact.phone];
        if (writer) return { text: `✍️ ${writer} está escribiendo...`, color: 'text-green-600' };
        
        // Aquí podrías comprobar si algún agente está viendo este chat si tuvieras esa data
        return { text: 'Disponible', color: 'text-slate-400' };
    };

    const status = getHeaderStatus();

    return (
        <div className="flex flex-col h-full bg-[#efeae2]">
            {/* Header */}
            <div className="bg-white px-4 py-3 border-b flex items-center gap-3 shadow-sm z-10">
                <button onClick={onBack} className="md:hidden p-2 -ml-2 hover:bg-slate-100 rounded-full"><LogOut className="w-5 h-5 rotate-180" /></button>
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                    {contact.avatar ? <img src={contact.avatar} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-slate-500" />}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        {contact.name}
                        <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">{contact.status || 'Nuevo'}</span>
                    </h3>
                    <p className={`text-xs font-medium transition-colors duration-300 ${status.color}`}>
                        {status.text}
                    </p>
                </div>
                <div className="flex gap-2 text-slate-400">
                    <Phone className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                    <MoreVertical className="w-5 h-5 cursor-pointer hover:text-slate-600" />
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                {messages.map((msg, i) => {
                    const isMe = msg.sender === user.username || msg.sender === 'Agente'; // Ajustar según lógica backend
                    // Si el sender es un número de teléfono, es el cliente. Si es nombre, es agente.
                    // Hack simple: si contiene letras y no es 'system', es agente (nosotros).
                    const isMyMessage = /[a-zA-Z]/.test(msg.sender) && msg.sender === user.username; 
                    const isClient = !isMyMessage && msg.sender === contact.phone;

                    return (
                        <div key={i} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm relative group ${isMyMessage ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'}`}>
                                {!isMyMessage && <p className="text-[10px] font-bold text-orange-600 mb-0.5">{msg.sender}</p>}
                                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                <div className="flex justify-end items-center gap-1 mt-1">
                                    <span className="text-[10px] text-slate-500/80">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    {isMyMessage && <CheckCheck className="w-3 h-3 text-blue-500" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            {/* Input */}
            <div className="bg-white p-3 border-t flex items-end gap-2">
                <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full"><Paperclip className="w-5 h-5" /></button>
                <form onSubmit={handleSend} className="flex-1 bg-slate-100 rounded-2xl flex items-center px-4 py-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={handleTyping}
                        className="flex-1 bg-transparent border-none outline-none text-sm max-h-32"
                        placeholder="Escribe un mensaje..."
                    />
                </form>
                {input.trim() ? (
                    <button onClick={handleSend} className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition shadow-md"><Send className="w-5 h-5" /></button>
                ) : (
                    <button className="p-3 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition"><Mic className="w-5 h-5" /></button>
                )}
            </div>
        </div>
    );
};

// --- HELPER STORAGE ---
const getSavedUser = () => {
    try {
        const saved = localStorage.getItem('chatgorithm_user') || sessionStorage.getItem('chatgorithm_user');
        if (saved) return JSON.parse(saved);
    } catch (e) { console.error(e); }
    return null;
};

// --- APP COMPONENT MAIN ---
function App() {
  const [user, setUser] = useState<UserData | null>(getSavedUser);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [isConnected, setIsConnected] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [typingStatus, setTypingStatus] = useState<{[chatId: string]: string}>({});

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
    if (user) socket.emit('register_presence', user.username);

    const onConnect = () => {
        setIsConnected(true);
        if (user) socket.emit('register_presence', user.username);
        socket.emit('request_config');
    };
    const onDisconnect = () => setIsConnected(false);
    
    // Listeners Estado
    const onOnlineUsersUpdate = (users: string[]) => setOnlineUsers(users);
    const onRemoteTyping = (data: { user: string, phone: string }) => {
        if (data.user !== user?.username) {
            setTypingStatus(prev => ({ ...prev, [data.phone]: data.user }));
            setTimeout(() => {
                setTypingStatus(prev => {
                    if (prev[data.phone] === data.user) {
                        const next = { ...prev }; delete next[data.phone]; return next;
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

    const connectionCheckTimeout = setTimeout(() => setIsConnected(socket.connected), 1500);

    return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
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
      setUser(null); setSelectedContact(null);
      socket.disconnect(); socket.connect();
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

          <main className={`flex-1 flex-col min-w-0 bg-white relative ${selectedContact ? 'flex' : 'hidden md:flex'}`}>
            <div className="flex-1 overflow-hidden relative">
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
                    onBack={() => setSelectedContact(null)}
                    onlineUsers={onlineUsers}
                    typingInfo={typingStatus}
                /> 
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                    <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                    <p>Selecciona un chat</p>
                    <div className="mt-4 text-xs text-slate-400 flex flex-col items-center gap-1">
                        <span>Agentes conectados:</span>
                        {onlineUsers.length > 0 ? (
                            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                                {onlineUsers.map(u => (
                                    <span key={u} className="px-2 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-bold border border-green-100">
                                        {u}
                                    </span>
                                ))}
                            </div>
                        ) : <span className="text-slate-400 italic">Ninguno</span>}
                    </div>
                </div>
              )}
            </div>
          </main>
        </div>
    </div>
  );
}

export default App;