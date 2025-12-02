import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, MessageSquare } from 'lucide-react';

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
      console.log("📥 Contactos recibidos en frontend:", newContacts);
      // Aseguramos que sea un array para evitar crash
      if (Array.isArray(newContacts)) {
        setContacts(newContacts);
      }
    });

    socket.emit('request_contacts');

    // Polling de seguridad cada 5s
    const interval = setInterval(() => {
      socket.emit('request_contacts');
    }, 5000);

    return () => {
      socket.off('contacts_update');
      clearInterval(interval);
    };
  }, [socket]);

  // Función segura para formatear la hora
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
      return '';
    }
  };

  // Función segura para obtener la inicial
  const getInitial = (name?: string, phone?: string) => {
    if (name && name.length > 0) return name.charAt(0).toUpperCase();
    if (phone && phone.length > 0) return phone.charAt(0).toUpperCase();
    return '?';
  };

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      {/* Buscador */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bandeja de Entrada</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar chat..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Lista de Chats */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
            <div className="bg-slate-100 p-3 rounded-full mb-3">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
            </div>
            <p>Cargando clientes...</p>
            <p className="text-xs mt-1 text-slate-300">Si no aparecen, envía un WhatsApp para crear el primero.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <li key={contact.id || Math.random()}>
                <button 
                  onClick={() => onSelectContact(contact)}
                  className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-white hover:shadow-sm text-left group
                    ${selectedContactId === contact.id ? 'bg-white border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'}
                  `}
                >
                  {/* Avatar */}
                  <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold shadow-sm transition-transform group-hover:scale-105
                    ${selectedContactId === contact.id ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-slate-400'}
                  `}>
                    {getInitial(contact.name, contact.phone)}
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className={`text-sm font-bold truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {contact.name || contact.phone || "Desconocido"}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">
                        {formatTime(contact.last_message_time)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 truncate h-4">
                      {contact.last_message || "Haz clic para ver el chat"}
                    </p>
                    
                    {/* Etiquetas */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                        {contact.status === 'Nuevo' && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-md tracking-wide">NUEVO</span>
                        )}
                        {contact.department && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-medium rounded-md border border-blue-100">
                                {contact.department.toUpperCase()}
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