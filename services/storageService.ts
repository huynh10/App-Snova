
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot,
  getDocs,
  setDoc,
  writeBatch
} from "firebase/firestore";
// REMOVED: import { ref, uploadBytes, ... } from "firebase/storage";
import { db } from "./firebaseConfig";
import { User, Task, TaskStatus } from '../types';

// Collection Names
const USERS_COL = 'users';
const TASKS_COL = 'tasks';

// --- HELPER: Sanitize Data for Firestore ---
const sanitizePayload = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  
  const clean = { ...data };
  Object.keys(clean).forEach(key => {
    if (clean[key] === undefined) {
      clean[key] = null;
    }
  });
  return clean;
};

// --- HELPER: Compress Image to Base64 ---
// Vì không dùng Storage, ta nén ảnh thật nhỏ để lưu trực tiếp vào text
export const compressImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize logic: Max width/height 700px (Reduced from 800 to ensure Firestore safety)
        const MAX_SIZE = 700; 
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Compress quality to 0.6 (JPEG)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(dataUrl);
        } else {
          reject(new Error("Canvas context error"));
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};


// --- SESSION MANAGEMENT ---
export const getStoredSession = (): User | null => {
  try {
    const data = localStorage.getItem('biz_session');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};

export const saveStoredSession = (user: User | null) => {
  if (user) {
    localStorage.setItem('biz_session', JSON.stringify(user));
  } else {
    localStorage.removeItem('biz_session');
  }
};

// --- REAL-TIME LISTENERS ---

export const subscribeToUsers = (companyId: string, callback: (users: User[]) => void) => {
  if (!db) return () => {};
  
  const q = query(collection(db, USERS_COL), where("companyId", "==", companyId));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const users: User[] = [];
    snapshot.forEach((doc) => {
      users.push({ ...doc.data(), id: doc.id } as User);
    });
    callback(users);
  });

  return unsubscribe;
};

export const subscribeToTasks = (companyId: string, callback: (tasks: Task[]) => void) => {
  if (!db) return () => {};

  const q = query(collection(db, TASKS_COL), where("companyId", "==", companyId));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const tasks: Task[] = [];
    snapshot.forEach((doc) => {
      tasks.push({ ...doc.data(), id: doc.id } as Task);
    });
    tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(tasks);
  });

  return unsubscribe;
};

// --- STORAGE REPLACEMENT (Base64) ---

export const uploadTaskImage = async (file: File, taskId: string): Promise<string | null> => {
  // Thay vì upload lên bucket, ta nén file thành chuỗi Base64
  try {
     console.log("Processing image (Compressing)...");
     const base64String = await compressImageToBase64(file);
     return base64String;
  } catch (e) {
     console.error("Error compressing image:", e);
     alert("Lỗi xử lý ảnh (File có thể bị hỏng). Vui lòng chọn ảnh khác.");
     return null;
  }
};

// Hàm này không còn cần thiết vì ảnh lưu trong document, 
// xóa document là mất ảnh luôn. Giữ lại để code cũ không lỗi.
export const deleteTaskAssets = async (taskId: string) => {
   // No-op
   console.log("Skipping asset delete (using Base64 storage)");
};

// --- CRUD OPERATIONS ---

export const apiRegisterCompany = async (user: User): Promise<boolean> => {
  if (!db) {
    alert("Vui lòng cấu hình Firebase trong file services/firebaseConfig.ts");
    return false;
  }
  try {
    await setDoc(doc(db, USERS_COL, user.id), sanitizePayload(user));
    return true;
  } catch (e) {
    console.error("Error adding company/user: ", e);
    return false;
  }
};

export const apiLogin = async (companyName: string, username: string, password: string): Promise<User | null> => {
  if (!db) {
    alert("Vui lòng cấu hình Firebase trong file services/firebaseConfig.ts");
    return null;
  }
  try {
    const q = query(
      collection(db, USERS_COL), 
      where("companyName", "==", companyName),
      where("username", "==", username),
      where("password", "==", password)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      return { ...userDoc.data(), id: userDoc.id } as User;
    }
    return null;
  } catch (e) {
    console.error("Login error", e);
    return null;
  }
};

export const apiAddUser = async (user: User) => {
  if (!db) return;
  await setDoc(doc(db, USERS_COL, user.id), sanitizePayload(user));
};

export const apiUpdateUser = async (user: User) => {
  if (!db) return;
  const userRef = doc(db, USERS_COL, user.id);
  const { id, ...data } = user;
  await updateDoc(userRef, sanitizePayload(data));
};

export const apiDeleteUser = async (userId: string) => {
  if (!db) return;
  try {
      await deleteDoc(doc(db, USERS_COL, userId));
  } catch (error) {
      console.error("Error deleting user:", error);
  }
};

export const apiAddTask = async (task: Task) => {
  if (!db) return;
  // Firestore Document limit is 1MB. 
  // With compressed images (approx 50-100KB each), we should be fine with 3-5 images.
  try {
    await setDoc(doc(db, TASKS_COL, task.id), sanitizePayload(task));
  } catch (e: any) {
    if (e.code === 'resource-exhausted') {
      alert("Ảnh quá nặng hoặc quá nhiều ảnh. Vui lòng giảm bớt ảnh.");
    } else {
      console.error("Add Task Error", e);
    }
  }
};

export const apiUpdateTask = async (task: Task) => {
  if (!db) return;
  const taskRef = doc(db, TASKS_COL, task.id);
  try {
    await updateDoc(taskRef, sanitizePayload(task)); 
  } catch (e: any) {
    if (e.code === 'resource-exhausted') {
       alert("Dữ liệu quá lớn (Có thể do quá nhiều ảnh). Vui lòng xóa bớt ảnh cũ trước khi thêm mới.");
    }
  }
};

export const apiDeleteTask = async (taskId: string) => {
  if (!db) return;
  await deleteDoc(doc(db, TASKS_COL, taskId));
};

export const apiCheckUsernameExists = async (companyName: string, username: string): Promise<boolean> => {
  if (!db) return false;
  const q = query(
    collection(db, USERS_COL), 
    where("companyName", "==", companyName),
    where("username", "==", username)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const cleanupOldTasks = async (companyId: string) => {
    if (!db) return;
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const q = query(
            collection(db, TASKS_COL),
            where("companyId", "==", companyId),
            where("status", "==", TaskStatus.COMPLETED)
        );

        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        let count = 0;

        for (const doc of snapshot.docs) {
            const task = doc.data() as Task;
            const dateToCheck = task.completedAt ? new Date(task.completedAt) : new Date(task.createdAt);
            
            if (dateToCheck < ninetyDaysAgo) {
                batch.delete(doc.ref);
                count++;
            }
        }

        if (count > 0) {
            await batch.commit();
            console.log(`Đã dọn dẹp ${count} công việc cũ.`);
        }
    } catch (e) {
        console.error("Lỗi khi dọn dẹp dữ liệu cũ:", e);
    }
};
