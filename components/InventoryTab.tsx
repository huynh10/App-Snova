import React, { useState, useEffect } from 'react';
import { User, InventoryItem, InventoryTransaction, Partner, Customer, InventoryCheck } from '../types';
import { 
  subscribeToInventoryItems, 
  subscribeToInventoryTransactions,
  subscribeToInventoryChecks,
  subscribeToPartners,
  subscribeToCustomers,
  apiAddInventoryItem,
  apiDeleteInventoryItem,
  apiAddInventoryTransaction,
  apiUpdateInventoryTransaction,
  apiDeleteInventoryTransaction,
  apiAddPartnerTransaction,
  apiAddCustomerTransaction,
  apiDeletePartnerTransaction,
  apiDeleteCustomerTransaction,
  apiAddInventoryCheck
} from '../services/storageService';
import { IconPlus, IconX, IconTrash, IconEdit, IconClock, IconHistory, IconClipboardCheck } from './Icons';

interface InventoryTabProps {
  currentUser: User;
}

function SearchableSelect({ options, value, onChange, placeholder }: { options: {id: string, name: string}[], value: string, onChange: (val: string) => void, placeholder: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = options.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus-within:border-blue-500 bg-white flex items-center cursor-text min-h-[46px]"
        onClick={() => setIsOpen(true)}
      >
        {isOpen ? (
          <input 
            autoFocus
            type="text" 
            className="w-full outline-none bg-transparent" 
            placeholder="Tìm kiếm..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
          />
        ) : (
          <div className="w-full truncate text-gray-900">
            {selectedOption ? selectedOption.name : <span className="text-gray-500">{placeholder}</span>}
          </div>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? filteredOptions.map(o => (
            <div 
              key={o.id} 
              className={`px-4 py-2 hover:bg-blue-50 cursor-pointer text-gray-700 ${value === o.id ? 'bg-blue-50 font-medium' : ''}`}
              onClick={() => {
                onChange(o.id);
                setSearchTerm('');
                setIsOpen(false);
              }}
            >
              {o.name}
            </div>
          )) : (
            <div className="px-4 py-2 text-gray-500 text-sm">Không tìm thấy kết quả</div>
          )}
        </div>
      )}
    </div>
  );
}

function CurrencyInput({ value, onChange, label, required = false, readOnly = false }: any) {
  const displayValue = value ? new Intl.NumberFormat('vi-VN').format(Number(value)) : '';
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const rawValue = e.target.value.replace(/\./g, '');
    if (rawValue === '') { onChange(''); return; }
    const num = parseInt(rawValue, 10);
    if (!isNaN(num)) onChange(num.toString());
  };
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input 
        type="text" 
        value={displayValue} 
        onChange={handleChange} 
        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 ${readOnly ? 'bg-gray-100' : ''}`} 
        required={required} 
        readOnly={readOnly}
      />
    </div>
  );
}

export default function InventoryTab({ currentUser }: InventoryTabProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checks, setChecks] = useState<InventoryCheck[]>([]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [showCheckHistoryModal, setShowCheckHistoryModal] = useState(false);
  const [selectedStockCardItem, setSelectedStockCardItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    const unsubItems = subscribeToInventoryItems(currentUser.companyId, setItems);
    const unsubTxs = subscribeToInventoryTransactions(currentUser.companyId, setTransactions);
    const unsubPartners = subscribeToPartners(currentUser.companyId, setPartners);
    const unsubCustomers = subscribeToCustomers(currentUser.companyId, setCustomers);
    const unsubChecks = subscribeToInventoryChecks(currentUser.companyId, setChecks);

    return () => {
      unsubItems();
      unsubTxs();
      unsubPartners();
      unsubCustomers();
      unsubChecks();
    };
  }, [currentUser.companyId]);

  const inventoryStock = items.map(item => {
    const itemTxs = transactions.filter(t => t.itemId === item.id);
    const imports = itemTxs.filter(t => t.type === 'IMPORT');
    const exports = itemTxs.filter(t => t.type === 'EXPORT');
    
    const totalImportQty = imports.reduce((sum, t) => sum + t.quantity, 0);
    const totalExportQty = exports.reduce((sum, t) => sum + t.quantity, 0);
    const stock = totalImportQty - totalExportQty;

    // Get latest import for price and supplier
    const latestImport = imports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const latestExport = exports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    const latestTx = [...imports, ...exports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const latestDate = latestTx ? latestTx.date : '';

    const unitPrice = latestImport ? latestImport.unitPrice : 0;
    const supplierId = latestImport ? latestImport.partnerId : undefined;
    const supplierName = partners.find(p => p.id === supplierId)?.name || '';
    const note = latestImport ? latestImport.note : '';

    return {
      ...item,
      stock,
      unitPrice,
      totalPrice: stock * unitPrice,
      supplierName,
      note,
      latestDate
    };
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const handleDeleteItem = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa mặt hàng này? Các giao dịch liên quan sẽ không bị xóa.')) {
      await apiDeleteInventoryItem(id);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Kho</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng hợp các mặt hàng trong kho</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setShowCheckHistoryModal(true)}
            className="flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-medium"
          >
            <IconHistory className="w-4 h-4" /> Lịch sử kiểm kho
          </button>
          <button 
            onClick={() => setShowCheckModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <IconClipboardCheck className="w-4 h-4" /> Kiểm Kho
          </button>
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            <IconHistory className="w-4 h-4" /> Lịch sử
          </button>
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <IconPlus className="w-4 h-4" /> Nhập Hàng
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
          >
            <IconPlus className="w-4 h-4" /> Xuất Hàng
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-4 py-3">STT</th>
                <th className="px-4 py-3">Ngày tháng</th>
                <th className="px-4 py-3">Tên mặt hàng</th>
                <th className="px-4 py-3 text-center">Đơn vị</th>
                <th className="px-4 py-3 text-right">Số lượng</th>
                <th className="px-4 py-3 text-right">Đơn giá</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
                <th className="px-4 py-3">Nhà cung cấp</th>
                <th className="px-4 py-3">Ghi chú</th>
                <th className="px-4 py-3 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventoryStock.map((item, index) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-600">{item.latestDate ? new Date(item.latestDate).toLocaleDateString('vi-VN') : '-'}</td>
                  <td className="px-4 py-3 font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => setSelectedStockCardItem(item)}>
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">{item.stock}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(item.totalPrice)}</td>
                  <td className="px-4 py-3 text-gray-600">{item.supplierName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.note}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {inventoryStock.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Chưa có mặt hàng nào trong kho
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <ImportModal 
          onClose={() => setShowImportModal(false)}
          currentUser={currentUser}
          items={items}
          partners={partners}
        />
      )}

      {showExportModal && (
        <ExportModal 
          onClose={() => setShowExportModal(false)}
          currentUser={currentUser}
          items={items}
          customers={customers}
          inventoryStock={inventoryStock}
        />
      )}

      {showHistoryModal && (
        <HistoryModal 
          onClose={() => setShowHistoryModal(false)}
          transactions={transactions}
          items={items}
          partners={partners}
          customers={customers}
        />
      )}

      {showCheckModal && (
        <InventoryCheckModal 
          onClose={() => setShowCheckModal(false)}
          currentUser={currentUser}
          inventoryStock={inventoryStock}
          transactions={transactions}
        />
      )}

      {showCheckHistoryModal && (
        <CheckHistoryModal 
          onClose={() => setShowCheckHistoryModal(false)}
          checks={checks}
        />
      )}

      {selectedStockCardItem && (
        <StockCardModal 
          onClose={() => setSelectedStockCardItem(null)}
          item={selectedStockCardItem}
          transactions={transactions.filter(t => t.itemId === selectedStockCardItem.id)}
          partners={partners}
          customers={customers}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

function StockCardModal({ onClose, item, transactions, partners, customers, currentUser }: any) {
  const [editingTx, setEditingTx] = useState<InventoryTransaction | null>(null);

  const sortedTxs = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleDeleteTx = async (tx: InventoryTransaction) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi này? Các công nợ liên quan cũng sẽ bị xóa.')) return;

    try {
      // 1. Delete linked transaction if exists
      if (tx.linkedTransactionId) {
        if (tx.type === 'IMPORT') {
          await apiDeletePartnerTransaction(tx.linkedTransactionId);
        } else {
          await apiDeletePartnerTransaction(tx.linkedTransactionId);
          // Also delete from customer transactions in case it's an old record
          await apiDeleteCustomerTransaction(tx.linkedTransactionId).catch(() => {});
        }
      }
      // 2. Delete inventory transaction
      await apiDeleteInventoryTransaction(tx.id);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Có lỗi xảy ra khi xóa bản ghi");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Thẻ Kho: {item.name}</h3>
            <p className="text-sm text-gray-500">Đơn vị: {item.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Ngày tháng</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                  <th className="px-4 py-3 text-right">Đơn giá</th>
                  <th className="px-4 py-3 text-right">Thành tiền</th>
                  <th className="px-4 py-3">Đối tác / Công trình</th>
                  <th className="px-4 py-3">Người thực hiện</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedTxs.map((tx) => {
                  const partner = partners.find((p: any) => p.id === tx.partnerId);
                  const customer = customers.find((c: any) => c.id === tx.customerId);
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600">{new Date(tx.date).toLocaleDateString('vi-VN')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${tx.type === 'IMPORT' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {tx.type === 'IMPORT' ? 'Nhập' : 'Xuất'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{tx.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(tx.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(tx.totalPrice)}</td>
                      <td className="px-4 py-3 text-gray-600">{partner?.name || customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{tx.executor || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{tx.note}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => setEditingTx(tx)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                            <IconEdit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteTx(tx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <IconTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedTxs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Chưa có giao dịch nào cho mặt hàng này
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingTx && (
        <EditTransactionModal 
          onClose={() => setEditingTx(null)}
          transaction={editingTx}
          currentUser={currentUser}
          itemName={item.name}
        />
      )}
    </div>
  );
}

function EditTransactionModal({ onClose, transaction, currentUser, itemName }: any) {
  const [date, setDate] = useState(transaction.date);
  const [quantity, setQuantity] = useState(transaction.quantity.toString());
  const [unitPrice, setUnitPrice] = useState(transaction.unitPrice.toString());
  const [note, setNote] = useState(transaction.note);
  const [executor, setExecutor] = useState(transaction.executor || currentUser.name);

  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // 1. Update linked transaction if exists
      if (transaction.linkedTransactionId) {
        if (transaction.type === 'IMPORT') {
          // Note: This is a simplified update. In a real app, you might want a specific apiUpdatePartnerTransaction
          // but for now we'll assume we can use apiAddPartnerTransaction with the same ID to overwrite (setDoc)
          await apiAddPartnerTransaction({
            id: transaction.linkedTransactionId,
            companyId: currentUser.companyId,
            partnerId: transaction.partnerId,
            productId: 'INVENTORY_IMPORT',
            date,
            quantity: Number(quantity),
            purchaseAmount: totalPrice,
            paidAmount: 0,
            content: `Nhập kho: ${itemName} (Sửa đổi)`,
            executor: executor,
            note,
            createdAt: transaction.createdAt, // Keep original
            createdBy: transaction.createdBy
          });
        } else {
          await apiAddPartnerTransaction({
            id: transaction.linkedTransactionId,
            companyId: currentUser.companyId,
            partnerId: '',
            productId: 'INVENTORY_EXPORT',
            customerId: transaction.customerId,
            date,
            quantity: Number(quantity),
            purchaseAmount: totalPrice,
            paidAmount: 0,
            content: `Xuất kho: ${itemName} (Sửa đổi)`,
            executor: executor,
            note,
            createdAt: transaction.createdAt,
            createdBy: transaction.createdBy
          });
          // Also delete from customer transactions in case it's an old record
          await apiDeleteCustomerTransaction(transaction.linkedTransactionId).catch(() => {});
        }
      }

      // 2. Update inventory transaction
      await apiUpdateInventoryTransaction({
        ...transaction,
        date,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        totalPrice,
        note,
        executor: executor
      });

      onClose();
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert("Có lỗi xảy ra khi cập nhật bản ghi");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-900 text-lg">Sửa Giao Dịch</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tháng</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng</label>
                <input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
              </div>
              <CurrencyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} required={true} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng tiền</label>
              <div className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-gray-100 text-gray-900 font-bold">
                {new Intl.NumberFormat('vi-VN').format(totalPrice)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Người thực hiện</label>
              <input type="text" value={executor} onChange={e => setExecutor(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500"></textarea>
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors mt-2">
              Lưu Thay Đổi
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, currentUser, items, partners }: any) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [note, setNote] = useState('');

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemUnit.trim()) return;
    const item: InventoryItem = {
      id: Date.now().toString(),
      companyId: currentUser.companyId,
      name: newItemName.trim(),
      unit: newItemUnit.trim(),
      createdAt: new Date().toISOString()
    };
    await apiAddInventoryItem(item);
    setItemId(item.id);
    setShowAddItem(false);
    setNewItemName('');
    setNewItemUnit('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || !partnerId) {
      alert("Vui lòng chọn hàng hóa và đối tác");
      return;
    }
    
    const selectedItem = items.find((i: any) => i.id === itemId);
    if (!selectedItem) return;

    const partnerTxId = Date.now().toString();
    const inventoryTxId = (Date.now() + 1).toString();

    // 1. Create PartnerTransaction to increase debt
    await apiAddPartnerTransaction({
      id: partnerTxId,
      companyId: currentUser.companyId,
      partnerId,
      productId: 'INVENTORY_IMPORT', // Special ID for inventory
      date,
      quantity: Number(quantity),
      purchaseAmount: totalPrice,
      paidAmount: 0,
      content: `Nhập kho: ${selectedItem.name}`,
      executor: currentUser.name,
      note,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id
    });

    // 2. Create InventoryTransaction
    await apiAddInventoryTransaction({
      id: inventoryTxId,
      companyId: currentUser.companyId,
      type: 'IMPORT',
      date,
      itemId,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      totalPrice,
      partnerId,
      note,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      linkedTransactionId: partnerTxId
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="font-bold text-lg text-gray-900">Nhập Hàng</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <form id="import-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tháng</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên hàng hóa</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect 
                    options={items}
                    value={itemId}
                    onChange={setItemId}
                    placeholder="-- Chọn hàng hóa --"
                  />
                </div>
                <button type="button" onClick={() => setShowAddItem(!showAddItem)} className="px-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 hover:bg-blue-100"><IconPlus className="w-5 h-5" /></button>
              </div>
              {showAddItem && (
                <div className="mt-2 flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <input type="text" placeholder="Tên hàng hóa mới..." value={newItemName} onChange={e => setNewItemName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <input type="text" placeholder="Đơn vị (VD: Cái, Kg, Lít...)" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  <button type="button" onClick={handleAddItem} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Lưu hàng hóa</button>
                </div>
              )}
            </div>

            {itemId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
                <input type="text" value={items.find((i: any) => i.id === itemId)?.unit || ''} readOnly className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-gray-100 outline-none text-gray-600" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng</label>
                <input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
              </div>
              <CurrencyInput label="Giá tiền (1 đơn vị)" value={unitPrice} onChange={setUnitPrice} required={true} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng tiền</label>
              <div className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-gray-100 text-gray-900 font-bold">
                {new Intl.NumberFormat('vi-VN').format(totalPrice)}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Đối tác</label>
              <SearchableSelect 
                options={partners}
                value={partnerId}
                onChange={setPartnerId}
                placeholder="-- Chọn đối tác --"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500"></textarea>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-gray-100 shrink-0 bg-white">
          <button type="submit" form="import-form" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors">
            Lưu Nhập Hàng
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ onClose, currentUser, items, customers, inventoryStock }: any) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');
  const [executor, setExecutor] = useState(currentUser.name);

  const selectedStockItem = inventoryStock.find((i: any) => i.id === itemId);
  const maxQuantity = selectedStockItem ? selectedStockItem.stock : 0;

  useEffect(() => {
    if (selectedStockItem && !unitPrice) {
      setUnitPrice(selectedStockItem.unitPrice.toString());
    }
  }, [itemId, selectedStockItem]);

  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || !customerId) {
      alert("Vui lòng chọn hàng hóa và công trình");
      return;
    }

    const exportQty = Number(quantity);
    if (exportQty > maxQuantity) {
      alert(`Số lượng xuất (${exportQty}) không được lớn hơn số lượng tồn kho (${maxQuantity})`);
      return;
    }
    
    const selectedItem = items.find((i: any) => i.id === itemId);
    if (!selectedItem) return;

    const customerTxId = Date.now().toString();
    const inventoryTxId = (Date.now() + 1).toString();

    // 1. Create PartnerTransaction to increase project expense
    await apiAddPartnerTransaction({
      id: customerTxId,
      companyId: currentUser.companyId,
      partnerId: '',
      productId: 'INVENTORY_EXPORT',
      customerId,
      date,
      quantity: exportQty,
      purchaseAmount: totalPrice,
      paidAmount: 0,
      content: `Xuất kho: ${selectedItem.name}`,
      executor: executor,
      note,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id
    });

    // 2. Create InventoryTransaction
    await apiAddInventoryTransaction({
      id: inventoryTxId,
      companyId: currentUser.companyId,
      type: 'EXPORT',
      date,
      itemId,
      quantity: exportQty,
      unitPrice: Number(unitPrice),
      totalPrice,
      customerId,
      note,
      executor: executor,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      linkedTransactionId: customerTxId
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="font-bold text-lg text-gray-900">Xuất Hàng</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <form id="export-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tháng</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên hàng hóa</label>
              <SearchableSelect 
                options={items}
                value={itemId}
                onChange={setItemId}
                placeholder="-- Chọn hàng hóa --"
              />
            </div>

            {itemId && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
                  <input type="text" value={items.find((i: any) => i.id === itemId)?.unit || ''} readOnly className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-gray-100 outline-none text-gray-600" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tồn kho</label>
                  <input type="text" value={maxQuantity} readOnly className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-blue-50 text-blue-700 font-bold outline-none" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng xuất</label>
                <input 
                  type="number" 
                  min="0" 
                  max={maxQuantity}
                  step="0.01" 
                  value={quantity} 
                  onChange={e => setQuantity(e.target.value)} 
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" 
                  required 
                />
              </div>
              <CurrencyInput label="Giá tiền (1 đơn vị)" value={unitPrice} onChange={setUnitPrice} required={true} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng tiền</label>
              <div className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-gray-100 text-gray-900 font-bold">
                {new Intl.NumberFormat('vi-VN').format(totalPrice)}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Công Trình</label>
              <SearchableSelect 
                options={customers}
                value={customerId}
                onChange={setCustomerId}
                placeholder="-- Chọn công trình --"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Người thực hiện</label>
              <input type="text" value={executor} onChange={e => setExecutor(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500"></textarea>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-gray-100 shrink-0 bg-white">
          <button type="submit" form="export-form" className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 transition-colors">
            Lưu Xuất Hàng
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ onClose, transactions, items, partners, customers }: any) {
  const fortyFiveDaysAgo = new Date();
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

  const recentTxs = transactions
    .filter((tx: any) => new Date(tx.date) >= fortyFiveDaysAgo)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Lịch sử xuất nhập hàng (45 ngày gần nhất)</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Ngày tháng</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Tên mặt hàng</th>
                  <th className="px-4 py-3 text-right">Số lượng</th>
                  <th className="px-4 py-3 text-right">Đơn giá</th>
                  <th className="px-4 py-3 text-right">Thành tiền</th>
                  <th className="px-4 py-3">Đối tác / Công trình</th>
                  <th className="px-4 py-3">Người thực hiện</th>
                  <th className="px-4 py-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentTxs.map((tx: any) => {
                  const item = items.find((i: any) => i.id === tx.itemId);
                  const partner = partners.find((p: any) => p.id === tx.partnerId);
                  const customer = customers.find((c: any) => c.id === tx.customerId);
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600">{new Date(tx.date).toLocaleDateString('vi-VN')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${tx.type === 'IMPORT' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {tx.type === 'IMPORT' ? 'Nhập' : 'Xuất'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item?.name || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{tx.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(tx.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(tx.totalPrice)}</td>
                      <td className="px-4 py-3 text-gray-600">{partner?.name || customer?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{tx.executor || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{tx.note}</td>
                    </tr>
                  );
                })}
                {recentTxs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      Chưa có giao dịch nào trong 45 ngày qua
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryCheckModal({ onClose, currentUser, inventoryStock, transactions }: any) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [executor, setExecutor] = useState(currentUser.name);
  const [note, setNote] = useState('');
  const [actualStocks, setActualStocks] = useState<Record<string, string>>(
    inventoryStock.reduce((acc: any, item: any) => ({ ...acc, [item.id]: item.stock.toString() }), {})
  );

  const handleStockChange = (itemId: string, value: string) => {
    setActualStocks(prev => ({ ...prev, [itemId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa toàn bộ lịch sử xuất nhập kho hiện tại và thiết lập lại số lượng tồn kho theo số lượng thực tế bạn vừa nhập. Bạn có chắc chắn muốn tiếp tục?')) {
      return;
    }

    try {
      // 1. Save Inventory Check record
      const checkId = Date.now().toString();
      await apiAddInventoryCheck({
        id: checkId,
        companyId: currentUser.companyId,
        date,
        executor,
        note,
        createdAt: new Date().toISOString()
      });

      // 2. Delete all existing inventory transactions
      // We do this sequentially to avoid overwhelming the database if there are many
      for (const tx of transactions) {
        await apiDeleteInventoryTransaction(tx.id);
      }

      // 3. Create new baseline transactions for each item with actual stock > 0
      let txTime = Date.now();
      for (const item of inventoryStock) {
        const actualQty = Number(actualStocks[item.id]) || 0;
        if (actualQty > 0) {
          txTime++;
          await apiAddInventoryTransaction({
            id: txTime.toString(),
            companyId: currentUser.companyId,
            type: 'IMPORT',
            date,
            itemId: item.id,
            quantity: actualQty,
            unitPrice: item.unitPrice, // Keep the latest unit price
            totalPrice: actualQty * item.unitPrice,
            note: `Kiểm kho ngày ${new Date(date).toLocaleDateString('vi-VN')}`,
            executor,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.id
          });
        }
      }

      alert('Kiểm kho thành công! Số liệu đã được cập nhật.');
      onClose();
    } catch (error) {
      console.error("Error during inventory check:", error);
      alert("Có lỗi xảy ra khi kiểm kho.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-indigo-900">Kiểm Kho</h3>
            <p className="text-sm text-indigo-700">Cập nhật số lượng thực tế và làm mới dữ liệu kho</p>
          </div>
          <button onClick={onClose} className="text-indigo-400 hover:text-indigo-600 p-2 hover:bg-indigo-100 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <form id="check-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kiểm kho</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Người thực hiện</label>
                <input type="text" value={executor} onChange={e => setExecutor(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500" placeholder="Lý do kiểm kho..." />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">STT</th>
                    <th className="px-4 py-3">Tên mặt hàng</th>
                    <th className="px-4 py-3 text-center">Đơn vị</th>
                    <th className="px-4 py-3 text-right">Tồn kho hiện tại (Hệ thống)</th>
                    <th className="px-4 py-3 text-right w-48">Tồn kho thực tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inventoryStock.map((item: any, index: number) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{item.unit}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-600">{item.stock}</td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={actualStocks[item.id] || ''} 
                          onChange={e => handleStockChange(item.id, e.target.value)} 
                          className="w-full border border-indigo-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 text-right font-bold text-indigo-700" 
                          required 
                        />
                      </td>
                    </tr>
                  ))}
                  {inventoryStock.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        Chưa có mặt hàng nào trong kho
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm flex gap-3">
              <IconClipboardCheck className="w-5 h-5 shrink-0 text-amber-600" />
              <p>
                <strong>Lưu ý quan trọng:</strong> Khi bấm "Xác nhận Kiểm Kho", toàn bộ lịch sử xuất nhập hàng trước đây sẽ bị xóa để làm mới dữ liệu. Số lượng tồn kho của các mặt hàng sẽ được đặt lại bằng với <strong>Tồn kho thực tế</strong> mà bạn vừa nhập.
              </p>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-gray-100 shrink-0 bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-medium text-gray-700 hover:bg-gray-200 transition-colors">
            Hủy
          </button>
          <button type="submit" form="check-form" className="px-6 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm">
            Xác nhận Kiểm Kho
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckHistoryModal({ onClose, checks }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <div>
            <h3 className="font-bold text-lg text-gray-900">Lịch sử kiểm kho</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-all">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Ngày kiểm</th>
                  <th className="px-4 py-3">Người thực hiện</th>
                  <th className="px-4 py-3">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {checks.map((check: any) => (
                  <tr key={check.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{new Date(check.date).toLocaleDateString('vi-VN')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{check.executor}</td>
                    <td className="px-4 py-3 text-gray-500">{check.note}</td>
                  </tr>
                ))}
                {checks.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                      Chưa có lịch sử kiểm kho
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
