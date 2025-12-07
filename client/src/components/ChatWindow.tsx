import { useState, useEffect, useRef } from 'react';
import { 
  Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle, 
  Image as ImageIcon, X, Mic, Square, FileText, Download, Play, Pause, 
  Volume2, VolumeX, ArrowLeft, UserPlus, ChevronDown, ChevronUp, UserCheck, 
  Info, Lock, StickyNote, Mail, Phone, MapPin, Calendar, Save, Search, 
  LayoutTemplate, Tag // <--- Tag
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Contact } from './Sidebar';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  contact: Contact;
  config?: { departments: string[]; statuses: string[]; tags: string[] }; // <--- Tags en config
  onBack: () => void;
  onlineUsers: string[];
  typingInfo: { [chatId: string]: string };
  onOpenTemplates: () => void;
}

// ... (Interfaces Message, Agent, SearchMatch y componente CustomAudioPlayer IGUALES que antes) ...
// (Omito el código repetido de CustomAudioPlayer para ahorrar espacio, usa el mismo)
// ...

interface Message { text: string; sender: string; timestamp: string; type?: string; mediaId?: string; }
interface Agent { id: string; name: string; role: string; }
interface SearchMatch { msgIndex: number; matchIndex: number; }

// Dummy audio player component just to keep types happy if you copy paste full file
const CustomAudioPlayer = ({ src, isMe }: any) => <audio controls src={src} className="w-full" />;

export function ChatWindow({ socket, user, contact, config, onBack, onlineUsers, typingInfo, onOpenTemplates }: ChatWindowProps) {
  // ... (Estados iniciales IGUALES) ...
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');
  const [assignedTo, setAssignedTo] = useState(contact.assigned_to || '');
  const [crmEmail, setCrmEmail] = useState('');
  const [crmAddress, setCrmAddress] = useState('');
  const [crmNotes, setCrmNotes] = useState('');
  const [crmSignupDate, setCrmSignupDate] = useState('');
  
  // ESTADO PARA TAGS DEL CLIENTE ACTUAL
  const [contactTags, setContactTags] = useState<string[]>(contact.tags || []);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false); 
  const [isInternalMode, setIsInternalMode] = useState(false); 
  const [isSaving, setIsSaving] = useState(false);
  
  const [showSearch, setShowSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // ... (Resto de Hooks y lógicas IGUALES hasta updateCRM) ...
  // (Omito hooks de búsqueda, typing, online status para brevedad, úsalos del anterior)
  // ... 

  useEffect(() => {
      // Sincronizar tags cuando cambia el contacto
      setContactTags(contact.tags || []);
      // ... resto de sets ...
      setName(contact.name || '');
      // ...
  }, [contact]);

  const updateCRM = (field: string, value: any) => { 
      if (socket) { 
          const updates: any = {}; 
          updates[field] = value; 
          socket.emit('update_contact_info', { phone: contact.phone, updates: updates }); 
      }
  };

  // --- LÓGICA GESTIÓN DE TAGS ---
  const toggleTag = (tag: string) => {
      let newTags = [...contactTags];
      if (newTags.includes(tag)) {
          newTags = newTags.filter(t => t !== tag);
      } else {
          newTags.push(tag);
      }
      setContactTags(newTags);
      updateCRM('tags', newTags); // Enviamos array a Airtable (Campo Multiple Select)
  };

  // ... (Funciones sendMessage, handleAssign, etc. IGUALES) ...

  // RENDERIZADO (Solo cambia el Panel de Detalles)
  return (
    <div className="flex h-full bg-slate-50 relative" onClick={() => { setShowEmojiPicker(false); setShowAssignMenu(false); setShowSearch(false); }}>
      {/* ... (Parte izquierda del chat IGUAL) ... */}
      
      {/* PANEL DETALLES (ACTUALIZADO CON TAGS) */}
      {showDetailsPanel && (
          <div className="w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col h-full animate-in slide-in-from-right duration-300 shrink-0 z-30">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-700">Detalles del Cliente</h3>
                  <button onClick={() => setShowDetailsPanel(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400"><X className="w-5 h-5"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                  {/* ... (Avatar y datos básicos IGUAL) ... */}
                  <div className="flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-3 border-4 border-white shadow-sm">{contact.avatar ? <img src={contact.avatar} className="w-full h-full rounded-full object-cover"/> : <User className="w-10 h-10"/>}</div>
                      <h2 className="text-lg font-bold text-slate-800 text-center">{name || "Sin nombre"}</h2>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><Phone className="w-3 h-3"/> {contact.phone}</p>
                  </div>

                  {/* SECCIÓN ETIQUETAS (NUEVA) */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Etiquetas</label>
                      <div className="flex flex-wrap gap-2">
                          {config?.tags?.map(tag => {
                              const isActive = contactTags.includes(tag);
                              return (
                                  <button 
                                      key={tag}
                                      onClick={() => toggleTag(tag)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${isActive ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-orange-200 hover:text-orange-600'}`}
                                  >
                                      {isActive ? '✓ ' : '+ '}{tag}
                                  </button>
                              )
                          })}
                          {(!config?.tags || config.tags.length === 0) && <p className="text-xs text-slate-400 italic">No hay etiquetas configuradas.</p>}
                      </div>
                  </div>

                  {/* ... (Resto de inputs Email, Dirección, Notas IGUAL) ... */}
                  <div className="space-y-4">
                      {/* ... */}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}