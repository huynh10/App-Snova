
export enum UserRole {
  DIRECTOR = 'DIRECTOR', // Giám đốc (Người tạo công ty)
  MANAGER = 'MANAGER',   // Quản lý (Chức vụ mới)
  EMPLOYEE = 'EMPLOYEE'  // Nhân viên
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface User {
  id: string;
  name: string;
  username: string; // Tên đăng nhập
  password?: string; // Mật khẩu (In real app, hash this!)
  companyName: string; // Tên công ty để đăng nhập
  companyId: string; // ID ẩn để link dữ liệu
  role: UserRole;
  avatar: string;
  email?: string;
}

export interface Task {
  id: string;
  companyId: string; // Link task to a specific company
  title: string;
  description: string;
  assigneeId: string;
  creatorId: string;
  dueDate: string; // ISO string
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  completedAt?: string | null;
  attachments?: string[]; // Danh sách URL ảnh đính kèm khi giao việc
  completionImage?: string; // URL ảnh minh chứng khi hoàn thành
}
