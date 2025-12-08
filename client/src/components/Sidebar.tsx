import { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Search, 
  RefreshCw, 
  UserCheck, 
  Briefcase, 
  Filter, 
  User, 
  ChevronDown, 
  X, 
  Hash,
  CheckCircle 
} from 'lucide-react';

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
  signup_date?: string; 
  tags?: string[];
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
  setView: (view: 'chat' | 'settings' | 'calendar') => void;
}

// Tipos de filtro
type ViewScope = 'all' | 'mine' | 'unassigned';

// Helper para limpiar teléfonos
const normalizePhone = (phone: string) => {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
};

export function Sidebar({ user, socket, onSelectContact, selectedContactId, isConnected = true, onlineUsers = [], typingStatus = {}, setView }: SidebarProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- ESTADOS DE FILTRO (Corregido el orden) ---
  const [viewScope, setViewScope] = useState<ViewScope>('all'); // Pestaña principal
  const [showFilters, setShowFilters] = useState(false); // Mostrar panel de filtros
  
  // Filtros Avanzados Seleccionados
  const [activeFilters, setActiveFilters] = useState({
      department: '',
      status: '',
      tag: '',
      agent: ''
  });
  
  // DATOS PARA LISTAS DESPLEGABLES
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

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
    
    // Aquí procesamos TODAS las configuraciones (Deptos, Estados, Tags)
    const handleConfigList = (list: ConfigItem[]) => {
        setAvailableDepts(list.filter(i => i.type === 'Department').map(i => i.name));
        setAvailableStatuses(list.filter(i => i.type === 'Status').map(i => i.name));
        setAvailableTags(list.filter(i => i.type === 'Tag').map(i => i.name));
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

  // --- LÓGICA DE FILTRADO COMBINADO ---
  const filteredContacts = contacts.filter(c => {
      // 1. Buscador (Texto)
      const matchesSearch = (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery);
      if (!matchesSearch) return false;

      // 2. Vista Principal (Tabs) - AHORA viewScope YA ESTÁ DEFINIDO
      if (viewScope === 'mine' && c.assigned_to !== user.username) return false;
      if (viewScope === 'unassigned' && c.assigned_to) return false;

      // 3. Filtros Avanzados (Dropdowns)
      if (activeFilters.department && c.department !== activeFilters.department) return false;
      if (activeFilters.status && c.status !== activeFilters.status) return false;
      if (activeFilters.agent && c.assigned_to !== activeFilters.agent) return false;
      
      // Filtrado por Etiquetas (si tiene la etiqueta seleccionada)
      if (activeFilters.tag) {
          if (!c.tags || !c.tags.includes(activeFilters.tag)) return false;
      }

      return true;
  });

  const updateFilter = (key: keyof typeof activeFilters, value: string) => {
      setActiveFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v !== '');

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      
      {/* CABECERA DEL SIDEBAR */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center">
            Bandeja de Entrada
            {!isConnected && <span className="text-[10px] text-red-500 animate-pulse">● Sin conexión</span>}
        </h2>
        
        {/* BUSCADOR */}
        <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input type="text" placeholder="Buscar chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>

        {/* TABS Y BOTÓN DE FILTROS */}
        <div className="flex gap-2 items-center">
            <div className="flex bg-slate-100 p-1 rounded-lg flex-1">
                <button onClick={() => setViewScope('all')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${viewScope === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Todos</button>
                <button onClick={() => setViewScope('mine')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${viewScope === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Míos</button>
                <button onClick={() => setViewScope('unassigned')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${viewScope === 'unassigned' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Libres</button>
            </div>
            
            <button 
                onClick={() => setShowFilters(!showFilters)} 
                className={`p-2 rounded-lg transition-all border ${showFilters || hasActiveFilters ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                title="Filtros Avanzados"
            >
                {hasActiveFilters ? <Filter className="w-4 h-4 fill-current" /> : <Filter className="w-4 h-4" />}
            </button>
        </div>

        {/* PANEL DE FILTROS AVANZADOS (DESPLEGABLE) */}
        {showFilters && (
            <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Filtrar por:</span>
                    {hasActiveFilters && <button onClick={() => setActiveFilters({ department: '', status: '', tag: '', agent: '' })} className="text-[10px] text-red-500 hover:underline">Borrar filtros</button>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {/* Depto */}
                    <div className="relative">
                        <select value={activeFilters.department} onChange={(e) => updateFilter('department', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Departamento</option>
                            {availableDepts.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <Briefcase className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

                    {/* Estado */}
                    <div className="relative">
                        <select value={activeFilters.status} onChange={(e) => updateFilter('status', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Estado</option>
                            {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <CheckCircle className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

                    {/* Etiqueta */}
                    <div className="relative">
                        <select value={activeFilters.tag} onChange={(e) => updateFilter('tag', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Etiqueta</option>
                            {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <Hash className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

                    {/* Agente */}
                    <div className="relative">
                        <select value={activeFilters.agent} onChange={(e) => updateFilter('agent', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Agente</option>
                            {availableAgents.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                        </select>
                        <User className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>
                </div>
            </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
                <div className={`p-3 rounded-full mb-2 ${isConnected ? 'bg-slate-100' : 'bg-red-50'}`}>
                    {hasActiveFilters ? <Filter className="w-5 h-5 text-slate-400" /> : <RefreshCw className={`w-5 h-5 ${isConnected ? 'animate-spin text-blue-400' : 'text-red-400'}`} />}
                </div>
                <p>{isConnected ? (hasActiveFilters ? "No hay chats con estos filtros" : "Cargando chats...") : "Esperando conexión..."}</p>
            </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredContacts.map((contact) => {
              const isTyping = typingStatus[contact.phone];
              const unread = unreadCounts[normalizePhone(contact.phone)] || 0;
              const isSelected = selectedContactId === contact.id;

              return (
                <li key={contact.id || Math.random()}>
                  <button onClick={() => onSelectContact(contact)} className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white text-left group ${isSelected ? 'bg-white border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'}`}>
                    
                    <div className="relative">
                        <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-transform group-hover:scale-105 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${!contact.avatar ? (isSelected ? 'bg-blue-500' : 'bg-slate-400') : ''}`}>
                          {contact.avatar ? <img src={contact.avatar} alt="Avatar" className="w-full h-full object-cover" /> : getInitial(contact.name, contact.phone)}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                          <span className={`text-sm font-bold truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{String(contact.name || contact.phone || "Desconocido")}</span>
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

                      <div className="flex gap-1 mt-2 flex-wrap items-center">
                          {contact.status === 'Nuevo' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-md tracking-wide">NUEVO</span>}
                          
                          {/* TAGS EN LA LISTA */}
                          {contact.tags && contact.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                                <Hash size={8} /> {tag}
                              </span>
                          ))}
                          {contact.tags && contact.tags.length > 2 && <span className="text-[9px] text-slate-400">+{contact.tags.length - 2}</span>}
                          
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