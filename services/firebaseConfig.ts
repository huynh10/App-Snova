
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Cấu hình mặc định (Hardcoded) cho dự án BizTask
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyA7347bt9qzzycoHqraDnuBlHUcwriwxTM",
  authDomain: "biztask-app.firebaseapp.com",
  projectId: "biztask-app",
  messagingSenderId: "172194200636",
  appId: "1:172194200636:web:c107a2c8c6f311f8bf1739",
  measurementId: "G-PBDSC24DE0"
};

// Key lưu trữ trong LocalStorage
const STORAGE_KEY = 'biz_firebase_config_v1';

let app: any;
let db: any;
let storage: any;

// 1. Hàm khởi tạo
const initFirebase = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    
    // Nếu người dùng đã bấm reset, không dùng config mặc định nữa
    if (saved === 'RESET') {
      return false;
    }

    const config = (saved && saved !== 'RESET') ? JSON.parse(saved) : DEFAULT_CONFIG;

    if (!app) {
      app = initializeApp(config);
      db = getFirestore(app);
      storage = getStorage(app);
      console.log("Firebase initialized (Firestore & Storage)");
    }
    return true;
  } catch (e) {
    console.error("Failed to initialize Firebase", e);
    if (localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(STORAGE_KEY);
        return initFirebase();
    }
  }
  return false;
};

// Khởi tạo ngay lập tức
initFirebase();

// 2. Hàm lưu config mới từ UI
export const saveFirebaseConfig = (configInput: string): boolean => {
  try {
    let cleanString = configInput.trim();

    const startIndex = cleanString.indexOf('{');
    const endIndex = cleanString.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      cleanString = cleanString.substring(startIndex, endIndex + 1);
    } else {
        if (cleanString.includes(':')) {
            cleanString = `{${cleanString}}`;
        }
    }

    let config: any;

    try {
        config = JSON.parse(cleanString);
    } catch (jsonError) {
        // Try fixing loose JSON
        let jsonString = cleanString;
        jsonString = jsonString.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        jsonString = jsonString.replace(/'/g, '"');
        jsonString = jsonString.replace(/,\s*}/g, '}');
        jsonString = jsonString.replace(/,\s*]/g, ']');

        try {
            config = JSON.parse(jsonString);
        } catch (fixError) {
            throw new Error("Không thể đọc định dạng.");
        }
    }
    
    if (!config.apiKey || !config.projectId) {
      throw new Error("Cấu hình thiếu apiKey hoặc projectId");
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return initFirebase();
  } catch (e: any) {
    console.error("Invalid Config Input", e);
    return false;
  }
};

export const resetFirebaseConfig = async () => {
  // Đánh dấu là đã reset để không tự động dùng DEFAULT_CONFIG nữa
  localStorage.setItem(STORAGE_KEY, 'RESET');
  
  if (app) {
    try {
      await deleteApp(app);
      app = undefined;
      db = undefined;
    } catch (e) {
      console.error("Failed to delete app", e);
    }
  }
  
  // Sử dụng window.location.href thay vì reload() để tương thích tốt hơn với iframe
  window.location.href = window.location.pathname;
};

export const isConfigured = () => !!db;

export { db, storage };
