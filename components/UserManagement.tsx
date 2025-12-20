
import React, { useState, useRef } from 'react';
import { User, UserRole } from '../types';
import { IconPlus, IconTrash, IconUser, IconLock, IconAlert, IconKey, IconUpload, IconDownload } from './Icons';
import { apiUpdateUser } from '../services/storageService';

interface UserManagementProps {
  currentUser: User;
  companyUsers: User[];
  onAddUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, companyUsers, onAddUser, onDeleteUser }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.EMPLOYEE);
  
  // State quản lý xóa/reset pass
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToResetPass, setUserToResetPass] = useState<User | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newUsername || !newPassword) return;

    if (companyUsers.some(u => u.username === newUsername)) {
      alert('Tên đăng nhập đã tồn tại trong công ty!');
      return;
    }

    setIsProcessing(true);

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      username: newUsername,
      password: newPassword,
      companyName: currentUser.companyName,
      companyId: currentUser.companyId,
      role: newRole,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=random`,
      email: `${newUsername}@biz.com`
    };

    onAddUser(newUser);
    
    // Reset form
    setNewName('');
    setNewUsername('');
    setNewPassword('');
    setNewRole(UserRole.EMPLOYEE);
    setShowAddForm(false);
    setIsProcessing(false);
  };

  const downloadTemplate = () => {
    const headers = "Ho_Ten,Ten_Dang_Nhap,Mat_Khau,Chuc_Vu(MANAGER/EMPLOYEE)";
    const example = "Nguyen Van A,nhanvien1,123456,EMPLOYEE\nTran Van B,quanly1,123456,MANAGER";
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + example;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "mau_nhap_nhan_vien.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        let successCount = 0;
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Basic CSV parsing (assuming no commas in fields)
            const parts = line.split(',');
            if (parts.length >= 3) {
                const name = parts[0].trim();
                const username = parts[1].trim();
                const password = parts[2].trim();
                const roleStr = parts[3]?.trim().toUpperCase();
                
                if (!name || !username || !password) continue;

                if (companyUsers.some(u => u.username === username)) continue;

                // Lưu ý: CSV template cũ dùng MANAGER/EMPLOYEE, trong logic mới MANAGER là Quản lý
                let role = UserRole.EMPLOYEE;
                if (roleStr === 'MANAGER' || roleStr === 'QUANLY') role = UserRole.MANAGER;
                
                const newUser: User = {
                    id: Math.random().toString(36).substr(2, 9) + i,
                    name: name,
                    username: username,
                    password: password,
                    companyName: currentUser.companyName,
                    companyId: currentUser.companyId,
                    role: role,
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
                    email: `${username}@biz.com`
                };
                
                onAddUser(newUser);
                successCount++;
            }
        }
        alert(`Đã nhập thành công ${successCount} nhân viên.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    }
  };

  const handleResetPassClick = (user: User) => {
      setUserToResetPass(user);
      setResetPassValue('');
  };

  const confirmResetPass = async () => {
      if(userToResetPass && resetPassValue) {
          const updatedUser = { ...userToResetPass, password: resetPassValue };
          await apiUpdateUser(updatedUser);
          setUserToResetPass(null);
          setResetPassValue('');
          alert("Đã đổi mật khẩu thành công!");
      }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h3 className="font-bold text-gray-800">Danh sách nhân sự</h3>
        <div className="flex gap-2 w-full sm:w-auto">
             <button 
                type="button"
                onClick={downloadTemplate}
                className="text-gray-600 text-xs font-bold flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                title="Tải file mẫu Excel/CSV"
            >
                <IconDownload className="w-4 h-4" /> Mẫu
            </button>
            <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-green-600 text-xs font-bold flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100"
            >
                <IconUpload className="w-4 h-4" /> Nhập Excel/CSV
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".csv,.txt" 
                className="hidden" 
            />
            <button 
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-brand-600 text-xs font-bold flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-lg hover:bg-brand-100"
            >
                <IconPlus className="w-4 h-4" /> Thêm mới
            </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 space-y-3 animate-fade-in relative">
          <h4 className="font-bold text-sm text-gray-700 mb-2">Tạo tài khoản mới</h4>
          
          <input
            type="text"
            placeholder="Họ tên nhân viên"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-2 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
            required
            disabled={isProcessing}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <IconUser className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tên đăng nhập"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full p-2 pl-8 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                required
                disabled={isProcessing}
              />
            </div>
            <div className="relative">
              <IconLock className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text" 
                placeholder="Mật khẩu"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-2 pl-8 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                required
                disabled={isProcessing}
              />
            </div>
          </div>
          
          <div>
             <label className="text-xs text-gray-500 font-bold mb-1 block">Chức vụ</label>
             <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer flex-1 justify-center hover:bg-gray-50">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newRole === UserRole.EMPLOYEE} 
                    onChange={() => setNewRole(UserRole.EMPLOYEE)}
                    disabled={isProcessing}
                  />
                  <span>Nhân viên</span>
                </label>
                <label className="flex items-center gap-2 text-sm bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer flex-1 justify-center text-purple-700 font-medium hover:bg-purple-50">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newRole === UserRole.MANAGER} 
                    onChange={() => setNewRole(UserRole.MANAGER)}
                    disabled={isProcessing}
                  />
                  <span>Quản lý</span>
                </label>
             </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="text-gray-500 text-sm px-3 py-1 hover:text-gray-700" disabled={isProcessing}>Hủy</button>
            <button type="submit" disabled={isProcessing} className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-lg font-bold hover:bg-brand-700 disabled:opacity-50">
                {isProcessing ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {companyUsers.filter(u => u.id !== currentUser.id).map(user => (
          <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden flex-1">
              <img src={user.avatar} className="w-10 h-10 rounded-full bg-gray-200 object-cover flex-shrink-0 border border-gray-200" alt="" />
              <div className="min-w-0 pr-2">
                <div className="font-bold text-gray-800 text-sm flex items-center gap-2 truncate">
                   {user.name}
                   {user.role === UserRole.DIRECTOR && (
                     <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 flex-shrink-0">GĐ</span>
                   )}
                   {user.role === UserRole.MANAGER && (
                     <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 flex-shrink-0">QL</span>
                   )}
                </div>
                <div className="text-xs text-gray-500 truncate">@{user.username}</div>
              </div>
            </div>
            
            <div className="flex gap-2">
                <button 
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    handleResetPassClick(user);
                }}
                className="w-10 h-10 flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-brand-50 hover:text-brand-600 rounded-full shadow-sm cursor-pointer transition-colors"
                title="Đổi mật khẩu"
                >
                    <IconKey className="w-4 h-4" />
                </button>

                <button 
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    handleDeleteClick(user);
                }}
                className="w-10 h-10 flex items-center justify-center bg-white border border-red-100 text-red-500 hover:bg-red-50 rounded-full shadow-sm cursor-pointer transition-colors"
                title="Xóa nhân viên"
                >
                <IconTrash className="w-4 h-4" />
                </button>
            </div>
          </div>
        ))}
        {companyUsers.length <= 1 && (
          <p className="text-center text-gray-400 text-sm py-4">Chưa có nhân viên nào.</p>
        )}
      </div>

      {/* Modal Xóa User */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <IconAlert className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Xác nhận xóa?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Bạn có chắc chắn muốn xóa nhân viên <span className="font-bold text-gray-800">{userToDelete.name}</span> không? 
                <br/>Hành động này không thể hoàn tác.
              </p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setUserToDelete(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                >
                  Xóa ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Đổi Mật Khẩu */}
      {userToResetPass && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up">
             <h3 className="text-lg font-bold text-gray-800 mb-4">Đổi mật khẩu cho {userToResetPass.name}</h3>
             <input 
                type="text"
                value={resetPassValue}
                onChange={(e) => setResetPassValue(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                className="w-full p-3 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-brand-500 outline-none"
             />
             <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setUserToResetPass(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={confirmResetPass}
                  disabled={!resetPassValue}
                  className="flex-1 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 shadow-lg transition-colors disabled:opacity-50"
                >
                  Lưu
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
