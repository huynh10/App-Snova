import React, { useRef, useState, useEffect, useCallback } from 'react';
import { IconX } from './Icons';

interface CameraModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraModal({ onCapture, onClose }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError('Không thể truy cập camera. Vui lòng cấp quyền truy cập máy ảnh cho trình duyệt.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `attendance_${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center p-4">
      <button 
        onClick={handleClose}
        className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/40 p-2 rounded-full backdrop-blur-sm transition-colors z-10"
      >
        <IconX className="w-6 h-6" />
      </button>
      
      {error ? (
        <div className="bg-white p-6 rounded-xl text-center max-w-sm">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={handleClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-bold"
          >
            Đóng
          </button>
        </div>
      ) : (
        <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-gray-800">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button 
              onClick={handleCapture}
              className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 bg-white rounded-full border-2 border-gray-200"></div>
            </button>
          </div>
          <div className="absolute top-4 left-0 right-0 text-center">
            <span className="bg-black/50 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
              Vui lòng chụp ảnh khuôn mặt của bạn
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
