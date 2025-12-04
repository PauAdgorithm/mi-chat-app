import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, UserCheck, Briefcase } from 'lucide-react';

export interface Contact {
  id: string;
  phone: string;
  name?: string;
  status?: string;
  department?: string;
  assigned_to?: string;
  last_message?: string;
  last_message_time?: string;
  avatar?: string;
}

interface SidebarProps {
  user: { username: string, role: string };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
}

type FilterType = 'all' | 'mine' | 'dept' | 'unassigned';

export function Sidebar({ user, socket, onSelectContact, selectedContactId }: SidebarProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.on('contacts_update', (newContacts: any) => {
      if (Array.isArray(newContacts)) {
        setContacts(newContacts);
      }
    });

    socket.emit('request_contacts');
    
    socket.on('contact_updated_notification', () => {
        socket.emit('request_contacts');
    });

    const interval = setInterval(() => socket.emit('request_contacts'), 5000);

    return () => {
      socket.off('contacts_update');
      socket.off('contact_updated_notification');
      clearInterval(interval);
    };
  }, [socket]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try { return new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); } catch { return ''; }
  };

  const getInitial = (name?: any, phone?: any) => {
    const text = String(name || phone || "?");
    return text.charAt(0).toUpperCase();
  };

  // --- LÓGICA DE FILTRADO MEJORADA ---
  const filteredContacts = contacts.filter(c => {
      // 1. Búsqueda
      const matchesSearch = (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.phone || "").includes(searchQuery);
      if (!matchesSearch) return false;

      // 2. Filtros
      if (filter === 'all') return true;
      
      // CAMBIO: "Míos" ahora incluye lo asignado a mí O lo de mi departamento
      if (filter === 'mine') {
          return c.assigned_to === user.username || c.department === user.role;
      }
      
      if (filter === 'dept') return c.department === user.role;
      
      // Sin Asignar: Ni tienen agente ni tienen departamento
      if (filter === 'unassigned') return !c.assigned_to && !c.department;
      
      return true;
  });

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bandeja de Entrada</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar chat..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* PESTAÑAS */}
        <div className="flex gap-1 mt-3 p-1 bg-slate-100 rounded-lg overflow-x-auto no-scrollbar">
            <button onClick={() => setFilter('all')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Todos</button>
            
            <button onClick={() => setFilter('mine')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap flex items-center justify-center gap-1 ${filter === 'mine' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <UserCheck className="w-3 h-3" /> Míos
            </button>
            
            <button onClick={() => setFilter('unassigned')} className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === 'unassigned' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sin Asignar</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400 mb-2" />
            <p>No hay chats aquí.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredContacts.map((contact) => (
              <li key={contact.id || Math.random()}>
                <button 
                  onClick={() => onSelectContact(contact)}
                  className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white text-left group
                    ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'}
                  `}
                >
                  <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-transform group-hover:scale-105
                    ${selectedContactId === contact.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                    ${!contact.avatar ? (selectedContactId === contact.id ? 'bg-blue-500' : 'bg-slate-400') : ''}
                  `}>
                    {contact.avatar ? (
                        <img src={contact.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        getInitial(contact.name, contact.phone)
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className={`text-sm font-bold truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {String(contact.name || contact.phone || "Desconocido")}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
                        {formatTime(contact.last_message_time)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate h-4">
                      {String(contact.last_message || "Haz clic para ver el chat")}
                    </p>
                    
                    <div className="flex gap-1 mt-2 flex-wrap">
                        {contact.status === 'Nuevo' && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-md tracking-wide">NUEVO</span>
                        )}
                        
                        {/* CAMBIO: Estilo Morado para el Departamento */}
                        {contact.department && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] font-bold rounded-md border border-purple-100 uppercase tracking-wide flex items-center gap-1">
                                {String(contact.department)}
                            </span>
                        )}

                        {contact.assigned_to && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-medium rounded border border-slate-200 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" /> {contact.assigned_to}
                            </span>
                        )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}