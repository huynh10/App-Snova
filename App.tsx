
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  User, 
  Task, 
  UserRole, 
  TaskStatus, 
  TaskPriority, 
} from './types';
import CreateTaskModal from './components/CreateTaskModal';
import TaskDetailModal from './components/TaskDetailModal';
import Auth from './components/Auth';
import UserManagement from './components/UserManagement';
import SetupScreen from './components/SetupScreen'; 
import { 
  getStoredSession, 
  saveStoredSession,
  subscribeToTasks,
  subscribeToUsers,
  apiAddTask,
  apiUpdateTask,
  apiAddUser,
  apiDeleteUser,
  apiUpdateUser,
  cleanupOldTasks,
  uploadTaskImage,
  compressImageToBase64
} from './services/storageService';
import { isConfigured } from './services/firebaseConfig';
import { 
  IconHome, 
  IconList, 
  IconUser, 
  IconCheck, 
  IconClock, 
  IconAlert,
  IconPlus,
  IconLogOut,
  IconSearch,
  IconShare,
  IconChart,
  IconBuilding,
  IconCloud,
  IconUpload,
  IconBriefcase, 
  IconFlag,
  IconEdit,
  IconImage,
  IconX,
  IconKey,
  IconCamera
} from './components/Icons';

import { Capacitor } from '@capacitor/core';
import { Badge } from '@capawesome/capacitor-badge';

// --- Helper Functions ---
const isOverdue = (dateString: string) => {
  const due = new Date(dateString);
  const now = new Date();
  return due < now;
};

const isDueSoon = (dateString: string, days: number = 3) => {
    const due = new Date(dateString);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit',
    day: '2-digit', 
    month: '2-digit',
  }).format(date);
};

const getDeadlineInfo = (dueDateStr: string, status: TaskStatus) => {
  if (status === TaskStatus.COMPLETED) return null;

  const due = new Date(dueDateStr);
  const now = new Date();
  
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'Quá hạn', className: 'bg-red-600 text-white', icon: true };
  }
  
  if (diffDays === 0) {
    return { text: 'Hết hạn hôm nay', className: 'bg-orange-100 text-orange-800 border border-orange-200' };
  }

  if (diffDays <= 3) {
    return { text: `Còn ${diffDays} ngày`, className: 'bg-orange-50 text-orange-700 border border-orange-200' };
  }

  if (diffDays <= 7) {
    return { text: `Còn ${diffDays} ngày`, className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' };
  }

  return { text: `Còn ${diffDays} ngày`, className: 'bg-gray-100 text-gray-600 border border-gray-200' };
};

export default function App() {
  const [isSystemReady, setIsSystemReady] = useState(isConfigured());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'team' | 'profile'>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null); 
  const [viewingTask, setViewingTask] = useState<Task | null>(null); 
  
  // Completion Modal State
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);

  // Change Password Modal State
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [newSelfPass, setNewSelfPass] = useState('');

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL' | 'OVERDUE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reassignTask, setReassignTask] = useState<Task | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  
  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const session = getStoredSession();
    if (session) {
      setCurrentUser(session);
    }
  }, []);

  useEffect(() => {
    saveStoredSession(currentUser);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !isSystemReady) {
      setTasks([]);
      setUsers([]);
      return;
    }

    setIsLoadingData(true);
    const unsubTasks = subscribeToTasks(currentUser.companyId, (updatedTasks) => {
      setTasks(updatedTasks);
      setIsLoadingData(false);
    });
    const unsubUsers = subscribeToUsers(currentUser.companyId, (updatedUsers) => {
      setUsers(updatedUsers);
    });
    cleanupOldTasks(currentUser.companyId);

    return () => {
      unsubTasks();
      unsubUsers();
    };
  }, [currentUser?.companyId, isSystemReady]); 

  const myPendingTaskCount = useMemo(() => {
    if (!currentUser || currentUser.role === UserRole.MANAGER) return 0;
    return tasks.filter(t => t.assigneeId === currentUser.id && t.status === TaskStatus.TODO).length;
  }, [tasks, currentUser]);

  const updateAppBadge = async (count: number) => {
    try {
      if (isNative) {
        await Badge.requestPermissions();
        if (count > 0) {
          await Badge.set({ count });
        } else {
          await Badge.clear();
        }
      } else {
        if ('setAppBadge' in navigator) {
          if (count > 0) {
            navigator.setAppBadge(count).catch(e => console.error("Set badge error", e));
          } else {
            navigator.clearAppBadge().catch(e => console.error("Clear badge error", e));
          }
        }
      }
    } catch (e) {
      console.error("Badge Error:", e);
    }
  };

  useEffect(() => {
    updateAppBadge(myPendingTaskCount);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateAppBadge(myPendingTaskCount);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [myPendingTaskCount, isNative]);

  const requestNotificationAccess = async () => {
    if (isNative) {
       await Badge.requestPermissions();
       alert("Đã yêu cầu quyền thông báo.");
       return;
    }
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') updateAppBadge(myPendingTaskCount);
  };

  const testBadge = async () => {
     try {
       const randomNum = Math.floor(Math.random() * 10) + 1;
       if (isNative) {
         await Badge.set({ count: randomNum });
         alert(`[Native] Badge: ${randomNum}`);
       } else {
         if ('setAppBadge' in navigator) {
            await navigator.setAppBadge(randomNum);
            alert(`[Web] Badge: ${randomNum}`);
         }
       }
     } catch (e: any) {
       alert(`Lỗi: ${e.message}`);
     }
  };

  const handleRegisterCompany = (newUser: User) => {
    setCurrentUser(newUser);
    setActiveTab('dashboard');
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    updateAppBadge(0);
  };

  const handleAddUser = async (newUser: User) => {
    await apiAddUser(newUser);
  };

  const handleDeleteUser = async (userId: string) => {
    await apiDeleteUser(userId);
  };

  const handleChangeSelfPass = async () => {
    if(!currentUser || !newSelfPass) return;
    try {
      const updatedUser = { ...currentUser, password: newSelfPass };
      await apiUpdateUser(updatedUser);
      setCurrentUser(updatedUser);
      setNewSelfPass('');
      setShowChangePassModal(false);
      alert('Đổi mật khẩu thành công!');
    } catch (e) {
      alert('Có lỗi xảy ra, vui lòng thử lại.');
    }
  };
  
  const handleUpdateAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    
    try {
      const base64Img = await compressImageToBase64(file);
      const updatedUser = { ...currentUser, avatar: base64Img };
      
      // Update DB
      await apiUpdateUser(updatedUser);
      
      // Update State immediately
      setCurrentUser(updatedUser);
      
    } catch (error) {
      console.error("Avatar update failed:", error);
      alert("Lỗi cập nhật ảnh đại diện.");
    }
  };

  // --- Task Operations ---
  const createTask = async (taskData: any) => {
    if (!currentUser) return;
    const newTask: Task = {
      id: taskData.id || Math.random().toString(36).substr(2, 9),
      companyId: currentUser.companyId,
      ...taskData,
      status: TaskStatus.TODO,
      creatorId: currentUser.id,
      createdAt: new Date().toISOString()
    };
    await apiAddTask(newTask);
    setShowCreateModal(false);
  };

  const handleEditTask = (task: Task) => {
      setEditingTask(task);
  };

  const submitEditTask = async (updatedData: Task) => {
      await apiUpdateTask(updatedData);
      setEditingTask(null); 
  };

  const handleStatusClick = (task: Task) => {
    if (task.status === TaskStatus.TODO) {
      updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);
      if (statusFilter === TaskStatus.TODO) {
        setStatusFilter('ALL');
      }
    } else if (task.status === TaskStatus.IN_PROGRESS) {
      setCompletingTask(task);
      setCompletionFile(null);
      setShowCompleteModal(true);
    }
  };

  const confirmCompleteTask = async () => {
    if (!completingTask) return;
    setIsSubmittingComplete(true);
    
    let imageUrl = '';
    if (completionFile) {
       const url = await uploadTaskImage(completionFile, completingTask.id);
       if (url) imageUrl = url;
    }

    const updatedTask = {
      ...completingTask,
      status: TaskStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      completionImage: imageUrl || undefined
    };

    await apiUpdateTask(updatedTask);
    setIsSubmittingComplete(false);
    setShowCompleteModal(false);
    setCompletingTask(null);
  };

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedTask = {
      ...task,
      status: newStatus,
      completedAt: newStatus === TaskStatus.COMPLETED ? new Date().toISOString() : null
    };
    await apiUpdateTask(updatedTask);
  };

  const handleReassign = async (userId: string) => {
    if (!reassignTask) return;
    const updatedTask = { ...reassignTask, assigneeId: userId };
    await apiUpdateTask(updatedTask);
    setReassignTask(null);
  };

  // --- Filter Logic ---
  
  const myRelevantTasks = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.MANAGER) {
      return tasks;
    }
    return tasks.filter(t => t.assigneeId === currentUser.id);
  }, [tasks, currentUser]);

  const filteredTasks = useMemo(() => {
    let result = [...myRelevantTasks];
    
    result.sort((a, b) => {
       if (a.status === TaskStatus.COMPLETED && b.status !== TaskStatus.COMPLETED) return 1;
       if (a.status !== TaskStatus.COMPLETED && b.status === TaskStatus.COMPLETED) return -1;
       if (a.status === TaskStatus.IN_PROGRESS && b.status !== TaskStatus.IN_PROGRESS) return -1;
       if (a.status !== TaskStatus.IN_PROGRESS && b.status === TaskStatus.IN_PROGRESS) return 1;
       return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    if (statusFilter === 'OVERDUE') {
      result = result.filter(t => t.status !== TaskStatus.COMPLETED && isOverdue(t.dueDate));
    } else if (statusFilter !== 'ALL') {
      result = result.filter(t => t.status === statusFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.description.toLowerCase().includes(q)
      );
    }

    if (startDate || endDate) {
      result = result.filter(t => {
        const taskDate = new Date(t.dueDate).toISOString().split('T')[0];
        let inRange = true;
        if (startDate && taskDate < startDate) inRange = false;
        if (endDate && taskDate > endDate) inRange = false;
        return inRange;
      });
    }
    
    return result;
  }, [myRelevantTasks, statusFilter, searchQuery, startDate, endDate]);

  const stats = useMemo(() => {
    const defaultStats = { 
        pending: 0, 
        inProgress: 0, 
        overdueTotal: 0,
        dueSoonTotal: 0,
        urgentTotal: 0,
        overdueMonth: 0, 
        completedMonth: 0, 
        overdueRate: 0,
        totalCreatedMonth: 0 
    };

    if (!currentUser) return defaultStats;

    const sourceTasks = currentUser.role === UserRole.MANAGER ? tasks : myRelevantTasks;

    const pending = sourceTasks.filter(t => t.status === TaskStatus.TODO).length;
    const inProgress = sourceTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
    const overdueTotal = sourceTasks.filter(t => t.status !== TaskStatus.COMPLETED && isOverdue(t.dueDate)).length;
    const dueSoonTotal = sourceTasks.filter(t => t.status !== TaskStatus.COMPLETED && !isOverdue(t.dueDate) && isDueSoon(t.dueDate, 3)).length;
    const urgentTotal = overdueTotal + dueSoonTotal;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const tasksDueThisMonth = sourceTasks.filter(t => {
      const d = new Date(t.dueDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // Calculate total created/received in month
    const totalCreatedMonth = sourceTasks.filter(t => {
        const d = new Date(t.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const completedMonth = sourceTasks.filter(t => {
       if (t.status !== TaskStatus.COMPLETED) return false;
       const d = new Date(t.completedAt || t.dueDate); 
       return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const overdueMonth = tasksDueThisMonth.filter(t => 
        t.status !== TaskStatus.COMPLETED && isOverdue(t.dueDate)
    ).length;

    const totalProcessedThisMonth = completedMonth + overdueMonth + 
        tasksDueThisMonth.filter(t => t.status === TaskStatus.TODO || t.status === TaskStatus.IN_PROGRESS).length;
        
    const overdueRate = totalProcessedThisMonth > 0 ? Math.round((overdueMonth / totalProcessedThisMonth) * 100) : 0;

    return { 
        pending, 
        inProgress, 
        overdueTotal,
        dueSoonTotal,
        urgentTotal,
        overdueMonth,
        completedMonth, 
        overdueRate,
        totalCreatedMonth
    };
  }, [tasks, myRelevantTasks, currentUser]);

  const chartData = useMemo(() => {
     if (!currentUser) return [];
     const sourceTasks = currentUser.role === UserRole.MANAGER ? tasks : myRelevantTasks;
     const data = [];
     const now = new Date();
     
     // Last 12 months
     for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = d.getMonth();
        const year = d.getFullYear();
        
        const count = sourceTasks.filter(t => {
           if (t.status !== TaskStatus.COMPLETED || !t.completedAt) return false;
           const cDate = new Date(t.completedAt);
           return cDate.getMonth() === month && cDate.getFullYear() === year;
        }).length;
        
        data.push({ 
           label: `T${month + 1}`, 
           count,
           fullLabel: `Tháng ${month + 1}/${year}`
        });
     }
     return data;
  }, [tasks, myRelevantTasks, currentUser]);

  // Calculations for Trend Line in Chart
  const chartConfig = useMemo(() => {
      const maxVal = Math.max(...chartData.map(d => d.count), 5);
      
      // Generate SVG path for trend line
      // Coordinates normalized to 0-100% space
      const points = chartData.map((item, index) => {
          const x = ((index + 0.5) / chartData.length) * 100; // Center of the bar
          const y = 100 - (item.count / maxVal) * 100;
          return `${x},${y}`;
      });

      const polylinePoints = points.join(' ');
      
      return { maxVal, polylinePoints };
  }, [chartData]);


  const teamStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const stats = users.map(user => {
      const userTasks = tasks.filter(t => t.assigneeId === user.id);
      const todo = userTasks.filter(t => t.status === TaskStatus.TODO).length;
      const doing = userTasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length;
      const done = userTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      const overdue = userTasks.filter(t => t.status !== TaskStatus.COMPLETED && isOverdue(t.dueDate)).length;
      
      const completedThisMonth = userTasks.filter(t => {
         if (t.status !== TaskStatus.COMPLETED) return false;
         const d = new Date(t.completedAt || t.dueDate);
         return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      
      const doneMonthCount = completedThisMonth.length;
      const overdueDoneMonth = completedThisMonth.filter(t => {
         if(!t.completedAt) return false;
         return new Date(t.completedAt) > new Date(t.dueDate);
      }).length;
      
      const onTimeRate = doneMonthCount > 0 
         ? Math.round(((doneMonthCount - overdueDoneMonth) / doneMonthCount) * 100) 
         : 0;

      return { user, todo, doing, done, overdue, doneMonthCount, onTimeRate };
    });

    return stats.sort((a, b) => b.todo - a.todo);

  }, [users, tasks]);

  const selectedEmployeeTasks = useMemo(() => {
    if (!selectedEmployee) return [];
    const list = tasks.filter(t => t.assigneeId === selectedEmployee.id);
    list.sort((a, b) => {
        const isAComplete = a.status === TaskStatus.COMPLETED;
        const isBComplete = b.status === TaskStatus.COMPLETED;
        if (isAComplete !== isBComplete) return isAComplete ? 1 : -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    return list;
  }, [tasks, selectedEmployee]);

  const navigateToMonthStats = (status: TaskStatus | 'OVERDUE') => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const format = (d: Date) => d.toISOString().split('T')[0];
      
      setStartDate(format(firstDay));
      setEndDate(format(lastDay));
      setStatusFilter(status);
      setActiveTab('tasks');
  };

  const resetFilters = () => {
      setStartDate('');
      setEndDate('');
      setStatusFilter('ALL');
  };

  if (!isSystemReady) return <SetupScreen />;
  if (!currentUser) return <Auth onLogin={handleLogin} onRegisterCompany={handleRegisterCompany} />;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-indigo-50 via-slate-50 to-blue-50 font-sans">
      {/* HEADER */}
      <header className="bg-navy-800 px-6 py-4 shadow-md flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            {activeTab === 'dashboard' ? 'Tổng quan' : 
             activeTab === 'tasks' ? 'Danh sách việc' : 
             activeTab === 'team' ? 'Nhân sự' : 'Hồ sơ'}
          </h1>
          <div className="flex items-center gap-1 text-xs text-blue-200 mt-1">
            <IconBuilding className="w-3 h-3" />
            <span className="uppercase font-bold tracking-wider">{currentUser.companyName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className={`w-2.5 h-2.5 rounded-full border-2 border-navy-900 ${isLoadingData ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} title={isLoadingData ? 'Đang tải...' : 'Online'}></div>
           <img src={currentUser.avatar} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-navy-700 object-cover shadow-sm" />
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-4 pb-24 w-full max-w-7xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="text-sm text-gray-500 font-medium">
                Chào <span className="text-navy-800 font-bold text-base">{currentUser.name}</span>, chúc bạn một ngày làm việc hiệu quả!
            </div>

            {/* --- NEW INFOGRAPHIC LAYOUT (3D Style - Glassmorphism) --- */}
            <div className="relative max-w-lg mx-auto lg:mx-0">
               {/* Central Circle - Total Tasks Month */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-28 h-28 bg-white/80 backdrop-blur-xl rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center border-4 border-white/50">
                  <span className="text-3xl font-black text-navy-800">{stats.totalCreatedMonth}</span>
                  <span className="text-[10px] text-gray-500 font-bold uppercase text-center leading-tight mt-1">Việc mới<br/>tháng này</span>
                  <IconList className="w-4 h-4 text-gray-300 mt-1" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  {/* Item 1: Pending (Yellow) - Top Left */}
                  <div 
                    onClick={() => { setStartDate(''); setEndDate(''); setStatusFilter(TaskStatus.TODO); setActiveTab('tasks'); }}
                    className="h-36 bg-yellow-400/85 backdrop-blur-md rounded-tl-[3rem] rounded-tr-2xl rounded-bl-2xl rounded-br-[1rem] p-4 flex flex-col justify-between shadow-[0_8px_0_0_#b45309] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-yellow-600/50"
                  >
                     <div className="absolute top-0 right-0 p-8 bg-white/20 rounded-bl-full transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <div className="flex justify-between items-start text-white">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.pending}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconClock className="w-5 h-5" /></div>
                     </div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Chờ xử lý</span>
                  </div>

                  {/* Item 2: In Progress (Orange) - Top Right */}
                  <div 
                    onClick={() => { setStartDate(''); setEndDate(''); setStatusFilter(TaskStatus.IN_PROGRESS); setActiveTab('tasks'); }}
                    className="h-36 bg-orange-500/85 backdrop-blur-md rounded-tr-[3rem] rounded-tl-2xl rounded-br-2xl rounded-bl-[1rem] p-4 flex flex-col justify-between shadow-[0_8px_0_0_#c2410c] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-orange-700/50"
                  >
                     <div className="absolute top-0 left-0 p-8 bg-white/20 rounded-br-full transform -translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <div className="flex justify-between items-start text-white">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.inProgress}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconList className="w-5 h-5" /></div>
                     </div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Đang làm</span>
                  </div>

                  {/* Item 3: Completed (Cyan/Green) - Bottom Left */}
                  <div 
                    onClick={() => navigateToMonthStats(TaskStatus.COMPLETED)}
                    className="h-36 bg-cyan-500/85 backdrop-blur-md rounded-bl-[3rem] rounded-br-2xl rounded-tl-2xl rounded-tr-[1rem] p-4 flex flex-col justify-between shadow-[0_8px_0_0_#0e7490] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-cyan-700/50"
                  >
                     <div className="absolute bottom-0 right-0 p-8 bg-white/20 rounded-tl-full transform translate-x-4 translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Đã xong</span>
                     <div className="flex justify-between items-end text-white">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.completedMonth}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconCheck className="w-5 h-5" /></div>
                     </div>
                  </div>

                  {/* Item 4: Overdue (Pink/Red) - Bottom Right */}
                  <div 
                    onClick={() => navigateToMonthStats('OVERDUE')}
                    className="h-36 bg-rose-500/85 backdrop-blur-md rounded-br-[3rem] rounded-bl-2xl rounded-tr-2xl rounded-tl-[1rem] p-4 flex flex-col justify-between shadow-[0_8px_0_0_#be123c] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-rose-700/50"
                  >
                     <div className="absolute bottom-0 left-0 p-8 bg-white/20 rounded-tr-full transform -translate-x-4 translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Quá hạn</span>
                     <div className="flex justify-between items-end text-white">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.overdueMonth}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconAlert className="w-5 h-5" /></div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
                
                {/* --- MONTH SUMMARY (Light Theme, Red Embossed Text) --- */}
                <div className="lg:col-span-12">
                    <div className="bg-white/70 backdrop-blur-lg border border-white/50 p-8 rounded-3xl shadow-xl text-gray-800 relative overflow-hidden group text-center">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/50 opacity-50"></div>
                        <div className="relative z-10">
                            <h3 className="text-2xl font-black mb-6 uppercase tracking-widest text-red-600" style={{ textShadow: '1px 1px 0 #fff, 2px 2px 0 rgba(0,0,0,0.1), 3px 3px 0 rgba(0,0,0,0.05)' }}>
                               TỔNG KẾT THÁNG {new Date().getMonth() + 1}
                            </h3>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                                <div className="bg-slate-100 p-4 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="text-blue-600 text-xs font-bold uppercase mb-1">Tổng giao</div>
                                    <div className="text-2xl font-bold text-gray-800">{stats.completedMonth + stats.pending + stats.inProgress}</div>
                                </div>
                                <div className="bg-slate-100 p-4 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="text-green-600 text-xs font-bold uppercase mb-1">Hoàn thành</div>
                                    <div className="text-2xl font-bold text-green-600">{stats.completedMonth}</div>
                                </div>
                                <div className="bg-slate-100 p-4 rounded-2xl border border-gray-200 shadow-sm">
                                    <div className="text-red-500 text-xs font-bold uppercase mb-1">Tỷ lệ trễ</div>
                                    <div className="text-2xl font-bold text-red-500">{stats.overdueRate}%</div>
                                </div>
                                <div className="bg-slate-100 p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center">
                                    <div className="w-full bg-gray-300 h-3 rounded-full overflow-hidden shadow-inner border border-gray-200 relative">
                                        <div 
                                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-400 to-emerald-600 transition-all duration-1000 shadow-[0_0_10px_rgba(74,222,128,0.5)]" 
                                          style={{ width: `${(stats.completedMonth / (stats.completedMonth + stats.pending + stats.inProgress || 1)) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="ml-2 text-xs font-bold text-gray-700">{Math.round((stats.completedMonth / (stats.completedMonth + stats.pending + stats.inProgress || 1)) * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- ANNUAL CHART (3D Bars + Trend Line + Labels) --- */}
                <div className="lg:col-span-12">
                    <div className="bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-800 relative overflow-hidden">
                         {/* Header */}
                         <div className="flex items-center justify-between mb-8 relative z-10">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                               <div className="bg-brand-500 p-1.5 rounded-lg"><IconChart className="w-5 h-5 text-white" /></div>
                               HIỆU SUẤT NĂM
                            </h3>
                            <span className="text-[10px] text-gray-400 font-bold bg-gray-800 px-3 py-1 rounded-full border border-gray-700">TASK/MONTH</span>
                         </div>
                         
                         {/* Chart Container */}
                         <div className="relative h-64 w-full flex items-end gap-2 sm:gap-4 z-10 px-2 pt-6">
                            {/* Background Grid Lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                                <div className="w-full h-px bg-gray-500"></div>
                                <div className="w-full h-px bg-gray-500"></div>
                                <div className="w-full h-px bg-gray-500"></div>
                                <div className="w-full h-px bg-gray-500"></div>
                            </div>

                            {/* SVG Trend Line Overlay */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible" preserveAspectRatio="none">
                                <defs>
                                    <filter id="glow">
                                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                                        <feMerge>
                                            <feMergeNode in="coloredBlur"/>
                                            <feMergeNode in="SourceGraphic"/>
                                        </feMerge>
                                    </filter>
                                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#fbbf24" />
                                        <stop offset="100%" stopColor="#f59e0b" />
                                    </linearGradient>
                                </defs>
                                <polyline 
                                    points={chartConfig.polylinePoints} 
                                    fill="none" 
                                    stroke="url(#lineGradient)" 
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    filter="url(#glow)"
                                />
                                {/* Dots on the line */}
                                {chartData.map((item, index) => {
                                   const x = ((index + 0.5) / chartData.length) * 100;
                                   const y = 100 - (item.count / chartConfig.maxVal) * 100;
                                   return (
                                     <circle key={index} cx={`${x}%`} cy={`${y}%`} r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
                                   );
                                })}
                            </svg>

                            {/* 3D Bars */}
                            {chartData.map((item, index) => (
                               <div key={index} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                  
                                  {/* The Bar Container (Includes Label + Bar) */}
                                  <div className="w-full flex flex-col items-center justify-end" style={{ height: `${(item.count / chartConfig.maxVal) * 100}%`, minHeight: '20px' }}>
                                      
                                      {/* Small Number on Top */}
                                      <span className="mb-1 text-[10px] font-bold text-cyan-300 drop-shadow-sm">{item.count > 0 ? item.count : ''}</span>

                                      {/* The Bar */}
                                      <div 
                                        className="w-full max-w-[20px] sm:max-w-[40px] bg-gradient-to-b from-cyan-400 to-blue-600 rounded-t-md relative transition-all duration-500 group-hover:from-cyan-300 group-hover:to-blue-500 h-full"
                                        style={{ 
                                            minHeight: '4px',
                                            boxShadow: '0 4px 10px rgba(6,182,212,0.3)'
                                        }}
                                      >
                                          {/* Top "Cap" for 3D effect */}
                                          <div className="absolute top-0 left-0 w-full h-1 bg-white/50 rounded-t-md"></div>
                                      </div>
                                  </div>
                                  
                                  {/* Label */}
                                  <span className="text-[10px] sm:text-xs text-gray-400 mt-3 font-medium">{item.label}</span>
                               </div>
                            ))}
                         </div>
                    </div>
                </div>
            </div>
          </div>
        )}
