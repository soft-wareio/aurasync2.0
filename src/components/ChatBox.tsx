import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { sendChatMessage, subscribeToMessages, ChatMessage } from '../lib/p2p';

interface ChatBoxProps {
  roomCode: string;
  deviceId: string;
  deviceName: string;
}

export default function ChatBox({ roomCode, deviceId, deviceName }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToMessages(roomCode, (newMessages) => {
      setMessages(newMessages);
    });
    return unsub;
  }, [roomCode]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const textToSend = inputText.trim();
    setInputText('');
    
    await sendChatMessage(roomCode, textToSend, deviceId, deviceName);
  };

  return (
    <>
      {/* Mobile toggle button when closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-900 rounded-full shadow-2xl transition hover:scale-105"
        >
          <MessageSquare size={24} />
          {messages.length > 0 && (
            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0d0e12]"></div>
          )}
        </button>
      )}

      {/* Chat panel */}
      <div 
        className={`fixed z-40 bottom-0 right-0 w-full sm:w-80 md:w-96 bg-[#16181f]/95 backdrop-blur-xl border-l border-t sm:border-t-0 border-neutral-800 transition-transform duration-300 ease-out flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] ${
          isOpen ? 'translate-y-0 h-[60vh] sm:h-screen sm:top-0' : 'translate-y-full h-[60vh] sm:h-screen sm:top-0 sm:translate-x-full sm:translate-y-0'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-800/80 bg-neutral-900/50">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-emerald-400" />
            <h3 className="font-semibold text-neutral-200">Room Chat</h3>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <span className="sm:hidden">Close</span>
            <span className="hidden sm:inline">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500 italic">
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.userId === deviceId ? 'items-end' : 'items-start'}`}
              >
                <div className={`text-xs mb-1 ${msg.userId === deviceId ? 'hidden' : 'text-neutral-500'}`}>
                  {msg.name}
                </div>
                <div 
                  className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${
                    msg.userId === deviceId 
                      ? 'bg-emerald-500/20 text-emerald-100 rounded-br-sm border border-emerald-500/20' 
                      : 'bg-neutral-800 text-neutral-200 rounded-bl-sm border border-neutral-700/50'
                  }`}
                >
                  {msg.text}
                </div>
                <div className="text-[10px] text-neutral-600 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-neutral-900/80 border-t border-neutral-800/80">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message room..."
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 bg-emerald-500 text-neutral-900 rounded-xl hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
