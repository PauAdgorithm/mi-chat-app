import { useState, useEffect, useRef } from 'react';
import { Users, Search, RefreshCw, UserCheck, Briefcase } from 'lucide-react';

export interface Contact {
  id: string;
  phone: string;
  name?: string;
  status?: string;
  department?: string;
  assigned_to?: string;
  last_message?: any;
  last_message_time?: string;
  avatar?: string;
}

interface SidebarProps {
  user: { username: string, role: string };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
  isConnected?: boolean;
  onlineUsers: string[];
  typingStatus: { [chatId: string]: string };
}

type FilterType = 'all' | 'mine' | 'dept' | 'unassigned';

export function Sidebar({ user, socket, onSelectContact, selectedContactId, isConnected = true, onlineUsers = [], typingStatus = {} }: SidebarProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (socket && isConnected) {
        console.log("🔄 Sidebar: Socket activo, pidiendo contactos...");
        socket.emit('request_contacts');
    }
  }, [socket, isConnected]);

  // Debug: Ver usuarios online recibidos en Sidebar
  useEffect(() => {
    if (onlineUsers.length > 0) {
        console.log("👥 Sidebar recibió usuarios online:", onlineUsers);
    }
  }, [onlineUsers]);

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
    if (Notification.permission !== 'granted') Notification.requestPermission();

    if (!socket) return;

    const handleContactsUpdate = (newContacts: any) => {
      if (Array.isArray(newContacts)) setContacts(newContacts);
    };

    socket.on('contacts_update', handleContactsUpdate);
    socket.on('contact_updated_notification', () => socket.emit('request_contacts'));

    const handleNewMessageNotification = (msg: any) => {
        const isMe = msg.sender === 'Agente' || msg.sender === user.username;
        if (!isMe) {
            audioRef.current?.play().catch(() => {});
            if (Notification.permission === 'granted' && document.hidden) {
                new Notification(`Mensaje de ${msg.sender}`, { body: msg.text, icon: '/vite.svg' });
            }
        }
        socket.emit('request_contacts');
    };

    socket.on('message', handleNewMessageNotification);

    const interval = setInterval(() => {
        if(isConnected) socket.emit('request_contacts');
    }, 10000);

    return () => {
      socket.off('contacts_update', handleContactsUpdate);
      socket.off('contact_updated_notification');
      socket.off('message', handleNewMessageNotification);
      clearInterval(interval);
    };
  }, [socket, user.username, isConnected]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try { return new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); } catch { return ''; }
  };

  const getInitial = (name?: any, phone?: any) => String(name || phone || "?").charAt(0).toUpperCase();

  const cleanMessagePreview = (msg: any) => {
    if (!msg) return "Haz clic para ver";
    if (typeof msg === 'string') return msg.includes('[object Object]') ? "Mensaje" : msg;
    if (typeof msg === 'object') return "Mensaje";
    return String(msg);
  };

  const filteredContacts = contacts.filter(c => {
      const matchesSearch = (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery);
      if (!matchesSearch) return false;
      if (filter === 'all') return true;
      if (filter === 'mine') return c.assigned_to === user.username || c.department === user.role;
      if (filter === 'dept') return c.department === user.role;
      if (filter === 'unassigned') return !c.assigned_to && !c.department;
      return true;
  });

  // HELPER MEJORADO: Coincidencia flexible (contiene o es igual)
  const checkOnline = (contact: Contact) => {
      if (!onlineUsers || onlineUsers.length === 0) return false;
      
      const cName = (contact.name || "").toLowerCase().trim();
      const cPhone = (contact.phone || "").replace(/\D/g, ""); // Solo números
      
      return onlineUsers.some(u => {
          const userLogged = u.toLowerCase().trim();
          
          // 1. Coincidencia por teléfono (si el agente se loguea con móvil)
          if (cPhone && userLogged === cPhone) return true;

          // 2. Coincidencia por nombre (Flexible)
          if (cName) {
              // Exacta: "paco" === "paco"
              if (userLogged === cName) return true;
              // Parcial: "paco el talleres" incluye "paco"
              if (cName.length > 2 && (userLogged.includes(cName) || cName.includes(userLogged))) return true;
          }
          
          return false;
      });
  };

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center">
            Bandeja de Entrada
            {!isConnected && <span className="text-[10px] text-red-500 animate-pulse">● Sin conexión</span>}
        </h2>
        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input type="text" placeholder="Buscar chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
        <div className="flex gap-1 mt-3 p-1 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar">
            <button onClick={() => setFilter('all')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Todos</button>
            <button onClick={() => setFilter('mine')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center justify-center gap-1 ${filter === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><UserCheck className="w-3 h-3" /> Míos</button>
            <button onClick={() => setFilter('unassigned')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === 'unassigned' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sin Asignar</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
                <div className={`p-3 rounded-full mb-2 ${isConnected ? 'bg-slate-100' : 'bg-red-50'}`}>
                    <RefreshCw className={`w-5 h-5 ${isConnected ? 'animate-spin text-blue-400' : 'text-red-400'}`} />
                </div>
                <p>{isConnected ? "Cargando chats..." : "Esperando conexión..."}</p>
            </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredContacts.map((contact) => {
              // --- LÓGICA VISUAL ---
              const isTyping = typingStatus[contact.phone];
              // Usamos la nueva verificación flexible
              const isOnline = checkOnline(contact);

              return (
                <li key={contact.id || Math.random()}>
                  <button onClick={() => onSelectContact(contact)} className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white text-left group ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'}`}>
                    
                    {/* AVATAR + PUNTO VERDE */}
                    <div className="relative">
                        <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-transform group-hover:scale-105 ${selectedContactId === contact.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${!contact.avatar ? (selectedContactId === contact.id ? 'bg-blue-500' : 'bg-slate-400') : ''}`}>
                          {contact.avatar ? <img src={contact.avatar} alt="Avatar" className="w-full h-full object-cover" /> : getInitial(contact.name, contact.phone)}
                        </div>
                        {/* Indicador Online */}
                        {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full ring-2 ring-white z-10"></span>}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1"><span className={`text-sm font-bold truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-700'}`}>{String(contact.name || contact.phone || "Desconocido")}</span><span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">{formatTime(contact.last_message_time)}</span></div>
                      
                      <p className={`text-xs truncate h-4 ${isTyping ? 'text-green-600 font-bold animate-pulse' : 'text-slate-500'}`}>
                          {isTyping ? "✍️ Escribiendo..." : cleanMessagePreview(contact.last_message)}
                      </p>

                      <div className="flex gap-1 mt-2 flex-wrap">
                          {contact.status === 'Nuevo' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-md tracking-wide">NUEVO</span>}
                          {contact.department && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] font-bold rounded-md border border-purple-100 uppercase tracking-wide flex items-center gap-1">{String(contact.department)}</span>}
                          {contact.assigned_to && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-medium rounded border border-slate-200 flex items-center gap-1"><UserCheck className="w-3 h-3" /> {contact.assigned_to}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}