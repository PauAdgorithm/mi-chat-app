import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw } from 'lucide-react';

// 👇 AQUÍ ESTABA EL ERROR: Faltaba "export" delante de interface
export interface Contact {
  id: string;
  phone: string;
  name?: string;
  status?: string;
  department?: string;
  last_message?: string;
  last_message_time?: string;
}

interface SidebarProps {
  user: { username: string };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
}

export function Sidebar({ socket, onSelectContact, selectedContactId }: SidebarProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);

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

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bandeja de Entrada</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar chat..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400 mb-2" />
            <p>Cargando clientes...</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <li key={contact.id || Math.random()}>
                <button 
                  onClick={() => onSelectContact(contact)}
                  className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white text-left group
                    ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500' : 'border-l-4 border-transparent'}
                  `}
                >
                  <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold
                    ${selectedContactId === contact.id ? 'bg-blue-500' : 'bg-slate-400'}
                  `}>
                    {getInitial(contact.name, contact.phone)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-bold truncate text-slate-700">
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
                        {contact.status && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded">
                                {String(contact.status).toUpperCase()}
                            </span>
                        )}
                        {contact.department && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-medium rounded border border-blue-100">
                                {String(contact.department).toUpperCase()}
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