import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle } from 'lucide-react';
import { Contact } from './Sidebar';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  contact: Contact;
}

interface Message {
  text: string;
  sender: string;
  timestamp: string;
}

export function ChatWindow({ socket, user, contact }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  // Estados locales para los inputs del CRM
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sincronizar inputs cuando cambiamos de chat
  useEffect(() => {
    setName(contact.name || '');
    setDepartment(contact.department || '');
    setStatus(contact.status || '');
    
    setMessages([]);
    if (socket && contact.phone) {
        socket.emit('request_conversation', contact.phone);
    }
  }, [contact, socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const handleHistory = (history: Message[]) => setMessages(history);
    const handleNewMessage = (msg: any) => {
        if (msg.sender === contact.phone || msg.sender === 'Agente') {
            setMessages((prev) => [...prev, msg]);
        }
    };
    
    if (socket) {
        socket.on('conversation_history', handleHistory);
        socket.on('message', handleNewMessage);
        return () => { 
          socket.off('conversation_history', handleHistory);
          socket.off('message', handleNewMessage);
        };
    }
  }, [socket, contact.phone]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { 
          text: input, 
          sender: user.username,
          targetPhone: contact.phone,
          timestamp: new Date().toISOString()
      };
      socket.emit('chatMessage', msg);
      setInput('');
    }
  };

  // Función para guardar cambios en el CRM
  const updateCRM = (field: string, value: string) => {
      if (!socket) return;
      const updates: any = {};
      updates[field] = value;
      
      socket.emit('update_contact_info', {
          phone: contact.phone,
          updates: updates
      });
  };

  const safeTime = (time: string) => {
      try { return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      
      {/* BARRA DE HERRAMIENTAS CRM */}
      <div className="bg-white border-b border-gray-200 p-3 flex gap-3 items-center shadow-sm z-10 flex-wrap">
        
        {/* Input Nombre */}
        <div className="flex items-center gap-2 flex-1 min-w-[150px] bg-slate-50 px-2 rounded-md border border-slate-200">
            <User className="w-4 h-4 text-slate-400" />
            <input 
                className="text-sm font-semibold text-slate-700 border-none focus:ring-0 w-full bg-transparent placeholder:text-slate-400 py-1.5"
                placeholder="Nombre Cliente"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => updateCRM('name', name)}
            />
        </div>

        {/* Selector Departamento */}
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <select 
                className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium"
                value={department}
                onChange={(e) => {
                    setDepartment(e.target.value);
                    updateCRM('department', e.target.value);
                }}
            >
                <option value="">Sin Dpto</option>
                <option value="Ventas">Ventas</option>
                <option value="Taller">Taller</option>
                <option value="Administración">Admin</option>
            </select>
        </div>

        {/* Selector Estado */}
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <select 
                className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium"
                value={status}
                onChange={(e) => {
                    setStatus(e.target.value);
                    updateCRM('status', e.target.value);
                }}
            >
                <option value="Nuevo">Nuevo</option>
                <option value="Abierto">Abierto</option>
                <option value="Cerrado">Cerrado</option>
            </select>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p className="text-sm">Historial cargado.</p>
          </div>
        )}
        
        {messages.map((m, i) => {
          const isMe = m.sender !== contact.phone; 
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm relative text-slate-800
                  ${isMe ? 'bg-green-100 rounded-tr-none' : 'bg-white rounded-tl-none border border-slate-100'}`}
              >
                <p className="whitespace-pre-wrap">{String(m.text || "")}</p>
                <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">{safeTime(m.timestamp)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm"
          />
          <button type="submit" disabled={!input.trim()} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}