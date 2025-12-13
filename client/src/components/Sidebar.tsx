import { useState, useEffect, useRef } from 'react';
import { 
  Users, Search, RefreshCw, UserCheck, Briefcase, Filter as FilterIcon, 
  User, ChevronDown, X, Hash, CheckCircle, Calendar as CalendarIcon, 
  Smartphone, UserPlus, Upload, FileSpreadsheet
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
  origin_phone_id?: string;
}

interface Agent { id: string; name: string; }
interface ConfigItem { id: string; name: string; type: string; }

interface SidebarProps {
  user: { username: string, role: string; preferences?: any };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
  isConnected?: boolean;
  onlineUsers: string[];
  typingStatus: { [chatId: string]: string };
  setView: (view: 'chat' | 'settings' | 'calendar') => void;
  
  // Props para Multi-Cuenta
  selectedAccountId: string | null;
  onSelectAccount: (id: string | null) => void;
}

type ViewScope = 'all' | 'mine' | 'unassigned';

const normalizePhone = (phone: string) => {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
};

const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
};

const getInitial = (name?: any, phone?: any) => String(name || phone || "?").charAt(0).toUpperCase();

const cleanMessagePreview = (msg: any) => {
    if (!msg) return "Haz clic para ver";
    if (typeof msg === 'string') return msg.includes('[object Object]') ? "Mensaje" : msg;
    if (typeof msg === 'object') return "Mensaje";
    return String(msg);
};

export function Sidebar({ user, socket, onSelectContact, selectedContactId, isConnected = true, onlineUsers = [], typingStatus = {}, setView, selectedAccountId, onSelectAccount }: SidebarProps) {
  
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [viewScope, setViewScope] = useState<ViewScope>('all'); 
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [accounts, setAccounts] = useState<{id:string, name:string}[]>([]); 
  
  // Estados para Modales Nuevos
  const [showAddContact, setShowAddContact] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Formulario Nuevo Contacto
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Importación
  const [importFile, setImportFile] = useState<File|null>(null);
  const [importing, setImporting] = useState(false);
  
  const [activeFilters, setActiveFilters] = useState({ department: '', status: '', tag: '', agent: '' });
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [phone: string]: number }>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (socket && isConnected) {
        socket.emit('request_contacts');
        socket.emit('request_agents'); 
        socket.emit('request_config'); 
        fetch(`${API_URL}/accounts`).then(r=>r.json()).then(setAccounts).catch(()=>{});
    }
  }, [socket, isConnected]);

  useEffect(() => {
      if (selectedContactId) {
          const contact = contacts.find(c => c.id === selectedContactId);
          if (contact) {
              const cleanP = normalizePhone(contact.phone);
              setUnreadCounts(prev => { const n = { ...prev }; delete n[cleanP]; return n; });
          }
      }
  }, [selectedContactId, contacts]);

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
    if (Notification.permission !== 'granted') Notification.requestPermission();
    if (!socket) return;

    const handleContactsUpdate = (d: any) => { if(Array.isArray(d)) setContacts(d); };
    const handleAgents = (l: any) => setAvailableAgents(l);
    const handleConfig = (l: any[]) => {
        setAvailableDepts(l.filter(i=>i.type==='Department').map(i=>i.name));
        setAvailableStatuses(l.filter(i=>i.type==='Status').map(i=>i.name));
        setAvailableTags(l.filter(i=>i.type==='Tag').map(i=>i.name));
    };

    socket.on('contacts_update', handleContactsUpdate);
    socket.on('agents_list', handleAgents);     
    socket.on('config_list', handleConfig);     
    socket.on('contact_updated_notification', () => socket.emit('request_contacts'));
    socket.on('message', (msg: any) => {
        const isMe = msg.sender === 'Agente' || msg.sender === user.username;
        if (!isMe) {
            let shouldNotify = true;
            const prefs = user.preferences || {};
            const contact = contacts.find(c => normalizePhone(c.phone) === normalizePhone(msg.sender));
            
            if (prefs.departments && prefs.departments.length > 0) {
                 if (contact && contact.department && !prefs.departments.includes(contact.department)) shouldNotify = false; 
            }
            if (prefs.phoneIds && prefs.phoneIds.length > 0) {
                if (msg.origin_phone_id && !prefs.phoneIds.includes(msg.origin_phone_id)) shouldNotify = false;
            }
            const isNewLead = contact?.status === 'Nuevo';
            if (isNewLead) {
                if (prefs.notifyNewLeads === false) shouldNotify = false;
                else shouldNotify = true;
            }

            if (shouldNotify) audioRef.current?.play().catch(() => {});

            const senderClean = normalizePhone(msg.sender);
            const currentContact = contacts.find(c => c.id === selectedContactId);
            const currentContactPhoneClean = currentContact ? normalizePhone(currentContact.phone) : null;
            if (senderClean !== currentContactPhoneClean) setUnreadCounts(prev => ({ ...prev, [senderClean]: (prev[senderClean] || 0) + 1 }));
        }
        socket.emit('request_contacts');
    });

    const interval = setInterval(() => { if(isConnected) socket.emit('request_contacts'); }, 10000);

    return () => {
      socket.off('contacts_update', handleContactsUpdate);
      socket.off('agents_list', handleAgents);
      socket.off('config_list', handleConfig);
      socket.off('contact_updated_notification');
      socket.off('message');
      clearInterval(interval);
    };
  }, [socket, user.username, isConnected, selectedContactId, contacts, user.preferences]);

  const handleCreateContact = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Limpieza y validación previa de formato
      const cleanInput = newContactPhone.replace(/\D/g, '');

      if (cleanInput.length < 10 || cleanInput.length > 15) {
          alert("El número debe tener entre 10 y 15 dígitos numéricos (incluyendo código de país). Ejemplo: 34600123456");
          return;
      }
      
      setIsCreating(true);

      try {
          const res = await fetch(`${API_URL}/contacts`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  phone: cleanInput, // Enviamos el limpio
                  name: newContactName,
                  email: newContactEmail,
                  originPhoneId: selectedAccountId || accounts[0]?.id 
              })
          });
          const data = await res.json();
          
          if (res.ok) {
              setShowAddContact(false);
              setNewContactPhone(''); 
              setNewContactName('');
              setNewContactEmail('');
              socket.emit('request_contacts');
              alert("Contacto guardado correctamente."); // Mensaje realista
          } else {
              // Mostramos el error que viene del servidor (ej: si Meta dice que no existe)
              alert("❌ Error: " + (data.error || "No se pudo crear. Verifica que el número tenga WhatsApp."));
          }
      } catch (e) { alert("Error de conexión al crear contacto"); }
      finally { setIsCreating(false); }
  };

  const handleImport = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!importFile) return;
      setImporting(true);
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('originPhoneId', selectedAccountId || accounts[0]?.id);
      
      try {
          const res = await fetch(`${API_URL}/contacts/import`, { method: 'POST', body: formData });
          const d = await res.json();
          if (d.success) {
              alert(`Importación completada: ${d.count} contactos.`);
              setShowImport(false);
              setImportFile(null);
              socket.emit('request_contacts');
          } else { alert("Error: " + d.error); }
      } catch(e) { alert("Error de conexión"); }
      finally { setImporting(false); }
  };

  const filteredContacts = contacts.filter(c => {
      if (selectedAccountId && c.origin_phone_id && c.origin_phone_id !== selectedAccountId) return false;
      const matchesSearch = (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery);
      if (!matchesSearch) return false;
      if (viewScope === 'mine' && c.assigned_to !== user.username) return false;
      if (viewScope === 'unassigned' && c.assigned_to) return false;
      if (activeFilters.department && c.department !== activeFilters.department) return false;
      if (activeFilters.status && c.status !== activeFilters.status) return false;
      if (activeFilters.agent && c.assigned_to !== activeFilters.agent) return false;
      if (activeFilters.tag && (!c.tags || !c.tags.includes(activeFilters.tag))) return false;
      return true;
  });

  const updateFilter = (key: keyof typeof activeFilters, value: string) => {
      setActiveFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v !== '');

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      
      {/* HEADER + BOTONES NUEVOS */}
      <div className="p-4 border-b border-gray-200 bg-white">
        
        {/* SELECTOR DE LÍNEA */}
        <div className="mb-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block">
                Línea Activa
            </label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Smartphone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <select 
                        value={selectedAccountId || ''} 
                        onChange={(e) => onSelectAccount(e.target.value || null)}
                        className="w-full pl-9 pr-8 py-2 bg-slate-100 border-none rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                    >
                        <option value="">Todas las Líneas</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} ({acc.id.slice(-4)})</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
                {/* BOTONES ACCIÓN RÁPIDA */}
                <div className="flex gap-1">
                    <button onClick={() => setShowAddContact(true)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition shadow-sm border border-blue-100" title="Nuevo Contacto">
                        <UserPlus size={18}/>
                    </button>
                    <button onClick={() => setShowImport(true)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition shadow-sm border border-green-100" title="Importar CSV">
                        <Upload size={18}/>
                    </button>
                </div>
            </div>
        </div>

        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center">
            Bandeja de Entrada
            {!isConnected && <span className="text-[10px] text-red-500 animate-pulse font-bold flex items-center gap-1">● Sin conexión</span>}
        </h2>
        
        {/* BUSCADOR */}
        <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input 
                type="text" 
                placeholder="Buscar chat..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400" 
            />
        </div>

        {/* TABS DE FILTRO */}
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
                {hasActiveFilters ? <FilterIcon className="w-4 h-4 fill-current" /> : <FilterIcon className="w-4 h-4" />}
            </button>
        </div>

        {/* PANEL DESPLEGABLE DE FILTROS */}
        {showFilters && (
            <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Filtrar por:</span>
                    {hasActiveFilters && <button onClick={() => setActiveFilters({ department: '', status: '', tag: '', agent: '' })} className="text-[10px] text-red-500 hover:underline">Borrar filtros</button>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                        <select value={activeFilters.department} onChange={(e) => updateFilter('department', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Depto</option>
                            {availableDepts.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <Briefcase className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

                    <div className="relative">
                        <select value={activeFilters.status} onChange={(e) => updateFilter('status', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Estado</option>
                            {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <CheckCircle className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

                    <div className="relative">
                        <select value={activeFilters.tag} onChange={(e) => updateFilter('tag', e.target.value)} className="w-full appearance-none pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="">Etiqueta</option>
                            {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <Hash className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                    </div>

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
      
      {/* LISTA CONTACTOS */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
                <div className={`p-3 rounded-full mb-2 ${isConnected ? 'bg-slate-100' : 'bg-red-50'}`}>
                    {hasActiveFilters ? <FilterIcon className="w-5 h-5 text-slate-400" /> : <RefreshCw className={`w-5 h-5 ${isConnected ? 'animate-spin text-blue-400' : 'text-red-400'}`} />}
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
                    
                    {/* AVATAR */}
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
                          
                          {/* TAGS */}
                          {contact.tags && contact.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                                <Hash size={8} /> {tag}
                              </span>
                          ))}
                          {contact.tags && contact.tags.length > 2 && <span className="text-[9px] text-slate-400">+{contact.tags.length - 2}</span>}
                          
                          {/* DEPARTAMENTO */}
                          {contact.department && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] font-bold rounded-md border border-purple-100 uppercase tracking-wide flex items-center gap-1">{String(contact.department)}</span>}
                          
                          {/* ASIGNADO */}
                          {contact.assigned_to && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-medium rounded border border-slate-200 flex items-center gap-1"><UserCheck className="w-3 h-3" /> {contact.assigned_to}</span>}
                          
                          {/* ORIGEN (Solo si vemos todo) */}
                          {!selectedAccountId && contact.origin_phone_id && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-mono rounded border border-gray-200">
                                  #{contact.origin_phone_id.slice(-4)}
                              </span>
                          )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* FOOTER: Online + Calendario */}
      <div className="bg-slate-50 border-t border-slate-200 p-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Online ({onlineUsers.length})
            </h3>
            <button 
                onClick={() => setView('calendar')} 
                className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-400 hover:text-purple-600 hover:border-purple-200 transition shadow-sm"
                title="Ver Agenda"
            >
                <CalendarIcon className="w-4 h-4" />
            </button>
          </div>
            
          <div className="flex flex-wrap gap-2 mb-2">
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

      {/* MODAL CREAR CONTACTO */}
      {showAddContact && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl">
                  <h3 className="font-bold mb-4 text-slate-800 text-lg">Nuevo Contacto</h3>
                  <form onSubmit={handleCreateContact} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Teléfono</label>
                          <input required placeholder="Ej: 34600123456" value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Nombre</label>
                          <input required placeholder="Ej: Juan Pérez" value={newContactName} onChange={e=>setNewContactName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Email (Opcional)</label>
                          <input placeholder="juan@email.com" value={newContactEmail} onChange={e=>setNewContactEmail(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
                      </div>
                      <div className="flex gap-2 pt-2">
                          <button type="button" onClick={()=>setShowAddContact(false)} className="flex-1 py-3 bg-gray-100 text-slate-600 font-bold rounded-xl hover:bg-gray-200 transition">Cancelar</button>
                          <button type="submit" disabled={isCreating} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition disabled:opacity-50">
                              {isCreating ? 'Guardando...' : 'Crear'}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* MODAL IMPORTAR */}
      {showImport && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl">
                  <div className="bg-green-50 p-4 rounded-full w-fit mx-auto mb-4">
                      <FileSpreadsheet className="text-green-600" size={32} />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-2">Importar Contactos (CSV)</h3>
                  <p className="text-xs text-slate-400 mb-6 bg-slate-50 p-2 rounded-lg border border-slate-200 mx-auto w-fit">
                      Formato requerido: <code>Teléfono, Nombre, Email</code>
                  </p>
                  
                  <div className="relative mb-6">
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={e => setImportFile(e.target.files?.[0] || null)} 
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer" 
                      />
                  </div>

                  <div className="flex gap-2">
                      <button onClick={()=>setShowImport(false)} className="flex-1 py-3 bg-gray-100 text-slate-600 font-bold rounded-xl hover:bg-gray-200 transition">Cancelar</button>
                      <button onClick={handleImport} disabled={!importFile || importing} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg disabled:opacity-50 transition">
                          {importing ? 'Subiendo...' : 'Importar'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}