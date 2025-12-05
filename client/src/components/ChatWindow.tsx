import { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, MoreVertical, Paperclip, Smile, ArrowDown } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

// Intentamos importar electron de forma segura
let ipcRenderer: any = null;
if (window.require) {
  try {
    const electron = window.require('electron');
    ipcRenderer = electron.ipcRenderer;
  } catch (e) {
    console.log("No estamos en entorno Electron");
  }
}

interface Message {
    id: number;
    text: string;
    sender: string;
    timestamp: string;
    type: 'sent' | 'received';
}

interface ChatWindowProps {
    socket: any;
    user: { username: string; role: string };
    contact: { id: number; name: string; avatar: string; status: string; role: string; unread: number };
    config: { departments: string[], statuses: string[] };
    onBack: () => void;
}

export function ChatWindow({ socket, user, contact, config, onBack }: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    
    // Referencias para el scroll
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<any>(null);
    const soundRef = useRef<HTMLAudioElement | null>(null);

    // Inicializar sonido
    useEffect(() => {
        soundRef.current = new Audio('/pop.mp3');
    }, []);

    // Scroll al fondo suave
    const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    // Detectar si el usuario está lejos del fondo para mostrar botón
    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        // Si estamos a más de 200px del fondo, mostrar botón
        const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 200;
        setShowScrollButton(isFarFromBottom);
    };

    // Efecto para manejar mensajes entrantes y notificaciones
    useEffect(() => {
        const handleReceiveMessage = (msg: any) => {
            // Solo procesar si es de este chat o es broadcast relevante
            const isRelevant = (msg.sender === contact.name) || (msg.receiver === user.username && msg.sender === contact.name);
            
            if (isRelevant) {
                const incomingMsg: Message = {
                    id: Date.now(),
                    text: msg.text,
                    sender: msg.sender,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: 'received'
                };
                
                setMessages(prev => [...prev, incomingMsg]);
                setTypingUser(null); // Dejar de mostrar "escribiendo" al recibir mensaje

                // --- LÓGICA DE NOTIFICACIONES ---
                if (document.hidden || !document.hasFocus()) {
                    // 1. Sonido
                    soundRef.current?.play().catch(e => console.log("Audio play blocked", e));
                    
                    // 2. Notificación Nativa de Windows
                    if (Notification.permission === 'granted') {
                        new Notification(`Nuevo mensaje de ${contact.name}`, {
                            body: msg.text,
                            icon: '/logo.ico'
                        });
                    }

                    // 3. Flash Frame (Electron Taskbar)
                    if (ipcRenderer) {
                        ipcRenderer.send('flash-frame');
                    }
                }

                // Scroll automático solo si ya estábamos cerca del fondo
                if (!showScrollButton) {
                    setTimeout(() => scrollToBottom(), 100);
                }
            }
        };

        const handleUserTyping = (data: { user: string }) => {
            if (data.user === contact.name) {
                setTypingUser(contact.name);
                // Limpiar el estado "escribiendo" después de 3 segundos sin eventos
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
            }
        };

        socket.on('receive_message', handleReceiveMessage);
        socket.on('user_typing', handleUserTyping);

        // Cargar mensajes iniciales (simulado)
        // En producción aquí harías un fetch al backend para historial
        setMessages([
            { id: 1, text: "Hola, ¿cómo estás?", sender: contact.name, timestamp: "09:00", type: 'received' },
            { id: 2, text: "Todo bien por aquí, avanzando con el proyecto.", sender: user.username, timestamp: "09:05", type: 'sent' }
        ]);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
            socket.off('user_typing', handleUserTyping);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, [contact.name, user.username, showScrollButton]);

    // Manejar input de usuario (Emitir escribiendo)
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessage(e.target.value);
        
        if (!isTyping) {
            setIsTyping(true);
            socket.emit('typing', { target: contact.name });
        }

        // Debounce para dejar de emitir typing
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
        }, 2000);
    };

    const handleSendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (newMessage.trim()) {
            const msgData = {
                text: newMessage,
                sender: user.username,
                receiver: contact.name,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            socket.emit('send_message', msgData);

            setMessages(prev => [...prev, {
                id: Date.now(),
                text: newMessage,
                sender: user.username,
                timestamp: msgData.timestamp,
                type: 'sent'
            }]);
            
            setNewMessage("");
            setShowEmoji(false);
            setIsTyping(false);
            setTimeout(() => scrollToBottom(), 100);
        }
    };

    const onEmojiClick = (emojiObject: any) => {
        setNewMessage(prev => prev + emojiObject.emoji);
    };

    return (
        <div className="flex flex-col h-full bg-[#efeae2] relative">
            {/* Header */}
            <div className="bg-[#f0f2f5] p-3 flex items-center justify-between shadow-sm border-b border-gray-200 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="md:hidden p-2 hover:bg-gray-200 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="relative">
                        <img src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-full object-cover" />
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${contact.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    </div>
                    <div>
                        <h2 className="font-semibold text-gray-800">{contact.name}</h2>
                        <div className="text-xs text-gray-500 h-4">
                            {typingUser ? (
                                <span className="text-green-600 font-medium animate-pulse">Escribiendo...</span>
                            ) : (
                                <span className="capitalize">{contact.role} • {contact.status}</span>
                            )}
                        </div>
                    </div>
                </div>
                <button className="p-2 hover:bg-gray-200 rounded-full text-gray-600">
                    <MoreVertical className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Area */}
            <div 
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-contain"
            >
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-3 rounded-lg shadow-sm relative ${
                            msg.type === 'sent' 
                                ? 'bg-[#d9fdd3] rounded-tr-none' 
                                : 'bg-white rounded-tl-none'
                        }`}>
                            <p className="text-gray-800 text-sm leading-relaxed">{msg.text}</p>
                            <span className="text-[10px] text-gray-500 block text-right mt-1">
                                {msg.timestamp}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Botón flotante para bajar */}
            {showScrollButton && (
                <button 
                    onClick={() => scrollToBottom()}
                    className="absolute bottom-20 right-6 bg-white p-2 rounded-full shadow-lg text-gray-600 hover:text-blue-500 transition-all animate-bounce z-20"
                >
                    <ArrowDown className="w-5 h-5" />
                    {/* Badge si hay mensajes nuevos sin leer podría ir aquí */}
                </button>
            )}

            {/* Input Area */}
            <div className="bg-[#f0f2f5] p-3 flex items-center gap-2 relative z-20">
                {showEmoji && (
                    <div className="absolute bottom-16 left-0 shadow-2xl rounded-lg overflow-hidden">
                        <EmojiPicker onEmojiClick={onEmojiClick} />
                    </div>
                )}
                
                <button 
                    onClick={() => setShowEmoji(!showEmoji)} 
                    className={`p-2 rounded-full transition ${showEmoji ? 'text-blue-500 bg-blue-50' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                    <Smile className="w-6 h-6" />
                </button>
                
                <button className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition">
                    <Paperclip className="w-5 h-5" />
                </button>

                <form onSubmit={handleSendMessage} className="flex-1 flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={handleInputChange}
                        placeholder="Escribe un mensaje"
                        className="flex-1 px-4 py-2 rounded-lg border-none focus:ring-0 focus:outline-none bg-white shadow-sm"
                    />
                    <button 
                        type="submit" 
                        disabled={!newMessage.trim()}
                        className={`p-2 rounded-full transition ${
                            newMessage.trim() 
                                ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' 
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}