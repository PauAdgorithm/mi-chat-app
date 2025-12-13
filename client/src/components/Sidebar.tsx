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
      try {
          await fetch(`${API_URL}/contacts`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                  phone: newContactPhone,
                  name: newContactName,
                  email: newContactEmail,
                  originPhoneId: selectedAccountId || accounts[0]?.id 
              })
          });
          setShowAddContact(false);
          setNewContactPhone(''); setNewContactName('');
          socket.emit('request_contacts');
      } catch (e) { alert("Error al crear contacto"); }
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
          alert(`Importados ${d.count} contactos.`);
          setShowImport(false);
          socket.emit('request_contacts');
      } catch(e) { alert("Error importando"); }
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

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-white">
        
        {/* HEADER + BOTONES NUEVOS */}
        <div className="flex justify-between items-start mb-4">
            <div className="relative flex-1 mr-2">
                <Smartphone className="absolute left-2 top-2 w-3 h-3 text-slate-400" />
                <select value={selectedAccountId || ''} onChange={(e) => onSelectAccount(e.target.value || null)} className="w-full pl-6 pr-2 py-1 bg-slate-100 border-none rounded text-xs font-bold text-slate-700 appearance-none cursor-pointer">
                    <option value="">Todas las Líneas</option>
                    {accounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.name} ({acc.id.slice(-4)})</option>))}
                </select>
            </div>
            <div className="flex gap-1">
                <button onClick={() => setShowAddContact(true)} className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200" title="Nuevo Contacto"><UserPlus size={14}/></button>
                <button onClick={() => setShowImport(true)} className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200" title="Importar CSV"><Upload size={14}/></button>
            </div>
        </div>

        <div className="relative mb-3"><Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" /><input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm" /></div>
        <div className="flex gap-2 items-center"><div className="flex bg-slate-100 p-1 rounded-lg flex-1"><button onClick={() => setViewScope('all')} className={`flex-1 py-1 text-[10px] font-bold ${viewScope==='all'?'bg-white shadow':''}`}>Todos</button><button onClick={() => setViewScope('mine')} className={`flex-1 py-1 text-[10px] font-bold ${viewScope==='mine'?'bg-white shadow':''}`}>Míos</button></div><button onClick={() => setShowFilters(!showFilters)} className="p-2 border rounded-lg"><FilterIcon className="w-4 h-4" /></button></div>
        
        {showFilters && (
            <div className="mt-3 bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-2">
                 <select onChange={e=>setActiveFilters({...activeFilters, department:e.target.value})} className="text-xs border rounded p-1"><option value="">Depto</option>{availableDepts.map(d=><option key={d} value={d}>{d}</option>)}</select>
                 <select onChange={e=>setActiveFilters({...activeFilters, status:e.target.value})} className="text-xs border rounded p-1"><option value="">Estado</option>{availableStatuses.map(s=><option key={s} value={s}>{s}</option>)}</select>
            </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-gray-100">
            {filteredContacts.map(contact => (
                <li key={contact.id} onClick={() => onSelectContact(contact)} className={`w-full flex items-start gap-3 p-4 hover:bg-white cursor-pointer ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500' : ''}`}>
                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">{getInitial(contact.name, contact.phone)}</div>
                    <div>
                        <div className="font-bold text-sm text-slate-700">{contact.name}</div>
                        <div className="text-xs text-slate-500 truncate w-40">{contact.last_message}</div>
                        {!selectedAccountId && contact.origin_phone_id && <span className="text-[9px] bg-gray-100 px-1 rounded text-gray-400 mt-1 inline-block">Línea: {contact.origin_phone_id.slice(-4)}</span>}
                    </div>
                </li>
            ))}
        </ul>
      </div>

      <div className="bg-slate-50 border-t border-slate-200 p-3 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400">Online ({onlineUsers.length})</span>
          <button onClick={() => setView('calendar')} className="p-1.5 bg-white border rounded hover:text-purple-600"><CalendarIcon className="w-4 h-4"/></button>
      </div>

      {/* MODAL CREAR CONTACTO */}
      {showAddContact && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm">
                  <h3 className="font-bold mb-4">Nuevo Contacto</h3>
                  <form onSubmit={handleCreateContact} className="space-y-3">
                      <input required placeholder="Teléfono (con prefijo)" value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} className="w-full p-2 border rounded"/>
                      <input required placeholder="Nombre" value={newContactName} onChange={e=>setNewContactName(e.target.value)} className="w-full p-2 border rounded"/>
                      <input placeholder="Email (Opcional)" value={newContactEmail} onChange={e=>setNewContactEmail(e.target.value)} className="w-full p-2 border rounded"/>
                      <div className="flex gap-2 pt-2">
                          <button type="button" onClick={()=>setShowAddContact(false)} className="flex-1 py-2 bg-gray-100 rounded">Cancelar</button>
                          <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded">Crear</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* MODAL IMPORTAR */}
      {showImport && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm text-center">
                  <FileSpreadsheet className="mx-auto text-green-500 mb-2" size={40} />
                  <h3 className="font-bold mb-2">Importar Contactos (CSV)</h3>
                  <p className="text-xs text-slate-400 mb-4">Formato: Teléfono, Nombre, Email</p>
                  <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} className="mb-4 text-sm" />
                  <div className="flex gap-2">
                      <button onClick={()=>setShowImport(false)} className="flex-1 py-2 bg-gray-100 rounded">Cancelar</button>
                      <button onClick={handleImport} disabled={!importFile || importing} className="flex-1 py-2 bg-green-600 text-white rounded">{importing ? 'Subiendo...' : 'Importar'}</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}