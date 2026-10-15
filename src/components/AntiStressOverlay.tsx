import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

export const AntiStressOverlay: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 5000); // 5 seconds
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  return (
      <>{isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md"
        >
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold text-white">หายใจเข้า-ออก...</h2>
            <motion.div
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="w-32 h-32 rounded-full border-4 border-cyan-500 mx-auto"
            />
            <p className="text-slate-400">ผ่อนคลายสักครู่ เพื่อรีเซ็ตสมาธิ</p>
          </div>
        </motion.div>
      )}</>
  );
};
