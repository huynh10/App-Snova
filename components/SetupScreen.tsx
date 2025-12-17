
import React, { useState } from 'react';
import { IconDatabase, IconCheck, IconAlert } from './Icons';
import { saveFirebaseConfig } from '../services/firebaseConfig';

const SetupScreen = () => {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSave = () => {
    setError('');
    
    if (!input.trim()) {
      setError('Vui lòng dán mã cấu hình');
      return;
    }

    const success = saveFirebaseConfig(input);
    if (success) {
      setIsSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      setError('Mã cấu hình không hợp lệ. Hãy đảm bảo bạn copy đúng format JSON.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full max-w-lg space-y-8 animate-fade-in">
        
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-brand-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-brand-500/30">
            <IconDatabase className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Kết nối Máy chủ</h1>
          <p className="text-gray-400">
            Để đồng bộ dữ liệu giữa các thiết bị, vui lòng nhập mã cấu hình Firebase của doanh nghiệp bạn.
          </p>
        </div>

        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Dán mã Firebase Config vào đây:
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            className="w-full bg-gray-900 border border-gray-600 rounded-xl p-4 text-sm font-mono text-green-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder={`{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  ...
}`}
          />
          
          {error && (
            <div className="mt-4 bg-red-900/50 text-red-400 p-3 rounded-lg flex items-center gap-2 text-sm">
              <IconAlert className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {isSuccess && (
            <div className="mt-4 bg-green-900/50 text-green-400 p-3 rounded-lg flex items-center gap-2 text-sm">
              <IconCheck className="w-4 h-4 shrink-0" />
              Đã lưu cấu hình! Đang khởi động lại...
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSuccess}
            className="w-full mt-6 bg-brand-600 hover:bg-brand-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-brand-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSuccess ? 'Đang kết nối...' : 'Lưu & Kết nối'}
          </button>
        </div>

        <div className="text-center text-xs text-gray-500">
          <p>Chưa có mã? Truy cập Firebase Console &gt; Project Settings</p>
        </div>

      </div>
    </div>
  );
};

export default SetupScreen;
