import { useState, useEffect, useRef } from 'react';
import { Users, Search, RefreshCw, UserCheck, Briefcase, Filter, User, ChevronDown, X } from 'lucide-react';

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
  email?: string;
  address?: string;
  notes?: string;
  signup_date?: string; // AÑADIDO
}

// Interfaces para los desplegables
interface Agent { id: string; name: string; }
interface ConfigItem { id: string; name: string; type: string; }

interface SidebarProps {
  user: { username: string, role: string };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
  isConnected?: boolean;
  onlineUsers: string[];
  typingStatus: { [chatId: string]: string };
}

// Tipos de filtro ampliados
type FilterType = 'all' | 'mine' | 'unassigned' | 'agent' | 'department';

// Helper para limpiar teléfonos
const normalizePhone = (phone: string) => {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
};

export function Sidebar({ user, socket, onSelectContact, selectedContactId, isConnected = true, onlineUsers = [], typingStatus = {} }: SidebarProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // ESTADOS DE FILTRO
  const [filter, setFilter] = useState<FilterType>('all');
  const [filterValue, setFilterValue] = useState<string>(''); 
  
  // DATOS PARA LISTAS DESPLEGABLES
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);

  const [unreadCounts, setUnreadCounts] = useState<{ [phone: string]: number }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Carga inicial de datos
  useEffect(() => {
    if (socket && isConnected) {
        socket.emit('request_contacts');
        socket.emit('request_agents'); 
        socket.emit('request_config'); 
    }
  }, [socket, isConnected]);

  // Limpiar contador al entrar en un chat
  useEffect(() => {
      if (selectedContactId) {
          const contact = contacts.find(c => c.id === selectedContactId);
          if (contact) {
              const cleanP = normalizePhone(contact.phone);
              setUnreadCounts(prev => {
                  const newCounts = { ...prev };
                  delete newCounts[cleanP];
                  return newCounts;
              });
          }
      }
  }, [selectedContactId, contacts]);

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
    if (Notification.permission !== 'granted') Notification.requestPermission();

    if (!socket) return;

    // --- HANDLERS ---
    const handleContactsUpdate = (newContacts: any) => {
      if (Array.isArray(newContacts)) setContacts(newContacts);
    };

    const handleAgentsList = (list: Agent[]) => setAvailableAgents(list);
    
    const handleConfigList = (list: ConfigItem[]) => {
        const depts = list.filter(i => i.type === 'Department').map(i => i.name);
        setAvailableDepts(depts);
    };

    // --- LISTENERS ---
    socket.on('contacts_update', handleContactsUpdate);
    socket.on('agents_list', handleAgentsList);     
    socket.on('config_list', handleConfigList);     
    socket.on('contact_updated_notification', () => socket.emit('request_contacts'));

    const handleNewMessageNotification = (msg: any) => {
        const isMe = msg.sender === 'Agente' || msg.sender === user.username;
        if (!isMe) {
            audioRef.current?.play().catch(() => {});
            const senderClean = normalizePhone(msg.sender);
            const currentContact = contacts.find(c => c.id === selectedContactId);
            const currentContactPhoneClean = currentContact ? normalizePhone(currentContact.phone) : null;

            if (senderClean !== currentContactPhoneClean) {
                setUnreadCounts(prev => ({ ...prev, [senderClean]: (prev[senderClean] || 0) + 1 }));
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
      socket.off('agents_list', handleAgentsList);
      socket.off('config_list', handleConfigList);
      socket.off('contact_updated_notification');
      socket.off('message', handleNewMessageNotification);
      clearInterval(interval);
    };
  }, [socket, user.username, isConnected, selectedContactId, contacts]);

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
      if (filter === 'mine') return c.assigned_to === user.username;
      if (filter === 'unassigned') return !c.assigned_to;
      
      if (filter === 'agent') return c.assigned_to === filterValue;
      if (filter === 'department') return c.department === filterValue;

      return true;
  });

  const handleFilterClick = (type: FilterType) => {
      if (filter === type && (type === 'all' || type === 'mine' || type === 'unassigned')) return; 
      setFilter(type);
      if (type === 'all' || type === 'mine' || type === 'unassigned') setFilterValue('');
      if (type === 'agent' && availableAgents.length > 0) setFilterValue(availableAgents[0].name);
      if (type === 'department' && availableDepts.length > 0) setFilterValue(availableDepts[0]);
  };

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      
      {/* CABECERA DEL SIDEBAR */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center">
            Bandeja de Entrada
            {!isConnected && <span className="text-[10px] text-red-500 animate-pulse">● Sin conexión</span>}
        </h2>
        
        <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input type="text" placeholder="Buscar chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        {/* BOTONES DE FILTRO */}
        <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
            <button onClick={() => handleFilterClick('all')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Todos</button>
            <button onClick={() => handleFilterClick('mine')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all flex items-center gap-1 ${filter === 'mine' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><UserCheck className="w-3 h-3" /> Míos</button>
            <button onClick={() => handleFilterClick('unassigned')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${filter === 'unassigned' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Libres</button>
            
            <button onClick={() => handleFilterClick('agent')} className={`flex-shrink-0 px-2 py-1.5 rounded-lg transition-all ${filter === 'agent' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`} title="Por Agente">
                <User className="w-4 h-4" />
            </button>
            <button onClick={() => handleFilterClick('department')} className={`flex-shrink-0 px-2 py-1.5 rounded-lg transition-all ${filter === 'department' ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`} title="Por Departamento">
                <Briefcase className="w-4 h-4" />
            </button>
        </div>

        {/* SELECTOR SECUNDARIO */}
        {(filter === 'agent' || filter === 'department') && (
            <div className="mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="relative">
                    <select 
                        value={filterValue} 
                        onChange={(e) => setFilterValue(e.target.value)} 
                        className={`w-full appearance-none pl-3 pr-8 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border-none focus:ring-0 cursor-pointer ${filter === 'agent' ? 'bg-purple-50 text-purple-700' : 'bg-pink-50 text-pink-700'}`}
                    >
                        {filter === 'agent' ? (
                            availableAgents.length > 0 ? availableAgents.map(a => <option key={a.id} value={a.name}>{a.name}</option>) : <option>Sin Agentes</option>
                        ) : (
                            availableDepts.length > 0 ? availableDepts.map(d => <option key={d} value={d}>{d}</option>) : <option>Sin Dptos</option>
                        )}
                    </select>
                    <ChevronDown className={`absolute right-2 top-2.5 w-4 h-4 ${filter === 'agent' ? 'text-purple-400' : 'text-pink-400'}`} />
                    
                    <button onClick={() => setFilter('all')} className="absolute -right-2 -top-8 bg-slate-200 rounded-full p-1 text-slate-500 hover:bg-slate-300 md:hidden">
                        <X className="w-3 h-3"/>
                    </button>
                </div>
            </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
                <div className={`p-3 rounded-full mb-2 ${isConnected ? 'bg-slate-100' : 'bg-red-50'}`}>
                    {filter === 'agent' || filter === 'department' ? <Filter className="w-5 h-5 text-slate-400" /> : <RefreshCw className={`w-5 h-5 ${isConnected ? 'animate-spin text-blue-400' : 'text-red-400'}`} />}
                </div>
                <p>{isConnected ? (filter === 'all' ? "Cargando chats..." : "No hay chats con este filtro") : "Esperando conexión..."}</p>
            </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredContacts.map((contact) => {
              const isTyping = typingStatus[contact.phone];
              const unread = unreadCounts[normalizePhone(contact.phone)] || 0;

              return (
                <li key={contact.id || Math.random()}>
                  <button onClick={() => onSelectContact(contact)} className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white text-left group ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'}`}>
                    
                    <div className="relative">
                        <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-transform group-hover:scale-105 ${selectedContactId === contact.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${!contact.avatar ? (selectedContactId === contact.id ? 'bg-blue-500' : 'bg-slate-400') : ''}`}>
                          {contact.avatar ? <img src={contact.avatar} alt="Avatar" className="w-full h-full object-cover" /> : getInitial(contact.name, contact.phone)}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                          <span className={`text-sm font-bold truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-700'}`}>{String(contact.name || contact.phone || "Desconocido")}</span>
                          <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">{formatTime(contact.last_message_time)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center w-full">
                          <p className={`text-xs truncate h-4 flex-1 pr-2 ${isTyping ? 'text-green-600 font-bold animate-pulse' : 'text-slate-500'}`}>
                              {isTyping ? "✍️ Escribiendo..." : cleanMessagePreview(contact.last_message)}
                          </p>
                          
                          {unread > 0 && (
                              <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                                  {unread > 99 ? '99+' : unread}
                              </span>
                          )}
                      </div>

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

      {onlineUsers.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 p-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Equipo Online ({onlineUsers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
                {onlineUsers.map((agentName, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-full shadow-sm group hover:border-blue-300 transition-colors cursor-default">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        <span className="text-[10px] font-bold text-slate-600 group-hover:text-blue-600 max-w-[80px] truncate">
                            {agentName === user.username ? 'Tú' : agentName}
                        </span>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
}