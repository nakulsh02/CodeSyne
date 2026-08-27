import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Users, Trash2, Mic, MicOff, Monitor } from 'lucide-react';
import { CollabUser } from '@shared/types';

interface CollabFloatingWidgetProps {
  roomId: string;
  collaborators: CollabUser[];
  roomConnections?: (CollabUser & { connectionId?: string })[];
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  userRole: 'Owner' | 'Editor' | 'Viewer';
  unreadChatCount?: number;
  onOpenCollabModal: () => void;
  onEndSession?: () => void;
  isMobile?: boolean;
  isCallActive?: boolean;
  isMuted?: boolean;
  isScreenSharing?: boolean;
}

export default function CollabFloatingWidget({
  roomId,
  collaborators = [],
  roomConnections,
  wsStatus,
  userRole,
  unreadChatCount = 0,
  onOpenCollabModal,
  isMobile = false,
  isCallActive = false,
  isMuted = false,
  isScreenSharing = false
}: CollabFloatingWidgetProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveredOverTrash, setIsHoveredOverTrash] = useState(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Only hide if explicitly dragged to trash by user
  if (isDeleted) {
    return null;
  }

  const activeCount = (roomConnections && roomConnections.length > 0) ? roomConnections.length : collaborators.length + 1;

  const handleDragStart = (_: any, info: any) => {
    setIsDragging(true);
    dragStartPosRef.current = { x: info.point.x, y: info.point.y };
  };

  const handleDrag = (_: any, info: any) => {
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const currentY = info.point.y;
    const currentX = info.point.x;

    const isInBottomTrashZone = 
      currentY > windowHeight - 120 && 
      currentX > windowWidth / 2 - 90 && 
      currentX < windowWidth / 2 + 90;

    setIsHoveredOverTrash(isInBottomTrashZone);
  };

  const handleDragEnd = (_: any, info: any) => {
    setIsDragging(false);

    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const endY = info.point.y;
    const endX = info.point.x;

    const droppedInTrash = 
      endY > windowHeight - 130 && 
      endX > windowWidth / 2 - 100 && 
      endX < windowWidth / 2 + 100;

    if (droppedInTrash) {
      setIsDeleted(true);
      return;
    }

    // Distance calculation for tap vs drag
    const dist = Math.hypot(
      endX - dragStartPosRef.current.x,
      endY - dragStartPosRef.current.y
    );

    if (dist < 8) {
      onOpenCollabModal();
    }

    setIsHoveredOverTrash(false);
  };

  return (
    <>
      {/* Bottom Trash Drop Zone when dragging - ONLY TRASH ICON NO TEXT */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.8 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center justify-center w-14 h-14 rounded-full border transition-all duration-200 pointer-events-none select-none ${
              isHoveredOverTrash
                ? 'bg-rose-600/90 border-rose-400 text-white scale-125 shadow-2xl shadow-rose-500/50'
                : 'bg-slate-900/90 border-rose-500/40 text-rose-300 shadow-xl backdrop-blur-xl'
            }`}
          >
            <Trash2 className={`w-6 h-6 ${isHoveredOverTrash ? 'animate-bounce text-white' : 'text-rose-400'}`} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Compact Draggable Icon Button */}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[9995] touch-none select-none cursor-grab active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={() => {
            if (!isDragging) {
              onOpenCollabModal();
            }
          }}
          className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#0d0d1a]/90 backdrop-blur-md border border-indigo-500/30 hover:border-indigo-400/80 text-white shadow-lg shadow-black/40 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
          title="Live Collaboration Center"
        >
          {/* Subtle Ring without heavy glowing blur */}
          <span className="absolute inset-0 rounded-full border border-white/10 pointer-events-none" />

          {/* Icon Symbol */}
          <div className="relative flex items-center justify-center">
            {isScreenSharing ? (
              <Monitor className="w-5 h-5 text-indigo-400 animate-pulse" />
            ) : isCallActive ? (
              isMuted ? <MicOff className="w-5 h-5 text-amber-400" /> : <Mic className="w-5 h-5 text-emerald-400 animate-pulse" />
            ) : (
              <Radio className="w-5 h-5 text-indigo-400 transition-colors" />
            )}

            {/* Active Live Indicator Dot */}
            <span
              className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#0d0d1a] ${
                isCallActive ? (isMuted ? 'bg-amber-400' : 'bg-emerald-400 animate-ping') : wsStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </div>

          {/* Active Collaborator Count Badge */}
          {activeCount > 1 && (
            <div className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 border border-white/20 text-white text-[10px] font-black shadow-md">
              {activeCount}
            </div>
          )}

          {/* Unread Chat Badge */}
          {unreadChatCount > 0 && (
            <div className="absolute -bottom-1 -left-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black shadow-md">
              {unreadChatCount}
            </div>
          )}
        </button>
      </motion.div>
    </>
  );
}

