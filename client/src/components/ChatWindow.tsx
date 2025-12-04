import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle, Image as ImageIcon, X, Mic, Square, FileText, Download, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
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
  type?: string;
  mediaId?: string;
}

// --- REPRODUCTOR DE AUDIO PRO (Diseño 2 filas) ---
const CustomAudioPlayer = ({ src, isMe }: { src: string, isMe: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Descargar el blob para evitar errores de streaming
  useEffect(() => {
    fetch(src)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsReady(true);
      })
      .catch(e => console.error("Error audio", e));
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [playbackRate, volume, isMuted]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
    setIsPlaying(!isPlaying);
  };

  const toggleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(next);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    setProgress((audio.currentTime / (audio.duration || 1)) * 100);
  };

  const onLoadedMetadata = (e: any) => {
    setDuration(e.currentTarget.duration);
  };

  const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = (Number(e.target.value) / 100) * duration;
    audio.currentTime = newTime;
    setProgress(Number(e.target.value));
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  if (!isReady) return <div className="text-xs text-slate-400 p-2 italic">Cargando audio...</div>;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl min-w-[280px] max-w-[380px] select-none transition-colors ${isMe ? 'bg-[#dcf8c6]' : 'bg-white border border-slate-100'}`}>
      <audio ref={audioRef} src={audioUrl!} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} className="hidden" />
      
      {/* 1. BOTÓN PLAY GRANDE (IZQUIERDA) */}
      <button 
        onClick={togglePlay}
        className={`w-11 h-11 mt-1 flex items-center justify-center rounded-full transition shadow-sm flex-shrink-0 ${isMe ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' : 'bg-slate-500 text-white hover:bg-slate-600'}`}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* 2. COLUMNA DERECHA (BARRA + CONTROLES) */}
      <div className="flex-1 flex flex-col gap-1 w-full min-w-0">
        
        {/* BARRA DE PROGRESO (GRANDE) */}
        <div className="h-5 flex items-center">
            <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-[#00a884] bg-green-200' : 'accent-slate-500 bg-slate-200'}`}
            />
        </div>

        {/* FILA INFERIOR: TIEMPO + CONTROLES */}
        <div className="flex justify-between items-center text-[11px] font-medium text-slate-500 h-5">
            
            {/* TIEMPO (Dinámico) */}
            <span className="font-mono tabular-nums">
                {currentTime === 0 && !isPlaying ? formatTime(duration) : formatTime(currentTime)}
            </span>
            
            {/* CONTROLES MINI (Derecha) */}
            <div className="flex items-center gap-3">
                {/* Velocidad */}
                <button onClick={toggleSpeed} className="px-1.5 py-0.5 bg-black/5 hover:bg-black/10 rounded text-[10px] font-bold text-slate-600 transition min-w-[24px] text-center">
                    {playbackRate}x
                </button>

                {/* Volumen */}
                <div className="relative flex items-center group" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}>
                    <button onClick={toggleMute} className="hover:text-slate-800 transition">
                        {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    
                    {/* Slider Volumen Flotante */}
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white shadow-xl rounded-lg p-2 transition-all duration-200 z-10 ${showVolumeSlider ? 'opacity-100 visible scale-100' : 'opacity-0 invisible scale-95'}`}>
                        <div className="h-20 w-6 flex items-center justify-center">
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.1"
                                value={isMuted ? 0 : volume}
                                onChange={(e) => {
                                    setVolume(parseFloat(e.target.value));
                                    setIsMuted(parseFloat(e.target.value) === 0);
                                }}
                                className="-rotate-90 w-16 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                        {/* Flechita decorativa */}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45"></div>
                    </div>
                </div>

                {/* Descargar (Salvavidas) */}
                <a href={src} download="audio.webm" target="_blank" rel="noopener noreferrer" className="hover:text-slate-800 transition" title="Descargar">
                    <Download className="w-3.5 h-3.5" />
                </a>
            </div>
        </div>
      </div>
    </div>
  );
};

export function ChatWindow({ socket, user, contact }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Estados CRM
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com' : 'http://localhost:3000';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    setName(contact.name || ''); setDepartment(contact.department || ''); setStatus(contact.status || '');
    setMessages([]);
    setShowEmojiPicker(false); setIsRecording(false);
    if (socket && contact.phone) socket.emit('request_conversation', contact.phone);
  }, [contact, socket]);

  useEffect(() => {
    const handleHistory = (history: Message[]) => setMessages(history);
    const handleNewMessage = (msg: any) => {
        if (msg.sender === contact.phone || msg.sender === 'Agente' || msg.recipient === contact.phone) setMessages((prev) => [...prev, msg]);
    };
    if (socket) {
        socket.on('conversation_history', handleHistory);
        socket.on('message', handleNewMessage);
        return () => { socket.off('conversation_history', handleHistory); socket.off('message', handleNewMessage); };
    }
  }, [socket, contact.phone]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { text: input, sender: user.username, targetPhone: contact.phone, timestamp: new Date().toISOString(), type: 'text' };
      socket.emit('chatMessage', msg);
      setInput('');
      setShowEmojiPicker(false);
    }
  };

  // --- AUDIO RECORDING (MP4/WebM) ---
  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
            const audioFile = new File([audioBlob], `voice_note.${ext}`, { type: mimeType });
            await uploadFile(audioFile);
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        setIsRecording(true);
    } catch (error: any) { alert(`Error micrófono: ${error.message}`); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };

  const uploadFile = async (file: File) => {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetPhone', contact.phone);
        formData.append('senderName', user.username);
        try {
            await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
        } catch (error) { alert("Error envio"); } 
        finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) uploadFile(e.target.files[0]); };
  const onEmojiClick = (emojiData: EmojiClickData) => setInput((prev) => prev + emojiData.emoji);
  const updateCRM = (field: string, value: string) => { if (socket) { const updates: any = {}; updates[field] = value; socket.emit('update_contact_info', { phone: contact.phone, updates: updates }); }};
  const safeTime = (time: string) => { try { return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => setShowEmojiPicker(false)}>
      
      {/* LIGHTBOX */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setSelectedImage(null)}><X className="w-6 h-6" /></button>
            <img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <div className="bg-white border-b border-gray-200 p-3 flex gap-3 items-center shadow-sm z-10 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-1 min-w-[150px] bg-slate-50 px-2 rounded-md border border-slate-200">
            <User className="w-4 h-4 text-slate-400" />
            <input className="text-sm font-semibold text-slate-700 border-none focus:ring-0 w-full bg-transparent py-1.5" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateCRM('name', name)} />
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={department} onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}>
                <option value="">Sin Dpto</option><option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Administración">Admin</option>
            </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={status} onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}>
                <option value="Nuevo">Nuevo</option><option value="Abierto">Abierto</option><option value="Cerrado">Cerrado</option>
            </select>
        </div>
      </div>

      {/* CHAT */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4" onClick={() => setShowEmojiPicker(false)}>
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
              <div className={`flex flex-col max-w-[75%]`}>
                {isMe && (
                    <span className="text-[10px] text-slate-500 font-bold mb-1 block text-right mr-1 uppercase tracking-wide">
                        {m.sender === 'Agente' ? 'Yo' : m.sender}
                    </span>
                )}
                <div className={`p-3 rounded-xl shadow-sm text-sm relative text-slate-800 ${isMe ? 'bg-green-100 rounded-tr-none' : 'bg-white rounded-tl-none border border-slate-100'}`}>
                    
                    {/* VISUALIZACIÓN MULTIMEDIA */}
                    {m.type === 'image' && m.mediaId ? (
                        <div className="mb-1 group relative">
                            <img src={`${API_URL}/api/media/${m.mediaId}`} alt="Imagen" className="rounded-lg max-w-[200px] max-h-[200px] w-auto h-auto object-contain cursor-pointer hover:opacity-90 transition bg-black/5" onClick={(e) => { e.stopPropagation(); setSelectedImage(`${API_URL}/api/media/${m.mediaId}`); }} />
                        </div>
                    ) : m.type === 'audio' && m.mediaId ? (
                        // REPRODUCTOR PRO REDISEÑADO
                        <CustomAudioPlayer src={`${API_URL}/api/media/${m.mediaId}`} isMe={isMe} />
                    ) : m.type === 'document' && m.mediaId ? (
                        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 min-w-[200px]">
                            <div className="bg-red-100 p-2 rounded-full text-red-500"><FileText className="w-6 h-6" /></div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-700 truncate">{m.text}</p>
                                <p className="text-xs text-slate-400">Documento</p>
                            </div>
                            <a href={`${API_URL}/api/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-full transition"><Download className="w-5 h-5" /></a>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap">{String(m.text || "")}</p>
                    )}

                    <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">{safeTime(m.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* EMOJIS */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} previewConfig={{ showPreview: false }} />
        </div>
      )}

      {/* INPUT */}
      <div className="p-3 bg-white border-t border-slate-200 relative z-20">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition" title="Adjuntar">
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isUploading ? "Enviando..." : isRecording ? "Grabando audio..." : "Escribe un mensaje..."} disabled={isUploading || isRecording} className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm" />
          
          <button type="button" className={`p-2 rounded-full transition ${showEmojiPicker ? 'text-blue-500 bg-blue-50' : 'text-slate-500 hover:bg-slate-200'}`} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
            <Smile className="w-5 h-5" />
          </button>

          {input.trim() ? (
              <button type="submit" disabled={isUploading} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm"><Send className="w-5 h-5" /></button>
          ) : (
              <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`p-3 rounded-full text-white transition shadow-sm ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-slate-700 hover:bg-slate-800'}`} title="Grabar audio">
                {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
              </button>
          )}
        </form>
      </div>
    </div>
  );
}