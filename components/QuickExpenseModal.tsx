import React, { useState, useEffect } from 'react';
import { User, Customer, Partner, Product, FinanceCategory, PartnerTransaction } from '../types';
import { 
  subscribeToCustomers, 
  subscribeToPartners,
  subscribeToProducts,
  subscribeToFinanceCategories,
  apiAddPartnerTransaction
} from '../services/storageService';
import { IconX, IconDollarSign } from './Icons';

function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder 
}: { 
  options: { id: string, name: string }[], 
  value: string, 
  onChange: (val: string) => void, 
  placeholder: string 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedOption = options.find(o => o.id === value);
  const displayValue = isOpen ? search : (selectedOption ? selectedOption.name : '');

  const filteredOptions = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-500 bg-white text-sm pr-8"
        placeholder={placeholder}
      />
      {value && !isOpen && (
        <button 
          type="button" 
          onClick={() => onChange('')} 
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
        >
          <IconX className="w-3 h-3" />
        </button>
      )}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          <div 
            className="p-3 text-sm hover:bg-gray-100 cursor-pointer text-gray-500 italic border-b border-gray-100"
            onMouseDown={(e) => { e.preventDefault();
 onChange(''); setIsOpen(false); }}
            onTouchStart={(e) => { e.preventDefault();
 onChange(''); setIsOpen(false); }}
          >
            -- Bỏ chọn --
          </div>
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">Không tìm thấy</div>
          ) : (
            filteredOptions.map(o => (
              <div 
                key={o.id} 
                className="p-3 text-sm hover:bg-gray-100 cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis"
                onMouseDown={(e) => { e.preventDefault();
 onChange(o.id); setIsOpen(false); }}
                onTouchStart={(e) => { e.preventDefault();
 onChange(o.id); setIsOpen(false); }}
              >
                {o.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function QuickExpenseModal({ currentUser, onClose }: { currentUser: User, onClose: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [content, setContent] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const unsubCustomers = subscribeToCustomers(currentUser.companyId, setCustomers);
    const unsubPartners = subscribeToPartners(currentUser.companyId, setPartners);
    const unsubProducts = subscribeToProducts(currentUser.companyId, setProducts);
    const unsubCategories = subscribeToFinanceCategories(currentUser.companyId, setFinanceCategories);

    return () => {
      unsubCustomers();
      unsubPartners();
      unsubProducts();
      unsubCategories();
    };
  }, [currentUser.companyId]);

  const chiCategories = financeCategories.filter(c => c.type === 'CHI');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!productId) {
      setErrorMsg("Vui lòng chọn hạng mục chi");
      return;
    }

    const isProductCategory = products.some(p => p.id === productId);
    const isFinanceCategory = chiCategories.some(c => c.id === productId);

    if (isProductCategory) {
      if (!customerId || !partnerId) {
        setErrorMsg("Vui lòng chọn Công trình và Nhà cung cấp cho danh mục hàng hóa.");
        return;
      }
    } else if (isFinanceCategory) {
      if (customerId && partnerId) {
        setErrorMsg("Chỉ chọn MỘT TRONG HAI (Công trình hoặc Đối tác), hoặc để trống.");
        return;
      }
    }

    setIsSubmitting(true);

    let finalPurchaseAmount = 0;
    let finalPaidAmount = 0;

    if (isProductCategory) {
      finalPurchaseAmount = Number(amount.replace(/\./g, '')) || 0;
      finalPaidAmount = finalPurchaseAmount; // Assume paid directly for quick expense
    } else if (isFinanceCategory) {
      if (partnerId) {
        finalPaidAmount = Number(amount.replace(/\./g, '')) || 0;
        finalPurchaseAmount = 0;
      } else {
        finalPurchaseAmount = Number(amount.replace(/\./g, '')) || 0;
        finalPaidAmount = 0;
      }
    }

    const tx: PartnerTransaction = {
      id: Date.now().toString(),
      companyId: currentUser.companyId,
      partnerId,
      productId,
      customerId,
      content,
      executor: currentUser.name,
      date,
      quantity: 1,
      purchaseAmount: finalPurchaseAmount,
      paidAmount: finalPaidAmount,
      note: '',
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id
    };

    try {
      await apiAddPartnerTransaction(tx);
      setIsSubmitting(false);
      onClose();
    } catch (error: any) {
      console.error(error);
      setErrorMsg("Lỗi khi lưu: " + error.message);
      setIsSubmitting(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    const num = parseInt(rawValue, 10);
    if (!isNaN(num)) {
      setAmount(num.toString());
    } else {
      setAmount('');
    }
  };

  const displayAmount = amount ? new Intl.NumberFormat('vi-VN').format(Number(amount)) : '';

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <IconDollarSign className="w-5 h-5 text-orange-500" />
            Chi Nhanh
          </h3>
          <button onClick={onClose} className="p-2 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto pb-safe flex-1">
          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ) <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={displayAmount} 
              onChange={handleAmountChange} 
              className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 text-xl font-bold text-gray-900 placeholder-gray-300"
              placeholder="0"
              required 
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hạng mục chi <span className="text-red-500">*</span></label>
            <select value={productId} onChange={e => setProductId(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-500 bg-white" required>
              <option value="">-- Chọn hạng mục --</option>
              {chiCategories.length > 0 && <optgroup label="Hạng mục độc lập (Tài chính)">
                {chiCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>}
              {products.length > 0 && <optgroup label="Danh mục hàng hóa (Đối tác)">
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dành cho (Không bắt buộc)</label>
            <div className="grid grid-cols-2 gap-3 relative">
              <SearchableSelect 
                options={customers} 
                value={customerId} 
                onChange={setCustomerId} 
                placeholder="-- Công trình --"
              />
              <SearchableSelect 
                options={partners} 
                value={partnerId} 
                onChange={setPartnerId} 
                placeholder="-- Đối tác --"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Diễn giải</label>
            <textarea 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-500 resize-none h-20"
              placeholder="Nhập nội dung chi tiết..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày chi</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:border-blue-500" required />
          </div>
          
          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isSubmitting || !amount || !productId}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white font-bold py-3.5 px-4 rounded-xl transition-colors shadow-lg shadow-orange-200"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Chi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
