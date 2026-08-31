import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, Lock, Unlock, UserCheck, Star, UserMinus, MoreVertical, Share2 } from 'lucide-react';
import { RoomState } from '../types';
import { RoomMember, subscribeToPresence, updateRoomPermissions, transferHostPrivilege, kickRoomUser } from '../lib/p2p';
import ShareRoom from './ShareRoom';

interface RoomManagementProps {
  room: RoomState;
  deviceId: string;
  isHost: boolean;
}

export default function RoomManagement({ room, deviceId, isHost }: RoomManagementProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const permission = room.playbackPermission || 'everyone';

  useEffect(() => {
    const unsubscribe = subscribeToPresence(room.code, (newMembers) => {
      setMembers(newMembers);
    });
    return () => unsubscribe();
  }, [room.code]);

  useEffect(() => {
    function handleClickOutside(event: Event) {
      const target = event.target as HTMLElement;
      if (!target.closest('.member-menu-container')) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openMenuId]);

  const handlePermissionToggle = async (newPermission: 'everyone' | 'admins') => {
    if (!isHost) return;
    await updateRoomPermissions(room.code, newPermission);
  };

  const handleTransferHost = async (targetUserId: string) => {
    if (!isHost) return;
    setOpenMenuId(null);
    if (confirm("Are you sure you want to make this user the host?")) {
      await transferHostPrivilege(room.code, targetUserId);
    }
  };

  const handleKickUser = async (targetUserId: string) => {
    if (!isHost) return;
    setOpenMenuId(null);
    if (confirm("Are you sure you want to kick this user from the room?")) {
      await kickRoomUser(room.code, targetUserId);
    }
  };

  return (
    <div className="w-full space-y-4">
      <ShareRoom isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} roomCode={room.code} />
      
      {/* Playback Permissions Panel */}
      <div className="bg-[#13151a] border border-neutral-800/80 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Playback Control</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              permission === 'everyone' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {permission.toUpperCase()}
            </span>
            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              SHARE
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handlePermissionToggle('everyone')}
            disabled={!isHost}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
              permission === 'everyone'
                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_-5px_rgba(16,185,129,0.2)]'
                : 'bg-neutral-900/50 border-neutral-800 text-neutral-500 hover:border-neutral-700'
            } ${!isHost && 'opacity-50 cursor-not-allowed'}`}
          >
            <Unlock className="w-4 h-4" />
            <span className="text-xs font-bold">Everyone</span>
          </button>
          
          <button
            onClick={() => handlePermissionToggle('admins')}
            disabled={!isHost}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
              permission === 'admins'
                ? 'bg-red-500/10 border-red-500/50 text-red-400 shadow-[0_0_20px_-5px_rgba(239,68,68,0.2)]'
                : 'bg-neutral-900/50 border-neutral-800 text-neutral-500 hover:border-neutral-700'
            } ${!isHost && 'opacity-50 cursor-not-allowed'}`}
          >
            <Lock className="w-4 h-4" />
            <span className="text-xs font-bold">Admins Only</span>
          </button>
        </div>
        
        {!isHost && (
          <p className="mt-3 text-[10px] text-neutral-600 text-center font-mono italic">
            * Only the room host can modify these settings
          </p>
        )}
      </div>

      {/* Connected Users Panel */}
      <div className="bg-[#13151a] border border-neutral-800/80 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Connected Users</h3>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 bg-neutral-900 py-1 px-3 rounded-full border border-neutral-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {members.length} ONLINE
          </div>
        </div>

        <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
          <AnimatePresence mode="popLayout">
            {[...members].sort((a, b) => {
              if (a.userId === room.hostId) return -1;
              if (b.userId === room.hostId) return 1;
              return a.joinedAt - b.joinedAt;
            }).map((member) => (
              <motion.div
                key={member.userId}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`flex items-center gap-3 p-2 rounded-xl group transition-colors ${
                  member.userId === deviceId ? 'bg-emerald-500/5 border border-emerald-500/10' : 'hover:bg-neutral-800/30 border border-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-neutral-800 bg-neutral-900">
                    <img src={member.pfpUrl} alt={member.name} className="w-full h-full object-cover" />
                  </div>
                  {room.hostId === member.userId && (
                    <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-0.5 border-2 border-[#13151a]">
                      <Shield className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold truncate ${member.userId === deviceId ? 'text-emerald-400' : 'text-neutral-200'}`}>
                      {member.name}
                    </span>
                    {member.userId === deviceId && (
                      <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 font-mono">
                    {room.hostId === member.userId ? 'Sync Host' : 'Listener'}
                  </p>
                </div>

                <div className="flex items-center gap-2 pr-2 relative">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-mono text-emerald-500/80 tracking-tighter">ACTIVE</span>
                  </div>
                  
                  {isHost && member.userId !== deviceId && (
                    <div className="relative member-menu-container">
                      <button 
                        onClick={() => setOpenMenuId(openMenuId === member.userId ? null : member.userId)}
                        className="p-1.5 text-neutral-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      
                      {openMenuId === member.userId && (
                        <div className="absolute right-0 bottom-full mb-1.5 w-36 bg-[#1a1d24] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50">
                          <button
                            onClick={() => handleTransferHost(member.userId)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors text-left"
                          >
                            <Star className="w-3.5 h-3.5" />
                            <span>Make Host</span>
                          </button>
                          <button
                            onClick={() => handleKickUser(member.userId)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-neutral-300 hover:bg-red-500/10 hover:text-red-400 transition-colors text-left border-t border-neutral-800"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            <span>Kick User</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
