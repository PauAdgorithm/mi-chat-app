import { useState, useEffect } from 'react';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
}

export function ChatWindow({ socket, user }: ChatWindowProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const handleMessage = (msg: any) => {
      setMessages((prev) => [...prev, msg]);
    };
    if (socket) {
        socket.on('message', handleMessage);
        return () => { socket.off('message', handleMessage); };
    }
  }, [socket]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { text: input, sender: user.username, timestamp: new Date() };
      socket.emit('chatMessage', msg);
      // Añadimos el mensaje localmente para verlo al instante
      setMessages((prev) => [...prev, msg]);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            <p>Sala de chat vacía</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === user.username ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-lg p-3 ${m.sender === user.username ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
              <p className="text-xs opacity-75 mb-1">{m.sender}</p>
              <p>{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} className="p-4 bg-white border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="bg-blue-600 text-white rounded-full px-6 hover:bg-blue-700">
          Enviar
        </button>
      </form>
    </div>
  );
}