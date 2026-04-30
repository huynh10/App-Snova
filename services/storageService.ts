
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
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { db, storage } from "./firebaseConfig";
import bcrypt from 'bcryptjs';
import { User, Task, TaskStatus, Partner, Product, PartnerTransaction, Customer, PaymentCategory, CustomerTransaction, FinanceCategory, SalaryConfig, Attendance, AdvancePayment, Payroll, EmployeeSalaryInfo, OTStatus, AttendanceFlag, PayrollLock, RowTag, InventoryItem, InventoryTransaction, InventoryCheck } from '../types';

// Collection Names
const USERS_COL = 'users';
const TASKS_COL = 'tasks';
const PARTNERS_COL = 'partners';
const PRODUCTS_COL = 'products';
const PARTNER_TRANSACTIONS_COL = 'partner_transactions';
const CUSTOMERS_COL = 'customers';
const PAYMENT_CATEGORIES_COL = 'payment_categories';
const CUSTOMER_TRANSACTIONS_COL = 'customer_transactions';
const FINANCE_CATEGORIES_COL = 'finance_categories';
const SALARY_CONFIG_COL = 'salary_config';
const ATTENDANCE_COL = 'attendance';
const ADVANCE_PAYMENTS_COL = 'advance_payments';
const PAYROLLS_COL = 'payrolls';
const EMPLOYEE_SALARY_INFO_COL = 'employee_salary_info';
const PAYROLL_LOCKS_COL = 'payroll_locks';
const ROW_TAGS_COL = 'row_tags';

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
// Nén ảnh cực mạnh (max 600px, chất lượng 0.5) để lưu trực tiếp vào Firestore dạng Base64
export const compressImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize logic: Max width/height 600px (Tối ưu cho Base64)
        const MAX_SIZE = 600; 
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
          // Nén chất lượng xuống 0.5 (JPEG) để giảm dung lượng tối đa (khoảng 20-40KB)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          resolve(dataUrl);
        } else {
          reject(new Error("Canvas context error"));
        }
      };
      img.onerror = (err) => reject(new Error("Lỗi tải đối tượng ảnh"));
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(new Error("Lỗi đọc file"));
  });
};

export const uploadImageToStorage = async (file: File, _path: string): Promise<string | null> => {
  try {
    // TỐI ƯU: Không dùng Firebase Storage vì yêu cầu nâng cấp gói (Blaze plan).
    // Lưu trực tiếp chuỗi Base64 siêu nén vào Firestore (Database).
    const base64Data = await compressImageToBase64(file);
    return base64Data;
  } catch (error) {
    console.error("Error processing image for Firestore:", error);
    return null;
  }
};


// --- SHARED LISTENER CACHE ---
// Giữ listener sống để tránh tốn quota (read) khi chuyển tab liên tục
const sharedListeners: Record<string, { unsub: () => void, callbacks: Function[], data: any[] | null }> = {};

const createSharedListener = <T>(
  key: string,
  q: any,
  callback: (data: T[]) => void,
  mapper: (doc: any) => T
) => {
  if (!sharedListeners[key]) {
    const unsub = onSnapshot(q, (snapshot: any) => {
      const data = snapshot.docs.map(mapper);
      sharedListeners[key].data = data;
      sharedListeners[key].callbacks.forEach(cb => cb(data));
    }, (error: any) => {
      console.error(`Error in shared listener ${key}:`, error);
    });
    sharedListeners[key] = { unsub, callbacks: [], data: null };
  }

  sharedListeners[key].callbacks.push(callback);
  if (sharedListeners[key].data) {
    callback(sharedListeners[key].data);
  }

  return () => {
    sharedListeners[key].callbacks = sharedListeners[key].callbacks.filter(cb => cb !== callback);
    // Cố tình KHÔNG gọi unsub() để giữ cache sống, tiết kiệm quota khi chuyển tab
  };
};

const createSharedDocListener = <T>(
  key: string,
  docRef: any,
  callback: (data: T | null) => void,
  mapper: (doc: any) => T
) => {
  if (!sharedListeners[key]) {
    const unsub = onSnapshot(docRef, (doc: any) => {
      const data = doc.exists() ? mapper(doc) : null;
      // We store it as an array of 1 element or empty array to reuse the same cache structure
      sharedListeners[key].data = data ? [data] : [];
      sharedListeners[key].callbacks.forEach(cb => cb(data));
    }, (error: any) => {
      console.error(`Error in shared doc listener ${key}:`, error);
    });
    sharedListeners[key] = { unsub, callbacks: [], data: null };
  }

  sharedListeners[key].callbacks.push(callback);
  if (sharedListeners[key].data) {
    callback(sharedListeners[key].data.length > 0 ? sharedListeners[key].data[0] : null);
  }

  return () => {
    sharedListeners[key].callbacks = sharedListeners[key].callbacks.filter(cb => cb !== callback);
  };
};

export const subscribeToRowTags = (companyId: string, type: RowTag['type'] | RowTag['type'][], callback: (tags: RowTag[]) => void) => {
  const typeStr = Array.isArray(type) ? type.join('_') : type;
  const key = `rowTags_${companyId}_${typeStr}`;
  const q = Array.isArray(type)
    ? query(collection(db, ROW_TAGS_COL), where("companyId", "==", companyId), where("type", "in", type))
    : query(collection(db, ROW_TAGS_COL), where("companyId", "==", companyId), where("type", "==", type));
  
  return createSharedListener(key, q, callback, doc => doc.data() as RowTag);
};

export const apiAddRowTag = async (tag: RowTag) => {
  const docRef = doc(db, ROW_TAGS_COL, tag.id);
  await setDoc(docRef, sanitizePayload(tag));
};

export const apiUpdateRowTag = async (tag: RowTag) => {
  const docRef = doc(db, ROW_TAGS_COL, tag.id);
  await updateDoc(docRef, sanitizePayload(tag));
};

export const apiDeleteRowTag = async (tagId: string) => {
  const docRef = doc(db, ROW_TAGS_COL, tagId);
  await deleteDoc(docRef);
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
  const key = `users_${companyId}`;
  const q = query(collection(db, USERS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as User));
};

export const subscribeToTasks = (companyId: string, callback: (tasks: Task[]) => void) => {
  if (!db) return () => {};
  const key = `tasks_${companyId}`;
  const q = query(collection(db, TASKS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: Task[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as Task));
};

// --- STORAGE REPLACEMENT (Base64) ---

export const uploadTaskImage = async (file: File, taskId: string): Promise<string | null> => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `tasks/${taskId}/${Date.now()}.${ext}`;
  return uploadImageToStorage(file, path);
};

export const deleteTaskAssets = async (taskId: string) => {
  if (!storage) return;
  try {
    const folderRef = ref(storage, `tasks/${taskId}`);
    const res = await listAll(folderRef);
    const deletePromises = res.items.map(itemRef => deleteObject(itemRef));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("Error deleting task assets:", error);
  }
};

// --- CRUD OPERATIONS ---

export const apiRegisterCompany = async (user: User): Promise<boolean> => {
  if (!db) {
    alert("Vui lòng cấu hình Firebase trong file services/firebaseConfig.ts");
    return false;
  }
  try {
    let userToSave = { ...user };
    if (user.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      userToSave.password = hashedPassword;
    }
    await setDoc(doc(db, USERS_COL, user.id), sanitizePayload(userToSave));
    return true;
  } catch (e: any) {
    console.error("Error adding company/user: ", e);
    if (e.code === 'permission-denied') {
        alert("Không thể đăng ký: Firebase Rules đang chặn quyền ghi.");
    }
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
      where("username", "==", username)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      for (const userDoc of querySnapshot.docs) {
        const userData = userDoc.data() as User;
        const storedPassword = userData.password || "";
        const isMatch = storedPassword.startsWith('$2') 
          ? await bcrypt.compare(password, storedPassword)
          : password === storedPassword;

        if (isMatch) {
          const { password: _, ...userWithoutPassword } = userData;
          return { ...userWithoutPassword, id: userDoc.id } as User;
        }
      }
    }
    return null;
  } catch (e: any) {
    console.error("Login error", e);
    if (e.code === 'permission-denied') {
        alert("Lỗi đăng nhập: Firebase Rules đang chặn quyền đọc dữ liệu.");
    }
    return null;
  }
};

export const apiAddUser = async (user: User) => {
  if (!db) return;
  try {
    let userToSave = { ...user };
    
    // Lưu mật khẩu hiển thị (Security Risk!)
    if (user.password) {
      userToSave.displayPassword = user.password;
      
      // Băm mật khẩu chính để đăng nhập
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      userToSave.password = hashedPassword;
    }
    
    await setDoc(doc(db, USERS_COL, user.id), sanitizePayload(userToSave));
  } catch (e) {
    console.error("Error adding user", e);
  }
};

export const apiUpdateUser = async (user: User) => {
  if (!db) return;
  try {
    const userRef = doc(db, USERS_COL, user.id);
    const { id, ...data } = user;
    
    // Nếu có mật khẩu mới, cập nhật cả bản băm và bản hiển thị
    if (data.password && !data.password.startsWith('$2')) {
      data.displayPassword = data.password;
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
    
    await updateDoc(userRef, sanitizePayload(data));
  } catch (e) {
    console.error("Error updating user", e);
  }
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
  try {
    await setDoc(doc(db, TASKS_COL, task.id), sanitizePayload(task));
  } catch (e: any) {
    if (e.code === 'resource-exhausted') {
      alert("Ảnh quá nặng hoặc quá nhiều ảnh. Vui lòng giảm bớt ảnh.");
    } else {
      console.error("Add Task Error", e);
      if (e.code === 'permission-denied') alert("Không thể thêm việc: Lỗi quyền truy cập.");
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
    } else {
       console.error("Update Task Error", e);
    }
  }
};

export const apiDeleteTask = async (taskId: string) => {
  if (!db) return;
  await deleteDoc(doc(db, TASKS_COL, taskId));
};

export const apiCheckUsernameExists = async (companyName: string, username: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const q = query(
      collection(db, USERS_COL), 
      where("companyName", "==", companyName),
      where("username", "==", username)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (e) {
    console.error("Error checking username:", e);
    // Nếu lỗi permission, trả về true để chặn đăng ký (an toàn hơn là cho phép trùng)
    return true; 
  }
};

export const cleanupOldData = async (companyId: string) => {
    if (!db) return;
    try {
        const seventyDaysAgo = new Date();
        seventyDaysAgo.setDate(seventyDaysAgo.getDate() - 70);
        
        // 1. Dọn dẹp Tasks cũ (COMPLETED)
        const qTasks = query(
            collection(db, TASKS_COL),
            where("companyId", "==", companyId),
            where("status", "==", TaskStatus.COMPLETED)
        );

        const snapshotTasks = await getDocs(qTasks);
        let batch = writeBatch(db);
        let countTasks = 0;

        for (const doc of snapshotTasks.docs) {
            const task = doc.data() as Task;
            const dateToCheck = task.completedAt ? new Date(task.completedAt) : new Date(task.createdAt);
            
            if (dateToCheck < seventyDaysAgo) {
                batch.delete(doc.ref);
                countTasks++;
                // Commit theo batch nếu quá lớn (Firestore limit 500 ops/batch)
                if (countTasks % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                }
            }
        }

        if (countTasks % 400 !== 0 && countTasks > 0) {
            await batch.commit();
        }

        // 2. Dọn dẹp Attendance cũ
        const qAttendance = query(
            collection(db, ATTENDANCE_COL),
            where("companyId", "==", companyId)
        );
        
        const snapshotAttendance = await getDocs(qAttendance);
        batch = writeBatch(db);
        let countAttendance = 0;
        
        for (const doc of snapshotAttendance.docs) {
            const att = doc.data() as Attendance;
            const attDate = new Date(att.date); // att.date format: YYYY-MM-DD
            
            if (attDate < seventyDaysAgo) {
                batch.delete(doc.ref);
                countAttendance++;
                if (countAttendance % 400 === 0) {
                    await batch.commit();
                    batch = writeBatch(db);
                }
            }
        }
        
        if (countAttendance % 400 !== 0 && countAttendance > 0) {
            await batch.commit();
        }

        if (countTasks > 0 || countAttendance > 0) {
            console.log(`Đã dọn dẹp ${countTasks} công việc và ${countAttendance} bản ghi chấm công cũ (hơn 70 ngày).`);
        }
    } catch (e) {
        console.error("Lỗi khi dọn dẹp dữ liệu cũ:", e);
    }
};

// --- PARTNERS ---
export const subscribeToPartners = (companyId: string, callback: (partners: Partner[]) => void) => {
  if (!db) return () => {};
  const key = `partners_${companyId}`;
  const q = query(collection(db, PARTNERS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as Partner));
};

export const apiAddPartner = async (partner: Partner) => {
  if (!db) return;
  await setDoc(doc(db, PARTNERS_COL, partner.id), sanitizePayload(partner));
};

export const apiUpdatePartner = async (partner: Partner) => {
  if (!db) return;
  const { id, ...data } = partner;
  await updateDoc(doc(db, PARTNERS_COL, id), sanitizePayload(data));
};

export const apiDeletePartner = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, PARTNERS_COL, id));
};

// --- PRODUCTS ---
export const subscribeToProducts = (companyId: string, callback: (products: Product[]) => void) => {
  if (!db) return () => {};
  const key = `products_${companyId}`;
  const q = query(collection(db, PRODUCTS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as Product));
};

export const apiAddProduct = async (product: Product) => {
  if (!db) return;
  await setDoc(doc(db, PRODUCTS_COL, product.id), sanitizePayload(product));
};

export const apiUpdateProduct = async (product: Product) => {
  if (!db) return;
  const { id, ...data } = product;
  await updateDoc(doc(db, PRODUCTS_COL, id), sanitizePayload(data));
};

export const apiDeleteProduct = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, PRODUCTS_COL, id));
};

// --- PARTNER TRANSACTIONS ---
export const subscribeToPartnerTransactions = (companyId: string, callback: (transactions: PartnerTransaction[]) => void) => {
  if (!db) return () => {};
  const key = `partnerTx_${companyId}`;
  const q = query(collection(db, PARTNER_TRANSACTIONS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: PartnerTransaction[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as PartnerTransaction));
};

export const apiAddPartnerTransaction = async (transaction: PartnerTransaction) => {
  if (!db) return;
  await setDoc(doc(db, PARTNER_TRANSACTIONS_COL, transaction.id), sanitizePayload(transaction));
};

export const apiUpdatePartnerTransaction = async (transaction: PartnerTransaction) => {
  if (!db) return;
  const { id, ...data } = transaction;
  await updateDoc(doc(db, PARTNER_TRANSACTIONS_COL, id), sanitizePayload(data));
};

export const apiDeletePartnerTransaction = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, PARTNER_TRANSACTIONS_COL, id));
};

// --- CUSTOMERS ---
export const subscribeToCustomers = (companyId: string, callback: (customers: Customer[]) => void) => {
  if (!db) return () => {};
  const key = `customers_${companyId}`;
  const q = query(collection(db, CUSTOMERS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: Customer[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as Customer));
};

export const apiAddCustomer = async (customer: Customer) => {
  if (!db) return;
  await setDoc(doc(db, CUSTOMERS_COL, customer.id), sanitizePayload(customer));
};

export const apiUpdateCustomer = async (customer: Customer) => {
  if (!db) return;
  const { id, ...data } = customer;
  await updateDoc(doc(db, CUSTOMERS_COL, id), sanitizePayload(data));
};

export const apiDeleteCustomer = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, CUSTOMERS_COL, id));
};

// --- PAYMENT CATEGORIES ---
export const subscribeToPaymentCategories = (companyId: string, callback: (categories: PaymentCategory[]) => void) => {
  if (!db) return () => {};
  const key = `paymentCat_${companyId}`;
  const q = query(collection(db, PAYMENT_CATEGORIES_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: PaymentCategory[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as PaymentCategory));
};

export const apiAddPaymentCategory = async (category: PaymentCategory) => {
  if (!db) return;
  await setDoc(doc(db, PAYMENT_CATEGORIES_COL, category.id), sanitizePayload(category));
};

export const apiUpdatePaymentCategory = async (category: PaymentCategory) => {
  if (!db) return;
  const { id, ...data } = category;
  await updateDoc(doc(db, PAYMENT_CATEGORIES_COL, id), sanitizePayload(data));
};

export const apiDeletePaymentCategory = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, PAYMENT_CATEGORIES_COL, id));
};

// --- CUSTOMER TRANSACTIONS ---
export const subscribeToCustomerTransactions = (companyId: string, callback: (transactions: CustomerTransaction[]) => void) => {
  if (!db) return () => {};
  const key = `customerTx_${companyId}`;
  const q = query(collection(db, CUSTOMER_TRANSACTIONS_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: CustomerTransaction[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as CustomerTransaction));
};

export const apiAddCustomerTransaction = async (transaction: CustomerTransaction) => {
  if (!db) return;
  await setDoc(doc(db, CUSTOMER_TRANSACTIONS_COL, transaction.id), sanitizePayload(transaction));
};

export const apiUpdateCustomerTransaction = async (transaction: CustomerTransaction) => {
  if (!db) return;
  const { id, ...data } = transaction;
  await updateDoc(doc(db, CUSTOMER_TRANSACTIONS_COL, id), sanitizePayload(data));
};

export const apiDeleteCustomerTransaction = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, CUSTOMER_TRANSACTIONS_COL, id));
};

// --- FINANCE CATEGORIES ---
export const subscribeToFinanceCategories = (companyId: string, callback: (categories: FinanceCategory[]) => void) => {
  if (!db) return () => {};
  const key = `financeCat_${companyId}`;
  const q = query(collection(db, FINANCE_CATEGORIES_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: FinanceCategory[]) => {
    const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(sorted);
  }, doc => ({ ...doc.data(), id: doc.id } as FinanceCategory));
};

export const apiAddFinanceCategory = async (category: FinanceCategory) => {
  if (!db) return;
  await setDoc(doc(db, FINANCE_CATEGORIES_COL, category.id), sanitizePayload(category));
};

export const apiUpdateFinanceCategory = async (category: FinanceCategory) => {
  if (!db) return;
  const { id, ...data } = category;
  await updateDoc(doc(db, FINANCE_CATEGORIES_COL, id), sanitizePayload(data));
};

export const apiDeleteFinanceCategory = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, FINANCE_CATEGORIES_COL, id));
};

// --- SALARY CONFIG ---
export const subscribeToSalaryConfig = (companyId: string, callback: (config: SalaryConfig | null) => void) => {
  if (!db) return () => {};
  const key = `salaryConfig_${companyId}`;
  const q = query(collection(db, SALARY_CONFIG_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, (items: SalaryConfig[]) => {
    callback(items.length > 0 ? items[0] : null);
  }, doc => ({ ...doc.data(), id: doc.id } as SalaryConfig));
};

export const apiUpdateSalaryConfig = async (config: SalaryConfig) => {
  if (!db) return;
  await setDoc(doc(db, SALARY_CONFIG_COL, config.id), sanitizePayload(config));
};

// --- ATTENDANCE ---
export const getMissingCheckOuts = async (companyId: string, employeeId: string, config: SalaryConfig | null): Promise<Attendance[]> => {
  if (!db) return [];
  const q = query(
    collection(db, ATTENDANCE_COL),
    where("companyId", "==", companyId),
    where("employeeId", "==", employeeId)
  );
  const snapshot = await getDocs(q);
  const items: Attendance[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data() as Attendance;
    
    // Simulate cronjob: Auto check-out at 18:00 for past days
    if (data.checkIn && !data.checkOut && data.date < today) {
      const updatedAtt = {
        ...data,
        id: docSnapshot.id,
        checkOut: "18:00:00",
        flag: AttendanceFlag.MISSING_OUT
      };
      
      const stats = calculateAttendanceStats(updatedAtt, config);
      updatedAtt.nc = stats.nc;
      updatedAtt.tc = stats.tc;
      updatedAtt.otHours = stats.otHours;
      updatedAtt.otStatus = stats.otStatus;
      
      await updateDoc(doc(db, ATTENDANCE_COL, docSnapshot.id), sanitizePayload(updatedAtt));
      
      if (!updatedAtt.missingOutReason) {
        items.push(updatedAtt);
      }
    } else if (data.flag === AttendanceFlag.MISSING_OUT && !data.missingOutReason) {
      // Already auto checked-out, but reason not provided yet
      items.push({ ...data, id: docSnapshot.id });
    }
  }
  return items;
};

export const subscribeToAttendance = (companyId: string, month: string, callback: (attendance: Attendance[]) => void) => {
  if (!db) return () => {};
  const key = `attendance_${companyId}`;
  const q = query(
    collection(db, ATTENDANCE_COL), 
    where("companyId", "==", companyId)
  );
  return createSharedListener(key, q, (items: Attendance[]) => {
    // Filter by month (YYYY-MM) on client side to avoid composite index requirement
    callback(items.filter(item => item.date && item.date.startsWith(month)));
  }, doc => ({ ...doc.data(), id: doc.id } as Attendance));
};

export const apiAddAttendance = async (attendance: Attendance) => {
  if (!db) return;
  await setDoc(doc(db, ATTENDANCE_COL, attendance.id), sanitizePayload(attendance));
};

export const apiUpdateAttendance = async (attendance: Attendance) => {
  if (!db) return;
  const { id, ...data } = attendance;
  await updateDoc(doc(db, ATTENDANCE_COL, id), sanitizePayload(data));
};

export const apiDeleteAttendance = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, ATTENDANCE_COL, id));
};

export const apiDeleteAttendanceByMonth = async (companyId: string, month: string) => {
  if (!db) return;
  const q = query(collection(db, ATTENDANCE_COL), where("companyId", "==", companyId));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data() as Attendance;
    if (data.date && data.date.startsWith(month)) {
      batch.delete(doc.ref);
      count++;
    }
  });
  if (count > 0) {
    await batch.commit();
  }
};

// --- ADVANCE PAYMENTS ---
export const subscribeToAdvancePayments = (companyId: string, month: string, callback: (payments: AdvancePayment[]) => void) => {
  if (!db) return () => {};
  const key = `advancePayments_${companyId}`;
  const q = query(
    collection(db, ADVANCE_PAYMENTS_COL), 
    where("companyId", "==", companyId)
  );
  return createSharedListener(key, q, (items: AdvancePayment[]) => {
    // Filter by month (YYYY-MM) on client side to avoid composite index requirement
    callback(items.filter(item => item.date && item.date.startsWith(month)));
  }, doc => ({ ...doc.data(), id: doc.id } as AdvancePayment));
};

export const apiAddAdvancePayment = async (payment: AdvancePayment) => {
  if (!db) return;
  await setDoc(doc(db, ADVANCE_PAYMENTS_COL, payment.id), sanitizePayload(payment));
};

export const apiUpdateAdvancePayment = async (payment: AdvancePayment) => {
  if (!db) return;
  const { id, ...data } = payment;
  await updateDoc(doc(db, ADVANCE_PAYMENTS_COL, id), sanitizePayload(data));
};

export const apiDeleteAdvancePayment = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, ADVANCE_PAYMENTS_COL, id));
};

// --- ATTENDANCE CALCULATION ---
export const calculateAttendanceStats = (att: Attendance, config: SalaryConfig | null) => {
  // Constants as per user request
  const morningStart = 8 * 60; // 08:00
  const morningEnd = 12 * 60; // 12:00
  const afternoonStart = 14 * 60; // 14:00
  const afternoonEnd = 18 * 60; // 18:00
  const otBuffer = 30; // 30 mins buffer
  const standardDayHours = 8;

  const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  if (!att.checkIn) {
    if (att.checkOut) {
      return { nc: 0, tc: 0, otStatus: OTStatus.NONE, otHours: 0, flag: AttendanceFlag.DATA_ERROR };
    }
    return { nc: 0, tc: 0, otStatus: OTStatus.NONE, otHours: 0, flag: AttendanceFlag.NORMAL };
  }

  const checkInTime = parseTime(att.checkIn);
  let checkOutTime: number | undefined;
  let flag: AttendanceFlag = att.flag === AttendanceFlag.MISSING_OUT || att.flag === AttendanceFlag.DATA_ERROR 
    ? att.flag 
    : AttendanceFlag.NORMAL;

  if (att.checkOut) {
    checkOutTime = parseTime(att.checkOut);
  } else {
    // Check if day has passed to auto-close (simulating cronjob)
    const today = new Date().toISOString().split('T')[0];
    if (att.date < today) {
      checkOutTime = afternoonEnd; // Default to 18:00
      flag = AttendanceFlag.MISSING_OUT;
    }
  }

  if (checkOutTime === undefined) {
    return { nc: 0, tc: 0, otStatus: OTStatus.NONE, otHours: 0, flag: AttendanceFlag.NORMAL };
  }

  // Normalize In/Out for standard work hours
  // Early check-in counts from morningStart
  const effectiveIn = (checkInTime >= morningEnd && checkInTime < afternoonStart) 
    ? afternoonStart 
    : Math.max(morningStart, checkInTime);
  
  const effectiveOut = checkOutTime;

  // Calculate standard hours worked (excluding lunch 12-14)
  let standardMins = 0;
  
  // Morning part (08:00 - 12:00)
  if (effectiveIn < morningEnd) {
    const start = effectiveIn;
    const end = Math.min(morningEnd, effectiveOut);
    if (end > start) standardMins += (end - start);
  }
  
  // Afternoon part (14:00 - 18:00)
  if (effectiveOut > afternoonStart) {
    const start = Math.max(afternoonStart, effectiveIn);
    const end = Math.min(afternoonEnd, effectiveOut);
    if (end > start) standardMins += (end - start);
  }

  let nc = standardMins / 60;

  // OT Logic
  let otHours = 0;
  let otStatus: OTStatus = att.otStatus || OTStatus.NONE;

  if (checkOutTime >= afternoonEnd + otBuffer) {
    otHours = (checkOutTime - afternoonEnd) / 60;
    // If it was NONE, it becomes PENDING when checkOut is late
    if (otStatus === OTStatus.NONE) {
      otStatus = OTStatus.PENDING;
    }
  } else {
    otHours = 0;
    otStatus = OTStatus.NONE;
  }

  // Apply Sunday Coefficient
  const isSunday = new Date(att.date).getDay() === 0;
  if (isSunday && config?.sundayCoefficient) {
    nc = nc * config.sundayCoefficient;
    otHours = otHours * config.sundayCoefficient;
  }

  // Flag logic for Late/Early
  if (flag === AttendanceFlag.NORMAL) {
    const isLate = checkInTime > morningStart && !(checkInTime >= morningEnd && checkInTime <= afternoonStart);
    const isEarly = checkOutTime < afternoonEnd && checkOutTime > morningStart;
    if (isLate || isEarly) {
      flag = AttendanceFlag.LATE_EARLY;
    }
  }

  return { 
    nc: Math.round(nc * 100) / 100, 
    tc: otStatus === 'APPROVED' ? Math.round(otHours * 10) / 10 : 0,
    otStatus,
    otHours: Math.round(otHours * 10) / 10,
    flag
  };
};

// --- PAYROLLS ---
export const subscribeToPayrolls = (companyId: string, month: string, callback: (payrolls: Payroll[]) => void) => {
  if (!db) return () => {};
  const key = `payrolls_${companyId}_${month}`;
  const q = query(
    collection(db, PAYROLLS_COL), 
    where("companyId", "==", companyId),
    where("month", "==", month)
  );
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as Payroll));
};

export const apiUpdatePayroll = async (payroll: Payroll) => {
  if (!db) return;
  await setDoc(doc(db, PAYROLLS_COL, payroll.id), sanitizePayload(payroll));
};

// --- EMPLOYEE SALARY INFO ---
export const subscribeToEmployeeSalaryInfo = (companyId: string, callback: (info: EmployeeSalaryInfo[]) => void) => {
  if (!db) return () => {};
  const key = `employeeSalaryInfo_${companyId}`;
  const q = query(collection(db, EMPLOYEE_SALARY_INFO_COL), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as EmployeeSalaryInfo));
};

export const apiUpdateEmployeeSalaryInfo = async (info: EmployeeSalaryInfo) => {
  if (!db) return;
  await setDoc(doc(db, EMPLOYEE_SALARY_INFO_COL, info.id), sanitizePayload(info));
};

// --- PAYROLL LOCKS ---
export const apiDeletePayrollsByMonth = async (companyId: string, month: string) => {
  if (!db) return;
  const q = query(collection(db, PAYROLLS_COL), where("companyId", "==", companyId), where("month", "==", month));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
};

export const subscribeToPayrollLocks = (companyId: string, month: string, callback: (lock: PayrollLock | null) => void) => {
  if (!db) return () => {};
  const lockId = `${companyId}_${month}`;
  const lockRef = doc(db, PAYROLL_LOCKS_COL, lockId);
  return createSharedDocListener(lockId, lockRef, callback, doc => ({ ...doc.data(), id: doc.id } as PayrollLock));
};

export const apiUpdatePayrollLock = async (lock: PayrollLock) => {
  if (!db) return;
  await setDoc(doc(db, PAYROLL_LOCKS_COL, lock.id), sanitizePayload(lock));
};

// --- INVENTORY ITEMS ---
export const subscribeToInventoryItems = (companyId: string, callback: (items: InventoryItem[]) => void) => {
  if (!db) return () => {};
  const key = `inventoryItems_${companyId}`;
  const q = query(collection(db, 'inventoryItems'), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as InventoryItem));
};

export const apiAddInventoryItem = async (item: InventoryItem) => {
  if (!db) return;
  await setDoc(doc(db, 'inventoryItems', item.id), sanitizePayload(item));
};

export const apiUpdateInventoryItem = async (item: InventoryItem) => {
  if (!db) return;
  await updateDoc(doc(db, 'inventoryItems', item.id), sanitizePayload(item));
};

export const apiDeleteInventoryItem = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, 'inventoryItems', id));
};

// --- INVENTORY TRANSACTIONS ---
export const subscribeToInventoryTransactions = (companyId: string, callback: (txs: InventoryTransaction[]) => void) => {
  if (!db) return () => {};
  const key = `inventoryTransactions_${companyId}`;
  const q = query(collection(db, 'inventoryTransactions'), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as InventoryTransaction));
};

export const apiAddInventoryTransaction = async (tx: InventoryTransaction) => {
  if (!db) return;
  await setDoc(doc(db, 'inventoryTransactions', tx.id), sanitizePayload(tx));
};

export const apiUpdateInventoryTransaction = async (tx: InventoryTransaction) => {
  if (!db) return;
  await updateDoc(doc(db, 'inventoryTransactions', tx.id), sanitizePayload(tx));
};

export const apiDeleteInventoryTransaction = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, 'inventoryTransactions', id));
};

// --- INVENTORY CHECKS ---
export const subscribeToInventoryChecks = (companyId: string, callback: (checks: InventoryCheck[]) => void) => {
  if (!db) return () => {};
  const key = `inventoryChecks_${companyId}`;
  const q = query(collection(db, 'inventoryChecks'), where("companyId", "==", companyId));
  return createSharedListener(key, q, callback, doc => ({ ...doc.data(), id: doc.id } as InventoryCheck));
};

export const apiAddInventoryCheck = async (check: InventoryCheck) => {
  if (!db) return;
  await setDoc(doc(db, 'inventoryChecks', check.id), sanitizePayload(check));
};
