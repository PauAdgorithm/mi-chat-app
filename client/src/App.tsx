import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Login } from './components/Login';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { MessageCircle } from 'lucide-react';

const isProduction = window.location.hostname.includes('render.com');
const BACKEND_URL = isProduction ? "https://chatgorithm.onrender.com" : "http://localhost:3000";

const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });

function App() {
  const [user, setUser] = useState<{username: string} | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const handleLogin = (username: string) => {
    setUser({ username });
    socket.emit('login', { username }); 
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {!user ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <Login onLogin={handleLogin} socket={socket} />
        </div>
      ) : (
        <div className="flex w-full h-full max-w-[1800px] mx-auto bg-white shadow-2xl overflow-hidden md:h-screen">
          <div className="w-80 flex-shrink-0 flex border-r border-gray-100 bg-slate-50/50">
            <Sidebar 
              user={user} 
              socket={socket} 
              onSelectContact={setSelectedContact}
              selectedContactId={selectedContact?.id}
            />
          </div>
          <main className="flex-1 flex flex-col min-w-0 bg-white relative">
            <header className="h-16 border-b border-gray-100 flex justify-between items-center px-6 bg-white sticky top-0 z-20">
              <div className="flex items-center gap-3">
                {selectedContact ? (
                  <>
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {String(selectedContact.name || selectedContact.phone || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h1 className="text-sm font-bold text-slate-800">{String(selectedContact.name || selectedContact.phone)}</h1>
                      <span className="text-xs text-slate-500">{selectedContact.phone}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-slate-400" />
                    <h1 className="text-lg font-bold text-slate-700">CRM</h1>
                  </div>
                )}
              </div>
            </header>
            <div className="flex-1 overflow-hidden relative">
              {selectedContact ? (
                <ChatWindow socket={socket} user={user} targetPhone={selectedContact.phone} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                  <p>Selecciona un chat</p>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;