import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw } from 'lucide-react';

// Definimos cómo es un contacto
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
    // Escuchar la lista de contactos del servidor
    socket.on('contacts_update', (newContacts: Contact[]) => {
      setContacts(newContacts);
    });

    // Pedir la lista nada más cargar
    socket.emit('request_contacts');

    // Configurar un refresco cada 5 segundos (polling simple)
    const interval = setInterval(() => {
      socket.emit('request_contacts');
    }, 5000);

    return () => {
      socket.off('contacts_update');
      clearInterval(interval);
    };
  }, [socket]);

  return (
    <div className="h-full flex flex-col w-full bg-slate-50 border-r border-gray-200">
      {/* Buscador */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bandeja de Entrada</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Lista de Chats */}
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
            <p>Esperando mensajes...</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <button 
                  onClick={() => onSelectContact(contact)}
                  className={`w-full flex items-start gap-3 p-4 transition-all hover:bg-slate-100 text-left
                    ${selectedContactId === contact.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''}
                  `}
                >
                  <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold
                    ${selectedContactId === contact.id ? 'bg-blue-500 shadow-md' : 'bg-slate-300'}
                  `}>
                    {contact.name ? contact.name[0].toUpperCase() : <Users className="w-5 h-5" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className={`text-sm font-bold truncate ${selectedContactId === contact.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {contact.name || contact.phone}
                      </span>
                      {contact.last_message_time && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(contact.last_message_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {contact.last_message || "Sin mensajes"}
                    </p>
                    
                    {/* Etiquetas (Status/Dept) */}
                    <div className="flex gap-1 mt-2">
                        {contact.status === 'Nuevo' && (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">NUEVO</span>
                        )}
                        {contact.department && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded border border-gray-200">{contact.department}</span>
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