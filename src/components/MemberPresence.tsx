import React, { useEffect, useState } from 'react';
import { RoomMember, subscribeToPresence } from '../lib/p2p';

interface MemberPresenceProps {
  roomId: string;
}

export default function MemberPresence({ roomId }: MemberPresenceProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToPresence(roomId, (newMembers) => {
      setMembers(newMembers);
    });
    return () => unsubscribe();
  }, [roomId]);

  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-3 mt-4">
      <div className="flex -space-x-3">
        {members.map((m) => (
          <div 
            key={m.userId}
            title={m.name}
            className="w-10 h-10 rounded-full border-2 border-zinc-800 bg-zinc-900 shadow-lg relative transition-transform hover:scale-110 hover:z-10 group flex-shrink-0"
          >
            <img 
              src={m.pfpUrl} 
              alt={m.name} 
              className="w-full h-full object-cover rounded-full"
            />
          </div>
        ))}
      </div>
      <span className="text-sm text-zinc-500 font-medium">
        {members.length} {members.length === 1 ? 'Listener' : 'Listeners'}
      </span>
    </div>
  );
}
