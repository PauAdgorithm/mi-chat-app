import React from 'react';
import { User, MessageSquare, Clock, CheckCircle, Hash } from 'lucide-react';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  last_message: string;
  last_message_time: string;
  status: string;
  department?: string;
  assigned_to?: string;
  avatar?: string;
  email?: string;
  address?: string;
  notes?: string;
  signup_date?: string;
  tags?: string[]; 
}

interface SidebarProps {
  user: { username: string; role: string };
  socket: any;
  onSelectContact: (contact: Contact) => void;
  selectedContactId?: string;
  isConnected: boolean;
  onlineUsers: string[];
  typingStatus: { [chatId: string]: string };
}

export function Sidebar({ user, socket, onSelectContact, selectedContactId, isConnected, onlineUsers, typingStatus }: SidebarProps) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [filter, setFilter] = React.useState('all');

  React.useEffect(() => {
    if (socket) {
      socket.emit('request_contacts');
      socket.on('contacts_update', (data: Contact[]) => setContacts(data));
      socket.on('contact_updated_notification', () => socket.emit('request_contacts'));
      return () => { socket.off('contacts_update'); socket.off('contact_updated_notification'); };
    }
  }, [socket]);

  const filteredContacts = contacts.filter(c => {
    if (filter === 'assigned') return c.assigned_to === user.username;
    return true; 
  });

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-gray-100 flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
        <button onClick={() => setFilter('assigned')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === 'assigned' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>Mis Chats</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredContacts.map(contact => {
          const isSelected = contact.id === selectedContactId;
          const isTyping = typingStatus[contact.phone];
          
          return (
            <div 
              key={contact.id} 
              onClick={() => onSelectContact(contact)}
              className={`p-4 border-b border-gray-50 cursor-pointer transition-all hover:bg-slate-50 ${isSelected ? 'bg-blue-50/60 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className={`font-bold text-sm ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{contact.name}</h4>
                <span className="text-[10px] text-slate-400 font-medium">{formatTime(contact.last_message_time)}</span>
              </div>
              
              <p className={`text-xs mb-2 line-clamp-1 h-4 ${isTyping ? 'text-green-600 font-bold' : 'text-slate-500'}`}>
                {isTyping ? 'Escribiendo...' : contact.last_message}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${contact.status === 'Nuevo' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {contact.status}
                </span>
                
                {contact.tags && contact.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                    <Hash size={8} /> {tag}
                  </span>
                ))}
                {contact.tags && contact.tags.length > 2 && <span className="text-[9px] text-slate-400">+{contact.tags.length - 2}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}