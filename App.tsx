
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
    <div className="flex flex-col h-full bg-[#F0F4F8] font-sans relative">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-slate-100 pointer-events-none"></div>
      
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
      <main className="flex-1 overflow-y-auto hide-scrollbar p-4 pb-24 w-full max-w-7xl mx-auto relative z-0">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">

            {/* --- DEADLINE WARNING MODULE (Dark Theme / Reference Style) --- */}
            <div className="relative max-w-2xl mx-auto">
               <div className="bg-navy-900 rounded-[2rem] p-1 shadow-2xl relative overflow-hidden group">
                   {/* Animated Gradient Border Effect */}
                   <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 opacity-80 blur-md group-hover:opacity-100 transition-opacity"></div>
                   
                   {/* Inner Dark Card */}
                   <div className="relative bg-gray-900 rounded-[1.8rem] p-6 flex flex-row items-center justify-between overflow-hidden">
                       
                       {/* Background Decorations */}
                       <div className="absolute -left-10 -top-10 w-40 h-40 bg-red-600/10 rounded-full blur-3xl"></div>
                       <div className="absolute right-0 bottom-0 w-32 h-32 bg-orange-600/10 rounded-full blur-3xl"></div>

                       {/* Left Content */}
                       <div className="z-10 flex flex-col justify-center flex-1 pr-4">
                           <div className="flex items-center gap-2 mb-1">
                               <IconAlert className="w-4 h-4 text-orange-500" />
                               <h3 className="text-gray-400 font-bold text-xs uppercase tracking-[0.2em]">Cảnh báo hạn chót</h3>
                           </div>
                           <div className="text-white text-base leading-snug">
                              Bạn có <span className="text-red-500 font-bold">{stats.overdueTotal}</span> việc trễ và <br/>
                              <span className="text-orange-400 font-bold">{stats.dueSoonTotal}</span> việc gấp cần xử lý.
                           </div>
                       </div>

                       {/* Right Divider & Big Number */}
                       <div className="z-10 flex items-center gap-6 border-l border-gray-700 pl-6">
                           <div className="flex flex-col items-center">
                                {/* The Big Red Number */}
                                <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-700 leading-none" style={{ filter: 'drop-shadow(0 0 15px rgba(220, 38, 38, 0.4))' }}>
                                   {stats.urgentTotal < 10 ? `0${stats.urgentTotal}` : stats.urgentTotal}
                                </div>
                                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-2">Tổng báo động</div>
                           </div>
                       </div>
                   </div>
               </div>
            </div>

            <div className="text-sm text-gray-500 font-medium text-center lg:text-left max-w-2xl mx-auto">
                Chào <span className="text-navy-800 font-bold text-base">{currentUser.name}</span>, chúc bạn một ngày làm việc hiệu quả!
            </div>

            {/* --- NEW INFOGRAPHIC LAYOUT (3D Style - Glassmorphism) --- */}
            <div className="relative max-w-2xl mx-auto">
               {/* Central Circle - Total Tasks Month */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-32 h-32 bg-gradient-to-tr from-emerald-600 to-green-400 rounded-full shadow-[0_0_20px_rgba(52,211,153,0.6)] flex flex-col items-center justify-center border-4 border-white/30 backdrop-blur-sm">
                  <span className="text-3xl font-black text-white">{stats.totalCreatedMonth}</span>
                  <span className="text-[10px] text-white/90 font-bold uppercase text-center leading-tight mt-1">Việc mới<br/>tháng này</span>
                  <IconList className="w-4 h-4 text-white/70 mt-1" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  {/* Item 1: Pending (Yellow) - Top Left */}
                  <div 
                    onClick={() => { setStartDate(''); setEndDate(''); setStatusFilter(TaskStatus.TODO); setActiveTab('tasks'); }}
                    className="h-40 bg-yellow-400/85 backdrop-blur-md rounded-tl-[3rem] rounded-tr-2xl rounded-bl-2xl rounded-br-[1rem] p-5 flex flex-col justify-between shadow-[0_8px_0_0_#b45309] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-yellow-600/50 items-start"
                  >
                     <div className="absolute top-0 right-0 p-8 bg-white/20 rounded-bl-full transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <div className="flex justify-between items-start text-white w-full">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.pending}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconClock className="w-5 h-5" /></div>
                     </div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Chờ xử lý</span>
                  </div>

                  {/* Item 2: In Progress (Orange) - Top Right */}
                  <div 
                    onClick={() => { setStartDate(''); setEndDate(''); setStatusFilter(TaskStatus.IN_PROGRESS); setActiveTab('tasks'); }}
                    className="h-40 bg-orange-500/85 backdrop-blur-md rounded-tr-[3rem] rounded-tl-2xl rounded-br-2xl rounded-bl-[1rem] p-5 flex flex-col justify-between shadow-[0_8px_0_0_#c2410c] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-orange-700/50 items-end"
                  >
                     <div className="absolute top-0 left-0 p-8 bg-white/20 rounded-br-full transform -translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <div className="flex justify-between items-start text-white w-full">
                        <div className="bg-white/20 p-2 rounded-lg"><IconList className="w-5 h-5" /></div>
                        <span className="font-bold text-4xl drop-shadow-md">{stats.inProgress}</span>
                     </div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider text-right">Đang làm</span>
                  </div>

                  {/* Item 3: Completed (Cyan/Green) - Bottom Left */}
                  <div 
                    onClick={() => navigateToMonthStats(TaskStatus.COMPLETED)}
                    className="h-40 bg-cyan-500/85 backdrop-blur-md rounded-bl-[3rem] rounded-br-2xl rounded-tl-2xl rounded-tr-[1rem] p-5 flex flex-col justify-between shadow-[0_8px_0_0_#0e7490] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-cyan-700/50 items-start"
                  >
                     <div className="absolute bottom-0 right-0 p-8 bg-white/20 rounded-tl-full transform translate-x-4 translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider">Đã xong</span>
                     <div className="flex justify-between items-end text-white w-full">
                        <span className="font-bold text-4xl drop-shadow-md">{stats.completedMonth}</span>
                        <div className="bg-white/20 p-2 rounded-lg"><IconCheck className="w-5 h-5" /></div>
                     </div>
                  </div>

                  {/* Item 4: Overdue (Pink/Red) - Bottom Right */}
                  <div 
                    onClick={() => navigateToMonthStats('OVERDUE')}
                    className="h-40 bg-rose-500/85 backdrop-blur-md rounded-br-[3rem] rounded-bl-2xl rounded-tr-2xl rounded-tl-[1rem] p-5 flex flex-col justify-between shadow-[0_8px_0_0_#be123c] active:shadow-none active:translate-y-[8px] transition-all cursor-pointer relative overflow-hidden group border-b-2 border-rose-700/50 items-end"
                  >
                     <div className="absolute bottom-0 left-0 p-8 bg-white/20 rounded-tr-full transform -translate-x-4 translate-y-4 group-hover:scale-110 transition-transform"></div>
                     <span className="text-white font-bold uppercase text-xs tracking-wider text-right">Quá hạn</span>
                     <div className="flex justify-between items-end text-white w-full">
                        <div className="bg-white/20 p-2 rounded-lg"><IconAlert className="w-5 h-5" /></div>
                        <span className="font-bold text-4xl drop-shadow-md">{stats.overdueMonth}</span>
                     </div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
                
                {/* --- MONTH SUMMARY (Solid Background) --- */}
                <div className="lg:col-span-12">
                    <div className="bg-gradient-to-br from-white to-blue-50 border border-blue-100 p-8 rounded-3xl shadow-xl text-gray-800 relative overflow-hidden group text-center">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <div className="relative z-10">
                            <h3 className="text-2xl font-black mb-6 uppercase tracking-widest text-red-600" style={{ textShadow: '1px 1px 0 #fff, 2px 2px 0 rgba(0,0,0,0.1), 3px 3px 0 rgba(0,0,0,0.05)' }}>
                               TỔNG KẾT THÁNG {new Date().getMonth() + 1}
                            </h3>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="text-blue-600 text-xs font-bold uppercase mb-1">Tổng giao</div>
                                    <div className="text-2xl font-bold text-gray-800">{stats.completedMonth + stats.pending + stats.inProgress}</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="text-green-600 text-xs font-bold uppercase mb-1">Hoàn thành</div>
                                    <div className="text-2xl font-bold text-green-600">{stats.completedMonth}</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="text-red-500 text-xs font-bold uppercase mb-1">Tỷ lệ trễ</div>
                                    <div className="text-2xl font-bold text-red-500">{stats.overdueRate}%</div>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center">
                                    <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden shadow-inner border border-gray-100 relative">
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

        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="relative">
              <input type="text" placeholder={currentUser.role === UserRole.MANAGER ? "Tìm công việc toàn công ty..." : "Tìm trong việc của tôi..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-navy-800 outline-none text-sm bg-white" />
              <IconSearch className="absolute left-4 top-4 w-4 h-4 text-gray-400" />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
               <div className="flex-1">
                 <label className="text-[10px] text-gray-500 font-bold px-1 uppercase block mb-1">Từ ngày</label>
                 <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-xs text-gray-700 font-medium outline-none p-1 bg-gray-50 rounded" />
               </div>
               <div className="hidden sm:block w-px h-10 bg-gray-200 self-center"></div>
               <div className="flex-1">
                 <label className="text-[10px] text-gray-500 font-bold px-1 uppercase block mb-1">Đến ngày</label>
                 <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full text-xs text-gray-700 font-medium outline-none p-1 bg-gray-50 rounded" />
               </div>
               {(startDate || endDate) && <button onClick={resetFilters} className="p-2 text-gray-400 hover:text-red-500 self-center" title="Xóa lọc">&times;</button>}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
              {(['ALL', TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, 'OVERDUE'] as const).map((status) => (
                <button key={status} onClick={() => setStatusFilter(status)} className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${statusFilter === status ? 'bg-navy-800 text-white shadow-md transform scale-105' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                  {status === 'ALL' ? 'Tất cả' : status === 'OVERDUE' ? 'Quá hạn' : status === TaskStatus.TODO ? 'Chờ xử lý' : status === TaskStatus.IN_PROGRESS ? 'Đang làm' : 'Đã xong'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  currentUser={currentUser}
                  allUsers={users}
                  onStatusAction={handleStatusClick}
                  onReassign={setReassignTask}
                  onEdit={handleEditTask}
                  onViewImage={setLightboxImage}
                  onViewDetail={() => setViewingTask(task)}
                />
              ))}
            </div>
            {filteredTasks.length === 0 && <div className="text-center py-12 text-gray-500 flex flex-col items-center"><IconBriefcase className="w-12 h-12 text-gray-300 mb-2"/><p>{isLoadingData ? 'Đang tải dữ liệu...' : 'Không tìm thấy công việc phù hợp.'}</p></div>}
          </div>
        )}

        {activeTab === 'team' && (
          <div className="space-y-8">
             {/* LIST CARD - SORTED BY PENDING */}
             {!selectedEmployee ? (
                <>
                    <h2 className="font-bold text-gray-800 text-lg">Tiến độ nhân sự (Ưu tiên tồn đọng)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamStats.map(({ user, todo, doing, done, overdue }) => (
                        <div key={user.id} onClick={() => setSelectedEmployee(user)} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group">
                            {/* Sort Indicator for top pending */}
                            {todo > 0 && (
                                <div className="absolute top-2 right-2 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 animate-pulse">
                                    Cần xử lý: {todo}
                                </div>
                            )}
                            <div className="flex items-center gap-4 mb-5">
                            <img src={user.avatar} className="w-14 h-14 rounded-full border-2 border-white shadow-sm" />
                            <div>
                                <div className="font-bold text-gray-800 text-lg group-hover:text-brand-600 transition-colors">{user.name}</div>
                                <div className="text-xs text-gray-500 font-medium">@{user.username}</div>
                            </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div className="bg-gray-50 py-2.5 rounded-lg border border-gray-100"><div className="font-bold text-base text-gray-800">{todo}</div><div className="text-gray-500 text-[10px] uppercase">Chờ</div></div>
                            <div className="bg-blue-50 py-2.5 rounded-lg border border-blue-100"><div className="font-bold text-base text-blue-700">{doing}</div><div className="text-blue-600 text-[10px] uppercase">Làm</div></div>
                            <div className="bg-green-50 py-2.5 rounded-lg border border-green-100"><div className="font-bold text-base text-green-700">{done}</div><div className="text-green-600 text-[10px] uppercase">Xong</div></div>
                            <div className="bg-red-50 py-2.5 rounded-lg border border-red-100"><div className="font-bold text-base text-red-700">{overdue}</div><div className="text-red-600 text-[10px] uppercase">Trễ</div></div>
                            </div>
                        </div>
                    ))}
                    </div>

                    {/* PRODUCTIVITY STATS (Responsive: Card on Mobile, Table on Desktop) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                             <h3 className="font-bold text-gray-800">Thống kê năng suất tháng {new Date().getMonth() + 1}</h3>
                        </div>
                        
                        {/* Desktop View (Table) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3">Nhân viên</th>
                                        <th className="px-6 py-3">Username</th>
                                        <th className="px-6 py-3 text-center">Hoàn thành (Tháng)</th>
                                        <th className="px-6 py-3 text-center">Tỷ lệ đúng hạn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamStats.map(({ user, doneMonthCount, onTimeRate }) => (
                                        <tr key={user.id} className="bg-white border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-gray-900">{user.name}</td>
                                            <td className="px-6 py-4 text-gray-500">@{user.username}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full font-bold">{doneMonthCount}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-16 bg-gray-200 rounded-full h-2.5">
                                                        <div className={`h-2.5 rounded-full ${onTimeRate >= 80 ? 'bg-green-500' : onTimeRate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${onTimeRate}%` }}></div>
                                                    </div>
                                                    <span className="font-bold">{onTimeRate}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View (Cards) */}
                        <div className="md:hidden p-4 space-y-4">
                            {teamStats.map(({ user, doneMonthCount, onTimeRate }) => (
                                <div key={user.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-4">
                                    <img src={user.avatar} className="w-12 h-12 rounded-full border border-gray-200 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-900 truncate">{user.name}</div>
                                        <div className="text-xs text-gray-500 truncate">@{user.username}</div>
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="text-gray-600">Xong tháng này: <b className="text-green-600">{doneMonthCount}</b></span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${onTimeRate >= 80 ? 'bg-green-500' : onTimeRate >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${onTimeRate}%` }}></div>
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-500 w-8 text-right">{onTimeRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
             ) : (
                <div>
                   <button onClick={() => setSelectedEmployee(null)} className="mb-4 text-sm font-bold text-gray-500 hover:text-navy-800 flex items-center gap-1">&larr; Quay lại danh sách</button>
                   <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-4">
                      <img src={selectedEmployee.avatar} className="w-16 h-16 rounded-full" />
                      <div><h2 className="text-xl font-bold text-navy-800">{selectedEmployee.name}</h2><p className="text-sm text-gray-500">Danh sách công việc cá nhân</p></div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedEmployeeTasks.map(task => (
                        <TaskCard 
                          key={task.id} 
                          task={task} 
                          currentUser={currentUser}
                          allUsers={users}
                          onStatusAction={handleStatusClick}
                          onReassign={setReassignTask}
                          onEdit={handleEditTask}
                          onViewImage={setLightboxImage}
                          onViewDetail={() => setViewingTask(task)}
                        />
                      ))}
                   </div>
                </div>
             )}
          </div>
        )}

        {activeTab === 'profile' && (
           <div className="p-2 space-y-6 max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 flex flex-col items-center relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-24 bg-navy-800"></div>
                 <div className="relative z-10 flex flex-col items-center w-full">
                   <div className="relative">
                      <img src={currentUser.avatar} className="w-28 h-28 rounded-full mb-4 object-cover border-4 border-white shadow-md bg-white" />
                      <button 
                        onClick={() => profileInputRef.current?.click()} 
                        className="absolute bottom-4 right-0 bg-white p-2 rounded-full shadow-md border border-gray-200 text-gray-600 hover:text-navy-800 transition-colors"
                        title="Đổi ảnh đại diện"
                      >
                         <IconCamera className="w-5 h-5" />
                      </button>
                      <input 
                         type="file" 
                         ref={profileInputRef} 
                         onChange={handleUpdateAvatar} 
                         className="hidden" 
                         accept="image/*" 
                      />
                   </div>
                   
                   <h2 className="text-2xl font-bold text-gray-800">{currentUser.name}</h2>
                   <p className="text-sm font-medium text-gray-500 mb-6">{currentUser.companyName} • {currentUser.role === UserRole.MANAGER ? 'Quản lý' : 'Nhân viên'}</p>
                   
                   <div className="flex gap-4 w-full max-w-md">
                      {currentUser.role === UserRole.MANAGER && (
                        <button onClick={() => setShowChangePassModal(true)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors flex items-center justify-center gap-2 shadow-sm"><IconKey className="w-4 h-4" /> Đổi mật khẩu</button>
                      )}
                      <button onClick={handleLogout} className="flex-1 py-3 bg-red-50 text-red-600 border border-red-100 font-bold rounded-xl text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2 shadow-sm"><IconLogOut className="w-4 h-4" /> Đăng xuất</button>
                   </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                   <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><IconAlert className="w-5 h-5 text-orange-500"/> Cài đặt Thông báo</h3>
                   <div className="space-y-3">
                     <button onClick={requestNotificationAccess} className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all">
                       <div className="flex items-center gap-3"><div className={`p-2 rounded-full ${notificationPermission === 'granted' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{notificationPermission === 'granted' ? <IconCheck className="w-5 h-5" /> : <IconAlert className="w-5 h-5" />}</div><div className="text-left"><div className="font-bold text-sm text-gray-800">Quyền Thông báo & Badge</div><div className="text-xs text-gray-500">{notificationPermission === 'granted' ? 'Đã kích hoạt' : 'Chưa kích hoạt'}</div></div></div>
                     </button>
                     <button onClick={testBadge} className="w-full flex justify-between items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all">
                       <div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-full text-blue-600"><IconCheck className="w-5 h-5" /></div><div className="text-left"><div className="font-bold text-sm text-gray-800">Kiểm tra Badge Icon</div><div className="text-xs text-gray-500">Test hiển thị số đỏ trên icon</div></div></div>
                     </button>
                   </div>
                </div>
                
                {currentUser.role === UserRole.MANAGER && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                     <UserManagement currentUser={currentUser} companyUsers={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} />
                  </div>
                )}
              </div>
           </div>
        )}
      </main>

      {currentUser.role === UserRole.MANAGER && (
        <button onClick={() => setShowCreateModal(true)} className="fixed bottom-24 right-6 bg-navy-800 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 hover:bg-navy-900 transition-all z-20 border-4 border-white">
          <IconPlus className="w-7 h-7" />
        </button>
      )}

      {/* FOOTER NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center z-20 pb-safe shadow-[0_-5px_10px_rgba(0,0,0,0.02)]">
        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<IconHome />} label="Tổng quan" />
        <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<IconList />} label="Công việc" badge={myPendingTaskCount > 0 ? myPendingTaskCount : undefined} />
        <NavButton active={activeTab === 'team'} onClick={() => setActiveTab('team')} icon={<IconBriefcase />} label="Nhân sự" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<IconUser />} label="Cá nhân" />
      </nav>

      {/* MODALS */}
      {showCreateModal && <CreateTaskModal currentUser={currentUser} assignableUsers={users} onClose={() => setShowCreateModal(false)} onCreate={createTask} />}
      {editingTask && <CreateTaskModal currentUser={currentUser} assignableUsers={users} onClose={() => setEditingTask(null)} onCreate={async () => {}} onEdit={submitEditTask} initialData={editingTask} />}
      
      {/* Detail Modal */}
      {viewingTask && <TaskDetailModal task={viewingTask} users={users} onClose={() => setViewingTask(null)} onEdit={currentUser.role === UserRole.MANAGER ? (t) => { setViewingTask(null); handleEditTask(t); } : undefined} />}

      {showCompleteModal && completingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl transform transition-all scale-100">
              <h3 className="text-lg font-bold text-navy-800 mb-2">Xác nhận hoàn thành</h3>
              <p className="text-sm text-gray-500 mb-6">Bạn có muốn tải ảnh minh chứng (kết quả công việc) lên không?</p>
              <div className="mb-6">
                 <label className="block w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-navy-500 hover:bg-gray-50 transition-colors group">
                    {completionFile ? (
                       <div className="relative">
                          <img src={URL.createObjectURL(completionFile)} className="h-32 mx-auto object-contain rounded shadow-sm" />
                          <button onClick={(e) => { e.preventDefault(); setCompletionFile(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"><IconX className="w-3 h-3" /></button>
                       </div>
                    ) : (
                       <div className="flex flex-col items-center text-gray-400 group-hover:text-navy-600">
                          <IconImage className="w-10 h-10 mb-2" /><span className="text-sm font-bold">Chọn ảnh (Tùy chọn)</span>
                       </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && setCompletionFile(e.target.files[0])} />
                 </label>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompleteModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Hủy</button>
                <button onClick={confirmCompleteTask} disabled={isSubmittingComplete} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl flex justify-center items-center hover:bg-green-700 shadow-lg shadow-green-200">
                  {isSubmittingComplete ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Hoàn thành'}
                </button>
              </div>
           </div>
        </div>
      )}

      {showChangePassModal && (
         <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
               <h3 className="text-lg font-bold text-navy-800 mb-4">Đổi mật khẩu đăng nhập</h3>
               <p className="text-sm text-gray-500 mb-6">Nhập mật khẩu mới cho tài khoản của bạn.</p>
               <input type="text" value={newSelfPass} onChange={(e) => setNewSelfPass(e.target.value)} placeholder="Mật khẩu mới" className="w-full p-3.5 border border-gray-300 rounded-xl mb-6 focus:ring-2 focus:ring-navy-800 outline-none" />
               <div className="flex gap-3">
                  <button onClick={() => setShowChangePassModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Hủy</button>
                  <button onClick={handleChangeSelfPass} disabled={!newSelfPass} className="flex-1 py-3 bg-navy-800 text-white font-bold rounded-xl hover:bg-navy-900 shadow-lg disabled:opacity-50">Lưu</button>
               </div>
            </div>
         </div>
      )}

      {lightboxImage && (
         <div className="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
            <img src={lightboxImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            <button className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/40 p-2 rounded-full backdrop-blur-sm transition-colors"><IconX className="w-6 h-6" /></button>
         </div>
      )}

      {reassignTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-navy-800 mb-4">Giao lại việc cho</h3>
              <div className="space-y-2 mb-6 max-h-[50vh] overflow-y-auto">
                 {users.map(user => (
                   <button key={user.id} onClick={() => handleReassign(user.id)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors">
                     <img src={user.avatar} className="w-10 h-10 rounded-full border border-gray-200" />
                     <div className="text-left"><div className="font-bold text-gray-800">{user.name}</div><div className="text-xs text-gray-500">@{user.username}</div></div>
                   </button>
                 ))}
              </div>
              <button onClick={() => setReassignTask(null)} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Hủy bỏ</button>
           </div>
        </div>
      )}
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label, badge }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-navy-800 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'}`}>
    <div className="relative">
       {React.cloneElement(icon, { className: 'w-6 h-6', strokeWidth: active ? 2.5 : 2 })}
       {badge && <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full animate-pulse border-2 border-white shadow-sm">{badge > 9 ? '9+' : badge}</span>}
    </div>
    <span className="text-[10px] tracking-wide">{label}</span>
  </button>
);

interface TaskCardProps {
  task: Task;
  currentUser: User;
  allUsers: User[];
  onStatusAction: (task: Task) => void;
  onReassign: (task: Task) => void;
  onEdit: (task: Task) => void;
  onViewImage: (url: string) => void;
  onViewDetail: () => void; 
  isDashboard?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, currentUser, allUsers, onStatusAction, onReassign, onEdit, onViewImage, onViewDetail, isDashboard }) => {
  const overdue = task.status !== TaskStatus.COMPLETED && isOverdue(task.dueDate);
  const dueSoon = task.status !== TaskStatus.COMPLETED && !overdue && isDueSoon(task.dueDate, 3);
  
  const isManager = currentUser.role === UserRole.MANAGER;
  const isAssignee = currentUser.id === task.assigneeId;
  const canEditStatus = isManager || isAssignee;
  const canEditContent = isManager; // Only managers can edit
  const showAction = isDashboard ? isAssignee : canEditStatus;
  
  const priorityColors = {
    [TaskPriority.LOW]: 'bg-gray-100 text-gray-600',
    [TaskPriority.MEDIUM]: 'bg-blue-50 text-blue-600',
    [TaskPriority.HIGH]: 'bg-orange-50 text-orange-600',
    [TaskPriority.URGENT]: 'bg-red-50 text-red-600',
  };

  const assignee = allUsers.find(u => u.id === task.assigneeId);
  const creator = allUsers.find(u => u.id === task.creatorId);
  const deadlineInfo = getDeadlineInfo(task.dueDate, task.status);

  // Card Background Color Logic
  let cardBgClass = 'bg-white border-gray-100';
  if (task.status === TaskStatus.COMPLETED) {
      cardBgClass = 'bg-green-50/50 border-green-100';
  } else if (overdue) {
      cardBgClass = 'bg-red-50 border-red-200';
  } else if (dueSoon) {
      cardBgClass = 'bg-orange-50 border-orange-200';
  }

  return (
    <div 
      className={`p-5 rounded-2xl border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group h-full flex flex-col cursor-pointer ${cardBgClass}`}
      onClick={onViewDetail} 
    >
      {overdue && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] px-3 py-1 rounded-bl-xl font-bold z-10 shadow-sm">Quá hạn</div>}
      
      <div className="flex justify-between items-start mb-3">
        <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${priorityColors[task.priority]}`}>{task.priority}</span>
        <div className="flex flex-col items-end gap-1">
          {deadlineInfo && <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 ${deadlineInfo.className}`}>{deadlineInfo.icon && <IconAlert className="w-3 h-3" />}{deadlineInfo.text}</span>}
        </div>
      </div>

      <div className="flex justify-between items-start mb-2">
         <h3 className="font-bold text-gray-900 text-base leading-tight flex-1 group-hover:text-navy-800 transition-colors">{task.title}</h3>
         {canEditContent && (
             <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-gray-400 hover:text-navy-600 p-1 transition-colors"><IconEdit className="w-4 h-4" /></button>
         )}
      </div>
      
      <p className="text-sm text-gray-600 line-clamp-3 mb-4 whitespace-pre-line flex-1">{task.description}</p>
      
      {/* Attachments Preview (Max 3) */}
      {task.attachments && task.attachments.length > 0 && (
         <div className="flex gap-2 overflow-x-auto pb-2 mb-3 hide-scrollbar" onClick={(e) => e.stopPropagation()}>
            {task.attachments.slice(0, 4).map((url, i) => (
               <img key={i} src={url} onClick={() => onViewImage(url)} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 cursor-pointer border border-gray-200 hover:opacity-80 transition-opacity" />
            ))}
            {task.attachments.length > 4 && <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-500 font-bold border border-gray-200">+{task.attachments.length - 4}</div>}
         </div>
      )}

      {/* Completion Proof */}
      {task.status === TaskStatus.COMPLETED && task.completionImage && (
         <div className="mb-4 bg-white/60 p-2.5 rounded-xl border border-green-200 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
             <img src={task.completionImage} onClick={() => onViewImage(task.completionImage!)} className="w-10 h-10 rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform" />
             <span className="text-xs text-green-700 font-bold">Minh chứng hoàn thành</span>
         </div>
      )}

      <div className="mb-4 text-xs bg-white/50 p-3 rounded-xl text-gray-600 border border-gray-100/50">
         <div className="flex justify-between mb-1.5"><span>Ngày giao:</span><span className="font-bold text-gray-800">{formatDateTime(task.createdAt)}</span></div>
         <div className="flex justify-between"><span>Hạn chót:</span><span className={`font-bold ${overdue ? 'text-red-600' : 'text-gray-800'}`}>{formatDateTime(task.dueDate)}</span></div>
      </div>
      
      <div className="flex items-start justify-between mb-4 border-b border-gray-100 pb-3">
         {creator && (
            <div className="flex flex-col gap-0.5" title="Người giao việc">
                <span className="text-[10px] text-gray-400 uppercase font-bold">Người giao</span>
                <span className="text-xs text-gray-700 font-medium break-words max-w-[100px]">{creator.name}</span>
            </div>
         )}
         <div className="text-gray-300 text-xs self-center">→</div>
         {assignee && (
            <div className="flex flex-col gap-0.5 text-right items-end" title="Người thực hiện">
                <span className="text-[10px] text-gray-400 uppercase font-bold">Người nhận</span>
                <span className="text-xs text-blue-700 font-bold break-words max-w-[100px]">{assignee.name}</span>
            </div>
         )}
      </div>

      <div className="flex items-center justify-between mt-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
           <span className={`w-2.5 h-2.5 rounded-full ${task.status === TaskStatus.COMPLETED ? 'bg-green-500' : task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
           <span className={`text-xs font-bold ${task.status === TaskStatus.COMPLETED ? 'text-green-600' : task.status === TaskStatus.IN_PROGRESS ? 'text-blue-600' : 'text-gray-500'}`}>
              {task.status === TaskStatus.COMPLETED ? 'Đã xong' : task.status === TaskStatus.IN_PROGRESS ? 'Đang làm' : 'Chờ xử lý'}
           </span>
        </div>

        <div className="flex gap-2">
          {isManager && task.status !== TaskStatus.COMPLETED && (
             <button onClick={() => onReassign(task)} className="text-xs font-bold text-gray-500 hover:text-navy-600 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 shadow-sm transition-all" title="Giao lại"><IconShare className="w-3.5 h-3.5" /></button>
          )}
          {showAction && task.status !== TaskStatus.COMPLETED && (
            <button
              onClick={() => onStatusAction(task)}
              className="text-xs font-bold bg-navy-50 hover:bg-navy-100 text-navy-800 px-4 py-2 rounded-lg border border-navy-100 transition-colors shadow-sm"
            >
              {task.status === TaskStatus.TODO ? 'Bắt đầu' : 'Hoàn thành'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
