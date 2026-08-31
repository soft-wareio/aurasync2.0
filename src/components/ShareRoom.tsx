import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, X, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareRoomProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export default function ShareRoom({ isOpen, onClose, roomCode }: ShareRoomProps) {
  const shareUrl = `${window.location.origin}/room/${roomCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm bg-[#13151a] border border-neutral-800 rounded-3xl p-6 shadow-2xl relative z-10"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Join Room</h2>
              <p className="text-neutral-500 text-sm font-mono tracking-widest">{roomCode}</p>
            </div>

            <div className="flex justify-center bg-white p-4 rounded-2xl mb-6">
              <QRCodeSVG value={shareUrl} size={256} className="w-full h-auto" />
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-800 text-white p-3 rounded-2xl hover:bg-neutral-800 transition-colors"
            >
              <Copy className="w-4 h-4" />
              <span className="text-sm font-semibold truncate">{shareUrl}</span>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
