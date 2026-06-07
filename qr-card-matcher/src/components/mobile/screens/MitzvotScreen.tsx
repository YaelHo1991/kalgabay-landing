/**
 * MitzvotScreen - Mitzvot list with search, filters, and CRUD operations
 * Features: View details, add, edit, delete, import/export, print mitzvot
 */

import { useState, useEffect, useRef } from 'react';
import {
  Mitzva,
  getAllMitzvot,
  createMitzva,
  updateMitzva,
  deleteMitzva,
  getNextAvailableMitzvaCode,
  getSetting,
  setSetting,
} from '../../../database';
import { generateQRDataUrl } from '../../QRGenerator';
import { generatePDF } from '../../../utils/pdfGenerator';
import { exportMitzvotToExcel, importMitzvotFromExcel } from '../../../services/excelService';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

type FilterType = 'all' | 'regular' | 'holiday';
type ModalType = 'view' | 'add' | 'edit' | 'delete' | 'print' | 'import' | 'printer' | null;

export default function MitzvotScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [mitzvot, setMitzvot] = useState<Mitzva[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedMitzva, setSelectedMitzva] = useState<Mitzva | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    notes: '',
    availableOnHolidays: true,
    holidaysOnly: false,
  });

  // Print state - same logic as PrintLabelsScreen
  const [usedCellsSet, setUsedCellsSet] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null);
  const [isAndroidPlatform, setIsAndroidPlatform] = useState(false);
  const cellsPerPage = 32;

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{name: string; notes?: string; availableOnHolidays: boolean; holidaysOnly: boolean}>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load mitzvot
  const loadMitzvot = async () => {
    setLoading(true);
    try {
      const allMitzvot = await getAllMitzvot();
      setMitzvot(allMitzvot);
    } catch (error) {
      console.error('Error loading mitzvot:', error);
    }
    setLoading(false);
  };

  // Load used cells from settings
  const loadUsedCells = async () => {
    try {
      const usedCellsStr = await getSetting('print_used_cells');
      if (usedCellsStr) {
        const cellNumbers = usedCellsStr.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        setUsedCellsSet(new Set(cellNumbers));
      }
    } catch (error) {
      console.error('Error loading used cells:', error);
    }
  };

  // Load connected printer from settings
  const loadConnectedPrinter = async () => {
    try {
      const savedPrinter = await getSetting('connected_printer');
      if (savedPrinter) {
        setConnectedPrinter(savedPrinter);
      }
    } catch (error) {
      console.error('Error loading connected printer:', error);
    }
  };

  // Check if running on Android
  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const os = await platform();
        setIsAndroidPlatform(os === 'android');
      } catch {
        setIsAndroidPlatform(false);
      }
    };
    checkPlatform();
  }, []);

  useEffect(() => {
    loadMitzvot();
    loadUsedCells();
    loadConnectedPrinter();
  }, []);

  const filters = [
    { id: 'all' as FilterType, label: 'הכל' },
    { id: 'regular' as FilterType, label: 'רגילות' },
    { id: 'holiday' as FilterType, label: 'חגים' },
  ];

  const filteredMitzvot = mitzvot.filter(mitzva => {
    if (searchQuery && !mitzva.name.includes(searchQuery)) {
      return false;
    }
    if (activeFilter === 'regular' && mitzva.holidays_only === 1) {
      return false;
    }
    if (activeFilter === 'holiday' && mitzva.holidays_only !== 1) {
      return false;
    }
    return true;
  });

  // Open view modal
  const handleViewMitzva = (mitzva: Mitzva) => {
    setSelectedMitzva(mitzva);
    setActiveModal('view');
  };

  // Open add modal
  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      notes: '',
      availableOnHolidays: true,
      holidaysOnly: false,
    });
    setActiveModal('add');
  };

  // Open edit modal
  const handleOpenEditModal = (mitzva: Mitzva, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMitzva(mitzva);
    setFormData({
      name: mitzva.name,
      notes: mitzva.notes || '',
      availableOnHolidays: mitzva.available_on_holidays === 1,
      holidaysOnly: mitzva.holidays_only === 1,
    });
    setActiveModal('edit');
  };

  // Open delete confirmation
  const handleOpenDeleteModal = (mitzva: Mitzva, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMitzva(mitzva);
    setActiveModal('delete');
  };

  // Open print modal
  const handleOpenPrintModal = async (mitzva: Mitzva, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMitzva(mitzva);
    await loadUsedCells(); // Refresh used cells
    setActiveModal('print');
  };

  // Handle add mitzva
  const handleAddMitzva = async () => {
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      const code = await getNextAvailableMitzvaCode();
      await createMitzva(
        formData.name.trim(),
        0,
        formData.notes.trim() || undefined,
        formData.availableOnHolidays,
        formData.holidaysOnly
      );
      await loadMitzvot();
      setActiveModal(null);
    } catch (error) {
      console.error('Error adding mitzva:', error);
    }
    setSaving(false);
  };

  // Handle edit mitzva
  const handleEditMitzva = async () => {
    if (!selectedMitzva || !formData.name.trim()) return;

    setSaving(true);
    try {
      await updateMitzva(
        selectedMitzva.id,
        formData.name.trim(),
        0,
        formData.notes.trim() || undefined,
        formData.availableOnHolidays,
        formData.holidaysOnly
      );
      await loadMitzvot();
      setActiveModal(null);
      setSelectedMitzva(null);
    } catch (error) {
      console.error('Error updating mitzva:', error);
    }
    setSaving(false);
  };

  // Handle delete mitzva
  const handleDeleteMitzva = async () => {
    if (!selectedMitzva) return;

    setSaving(true);
    try {
      await deleteMitzva(selectedMitzva.id);
      await loadMitzvot();
      setActiveModal(null);
      setSelectedMitzva(null);
    } catch (error) {
      console.error('Error deleting mitzva:', error);
    }
    setSaving(false);
  };

  // Toggle cell used status (for edit mode)
  const toggleCellUsed = async (cellNum: number) => {
    const newSet = new Set(usedCellsSet);
    if (newSet.has(cellNum)) {
      newSet.delete(cellNum);
    } else {
      newSet.add(cellNum);
    }
    setUsedCellsSet(newSet);
    await setSetting('print_used_cells', Array.from(newSet).join(','));
  };

  // Clear all used cells
  const clearAllUsedCells = async () => {
    setUsedCellsSet(new Set());
    await setSetting('print_used_cells', '');
  };

  // Start new page
  const startNewPage = async () => {
    setUsedCellsSet(new Set());
    await setSetting('print_used_cells', '');
  };

  // Find first available cell
  const getFirstAvailableCell = (): number => {
    for (let i = 1; i <= cellsPerPage; i++) {
      if (!usedCellsSet.has(i)) return i;
    }
    return 1; // If all used, start from 1
  };

  // Generate cells for grid
  const generatePageCells = (): { num: number; status: 'used' | 'selected' | 'empty'; }[] => {
    const cells: { num: number; status: 'used' | 'selected' | 'empty'; }[] = [];
    const selectedCell = getFirstAvailableCell();

    for (let i = 1; i <= cellsPerPage; i++) {
      if (usedCellsSet.has(i)) {
        cells.push({ num: i, status: 'used' });
      } else if (i === selectedCell) {
        cells.push({ num: i, status: 'selected' });
      } else {
        cells.push({ num: i, status: 'empty' });
      }
    }
    return cells;
  };

  // Helper to convert Blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Print directly (opens system print dialog on Android)
  const handlePrint = async () => {
    if (!selectedMitzva) return;

    setIsPrinting(true);
    try {
      const qrDataUrl = await generateQRDataUrl(selectedMitzva.code, 200);
      const selectedCell = getFirstAvailableCell();

      const labelItems = [{
        name: selectedMitzva.name,
        qrDataUrl,
        serialNumber: selectedMitzva.id,
        isMitzva: true,
      }];

      const customPositions = new Map<number, number>();
      customPositions.set(0, selectedCell);

      // Generate PDF as blob
      const blob = await generatePDF(labelItems, selectedCell, "mitzvot", customPositions, true);

      if (blob && isAndroidPlatform) {
        // Android: Open system print dialog directly via plugin
        const base64 = await blobToBase64(blob);
        console.log('Calling Android print plugin...');
        await invoke('plugin:android-print|printPdf', {
          pdfBase64: base64
        });
        console.log('Print dialog opened');
      } else if (blob) {
        // Desktop/fallback: use window.print or download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `מדבקה-${selectedMitzva.name}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }

      // Mark cell as used
      const newUsedCells = new Set(usedCellsSet);
      newUsedCells.add(selectedCell);
      setUsedCellsSet(newUsedCells);
      await setSetting('print_used_cells', Array.from(newUsedCells).join(','));

      setActiveModal(null);
      setSelectedMitzva(null);
    } catch (error: unknown) {
      console.error('Print error:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
      alert('שגיאה בהדפסה: ' + errorMessage);
    } finally {
      setIsPrinting(false);
    }
  };

  // Download as PDF and mark cell as used
  const downloadAsPdf = async () => {
    if (!selectedMitzva) return;

    setIsPrinting(true);
    try {
      const qrDataUrl = await generateQRDataUrl(selectedMitzva.code, 200);
      const selectedCell = getFirstAvailableCell();

      const labelItems = [{
        name: selectedMitzva.name,
        qrDataUrl,
        serialNumber: selectedMitzva.id,
        isMitzva: true,
      }];

      const customPositions = new Map<number, number>();
      customPositions.set(0, selectedCell);

      await generatePDF(labelItems, selectedCell, "mitzvot", customPositions);

      // Mark cell as used
      const newUsedCells = new Set(usedCellsSet);
      newUsedCells.add(selectedCell);
      setUsedCellsSet(newUsedCells);
      await setSetting('print_used_cells', Array.from(newUsedCells).join(','));

      setActiveModal(null);
      setSelectedMitzva(null);
    } catch (error) {
      console.error('PDF error:', error);
      alert('שגיאה ביצירת PDF');
    } finally {
      setIsPrinting(false);
    }
  };

  // Export to Excel
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportMitzvotToExcel(mitzvot);
    } catch (error) {
      console.error("Error exporting mitzvot:", error);
      alert('שגיאה בייצוא');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (file: File) => {
    try {
      const data = await importMitzvotFromExcel(file);
      setImportPreview(data);
    } catch (error) {
      console.error("Error reading Excel file:", error);
      alert('שגיאה בקריאת קובץ האקסל');
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Execute the import
  const executeImport = async () => {
    if (importPreview.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      for (let i = 0; i < importPreview.length; i++) {
        const mitzva = importPreview[i];
        await createMitzva(
          mitzva.name,
          0,
          mitzva.notes,
          mitzva.availableOnHolidays,
          mitzva.holidaysOnly
        );
        setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
      }
      setImportComplete(true);
      await loadMitzvot();
    } catch (error) {
      console.error("Error importing mitzvot:", error);
      alert('שגיאה בייבוא');
    } finally {
      setIsImporting(false);
    }
  };

  // Close import modal
  const closeImportModal = () => {
    setActiveModal(null);
    setImportPreview([]);
    setImportProgress(0);
    setImportComplete(false);
    setIsImporting(false);
  };

  // Close modal
  const closeModal = () => {
    setActiveModal(null);
    setSelectedMitzva(null);
    setIsEditingGrid(false);
    setFormData({
      name: '',
      notes: '',
      availableOnHolidays: true,
      holidaysOnly: false,
    });
  };

  const usedCellsCount = usedCellsSet.size;
  const availableSlots = cellsPerPage - usedCellsCount;
  const currentPageCells = generatePageCells();

  if (loading) {
    return (
      <div className="mobile-screen">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          טוען...
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-screen">
      {/* Header */}
      <header className="mobile-header" style={{ flexShrink: 0 }}>
        <div className="header-row">
          <div>
            <h1 className="header-title">מצוות</h1>
            <div className="header-subtitle">{mitzvot.length} מצוות</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="header-icon-btn" onClick={handleOpenAddModal}>
              <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="screen-content">
        {/* Search Bar */}
        <div className="search-bar">
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text"
            placeholder="חיפוש מצווה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Chips */}
        <div className="filter-chips">
          {filters.map((filter) => (
            <button
              key={filter.id}
              className={`filter-chip ${activeFilter === filter.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Mitzva Grid */}
        <div className="mitzva-grid">
          {filteredMitzvot.map((mitzva) => (
            <div
              key={mitzva.id}
              className="mitzva-card"
              onClick={() => handleViewMitzva(mitzva)}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              {/* Delete X button in corner */}
              <button
                onClick={(e) => handleOpenDeleteModal(mitzva, e)}
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--gray-100)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'var(--gray-500)' }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
              <div className="mitzva-card-header">
                <div className="mitzva-icon">
                  <svg viewBox="0 0 24 24"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/></svg>
                </div>
                <div>
                  <div className="mitzva-card-name">{mitzva.name}</div>
                  <div className="mitzva-card-code">מצווה-{mitzva.id}</div>
                </div>
              </div>
              <div className={`mitzva-badge ${mitzva.holidays_only === 1 ? 'holiday' : 'available-blue'}`}>
                {mitzva.holidays_only === 1 ? 'חגים בלבד' : (mitzva.available_on_holidays === 1 ? 'זמין בחגים' : 'לא בחגים')}
              </div>
              <div className="member-card-actions">
                <button
                  className="member-action-btn secondary"
                  onClick={(e) => handleOpenEditModal(mitzva, e)}
                >
                  <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {filteredMitzvot.length === 0 && (
          <div className="empty-state" style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
            <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'currentColor', marginBottom: '1rem' }}>
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/>
            </svg>
            <p>{searchQuery ? 'לא נמצאו מצוות התואמות לחיפוש' : 'אין מצוות'}</p>
          </div>
        )}
      </div>

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls"
        onChange={handleFileInputChange}
      />

      {/* View Mitzva Modal */}
      {activeModal === 'view' && selectedMitzva && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '80vh', background: 'white', borderRadius: '1rem 1rem 0 0', zIndex: 101, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

            <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>פרטי מצווה</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="mitzva-icon" style={{ width: 64, height: 64 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 32, height: 32 }}><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{selectedMitzva.name}</div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>מצווה-{selectedMitzva.id}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div className={`mitzva-badge ${selectedMitzva.holidays_only === 1 ? 'holiday' : 'available-blue'}`}>
                    {selectedMitzva.holidays_only === 1 ? 'חגים בלבד' : (selectedMitzva.available_on_holidays === 1 ? 'זמין בחגים' : 'לא בחגים')}
                  </div>
                </div>
                {selectedMitzva.notes && (
                  <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                    <div style={{ fontWeight: 500, marginBottom: '0.25rem', color: 'var(--gray-600)' }}>הערות:</div>
                    <div style={{ color: 'var(--gray-700)' }}>{selectedMitzva.notes}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => handleOpenDeleteModal(selectedMitzva)} style={{ padding: '0.75rem', border: '1px solid #DC2626', borderRadius: '0.5rem', background: 'white', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'currentColor' }}><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
              <button onClick={() => handleOpenEditModal(selectedMitzva)} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor' }}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                עריכה
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Mitzva Modal */}
      {(activeModal === 'add' || activeModal === 'edit') && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: 'white', borderRadius: '1rem 1rem 0 0', zIndex: 101, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeModal === 'add' ? 'הוסף מצווה' : 'ערוך מצווה'}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>שם המצווה *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="הכנס שם מצווה" style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--gray-200)', borderRadius: '0.5rem', fontSize: '1rem' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '0.5rem', cursor: 'pointer' }}>
                    <span style={{ color: 'var(--gray-700)' }}>זמין בחגים</span>
                    <div onClick={() => setFormData({ ...formData, availableOnHolidays: !formData.availableOnHolidays })} style={{ width: 48, height: 28, borderRadius: 14, background: formData.availableOnHolidays ? 'var(--blue-500, #3B82F6)' : 'var(--gray-300)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: formData.availableOnHolidays ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: formData.holidaysOnly ? 'var(--warning-light, #FEF3C7)' : 'var(--gray-50)', borderRadius: '0.5rem', cursor: 'pointer', border: formData.holidaysOnly ? '1px solid var(--warning, #F59E0B)' : '1px solid transparent' }}>
                    <span style={{ color: formData.holidaysOnly ? '#92400E' : 'var(--gray-700)' }}>חגים בלבד</span>
                    <div onClick={() => setFormData({ ...formData, holidaysOnly: !formData.holidaysOnly })} style={{ width: 48, height: 28, borderRadius: 14, background: formData.holidaysOnly ? 'var(--warning, #F59E0B)' : 'var(--gray-300)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: formData.holidaysOnly ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                    </div>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>הערות</label>
                  <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="הערות נוספות..." rows={3} style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--gray-200)', borderRadius: '0.5rem', fontSize: '1rem', resize: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem' }}>
              <button onClick={closeModal} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ביטול</button>
              <button onClick={activeModal === 'add' ? handleAddMitzva : handleEditMitzva} disabled={saving || !formData.name.trim()} style={{ flex: 2, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: (saving || !formData.name.trim()) ? 'var(--gray-300)' : 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: (saving || !formData.name.trim()) ? 'not-allowed' : 'pointer' }}>
                {saving ? 'שומר...' : (activeModal === 'add' ? 'הוסף' : 'שמור')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {activeModal === 'delete' && selectedMitzva && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderRadius: '1rem 1rem 0 0', zIndex: 101, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-light, #DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: 'var(--primary, #3B82F6)' }}><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'var(--gray-900)' }}>מחיקת מצווה</h3>
              <p style={{ margin: 0, color: 'var(--gray-600)' }}>האם אתה בטוח שברצונך למחוק את <strong>{selectedMitzva.name}</strong>?</p>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--gray-500)', fontSize: '0.85rem' }}>פעולה זו אינה ניתנת לביטול</p>
            </div>
            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem' }}>
              <button onClick={closeModal} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ביטול</button>
              <button onClick={handleDeleteMitzva} disabled={saving} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: saving ? 'var(--gray-300)' : 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Print Modal - Same as PrintLabelsScreen */}
      {activeModal === 'print' && selectedMitzva && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'white', zIndex: 101, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>הדפסת מדבקה</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  onClick={() => setActiveModal('printer')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: '50%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: connectedPrinter ? 'var(--primary, #3B82F6)' : 'var(--gray-400)' }}>
                    <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
                  </svg>
                  {connectedPrinter && (
                    <div style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#10B981', border: '2px solid white' }} />
                  )}
                </button>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {/* A4 Preview - Same as PrintLabelsScreen */}
              <div className="a4-preview">
                <div className="a4-preview-title">
                  <span>תצוגת דף A4</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                      1 פריט • {usedCellsCount} תפוסים
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {usedCellsCount > 0 && (
                        <button onClick={startNewPage} style={{ padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid #F59E0B', background: '#FEF3C7', color: '#B45309', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                          דף חדש
                        </button>
                      )}
                      <button onClick={() => setIsEditingGrid(!isEditingGrid)} style={{ padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', border: isEditingGrid ? '1px solid #F59E0B' : '1px solid var(--gray-300)', background: isEditingGrid ? '#FEF3C7' : 'white', color: isEditingGrid ? '#B45309' : 'var(--gray-600)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        {isEditingGrid ? 'סיום' : 'סמן תפוסים'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Edit mode instructions */}
                {isEditingGrid && (
                  <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '8px', padding: '8px 12px', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#92400E' }}>לחץ על תאים כדי לסמן/לבטל תאים תפוסים</span>
                    {usedCellsCount > 0 && (
                      <button onClick={clearAllUsedCells} style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid #DC2626', background: 'white', color: '#DC2626', cursor: 'pointer' }}>נקה הכל</button>
                    )}
                  </div>
                )}

                {/* A4 Grid - Same as PrintLabelsScreen */}
                <div className="a4-grid">
                  {currentPageCells.map((cell, idx) => (
                    <div
                      key={idx}
                      className={`a4-cell ${cell.status}`}
                      onClick={isEditingGrid ? () => toggleCellUsed(cell.num) : undefined}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: cell.status === 'selected' ? '3px' : undefined,
                        background: cell.status === 'used' ? '#9CA3AF' : cell.status === 'selected' ? '#0EA5E9' : undefined,
                        cursor: isEditingGrid ? 'pointer' : undefined,
                        border: isEditingGrid && cell.status === 'used' ? '2px solid #6B7280' : undefined,
                      }}
                    >
                      {cell.status === 'used' ? (
                        <span style={{ color: 'white', fontSize: '14px' }}>✓</span>
                      ) : cell.status === 'selected' && !isEditingGrid ? (
                        <>
                          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'white', marginBottom: 1, flexShrink: 0 }}>
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h1v1h-1v-1zm-5 0h1v1h-1v-1zm1-1h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-4-4h1v1h-1v-1zm-2 2h1v1h-1v-1zm-1-1h1v1h-1v-1zm2 4h1v1h-1v-1zm2 0h1v1h-1v-1z"/>
                          </svg>
                          <span style={{ color: 'white', fontSize: '9px', fontWeight: 'bold', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: '1.1', width: '100%', paddingLeft: 1, paddingRight: 1 }}>
                            {selectedMitzva.name}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--gray-300)', fontSize: '10px' }}>{cell.num}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Print Footer - Fixed at bottom */}
            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem', background: 'white', flexShrink: 0 }}>
              <button onClick={handlePrint} disabled={isPrinting} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: isPrinting ? 'var(--gray-300)' : 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: isPrinting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor' }}><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                {isPrinting ? 'מדפיס...' : 'הדפס'}
              </button>
              <button onClick={downloadAsPdf} disabled={isPrinting} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: isPrinting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor' }}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                {isPrinting ? 'מייצר...' : 'הורד PDF'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Import Modal */}
      {activeModal === 'import' && (
        <>
          <div onClick={closeImportModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 100 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: 'white', borderRadius: '1rem 1rem 0 0', zIndex: 101, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>ייבוא מצוות</h3>
              <button onClick={closeImportModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {importComplete ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: '#10B981' }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  </div>
                  <h4 style={{ margin: '0 0 0.5rem' }}>הייבוא הושלם בהצלחה!</h4>
                  <p style={{ color: 'var(--gray-600)' }}>{importPreview.length} מצוות יובאו</p>
                </div>
              ) : isImporting ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <h4 style={{ margin: '0 0 1rem' }}>מייבא מצוות...</h4>
                  <div style={{ width: '100%', height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{ width: `${importProgress}%`, height: '100%', background: 'var(--blue-500, #3B82F6)', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>{importProgress}% - {Math.round((importProgress / 100) * importPreview.length)} / {importPreview.length}</div>
                </div>
              ) : importPreview.length > 0 ? (
                <>
                  <h4 style={{ margin: '0 0 0.5rem' }}>תצוגה מקדימה</h4>
                  <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', margin: '0 0 1rem' }}>נמצאו {importPreview.length} מצוות לייבוא</p>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: '0.5rem' }}>
                    {importPreview.map((mitzva, index) => (
                      <div key={index} style={{ padding: '0.75rem', borderBottom: index < importPreview.length - 1 ? '1px solid var(--gray-100)' : 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue-100, #DBEAFE)', color: 'var(--blue-600, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>{index + 1}</span>
                        <span>{mitzva.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed var(--gray-300)', borderRadius: '0.75rem', padding: '2rem', textAlign: 'center', cursor: 'pointer' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'var(--gray-400)', margin: '0 auto 1rem' }}><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                  <p style={{ margin: 0, color: 'var(--gray-600)' }}>לחץ לבחירת קובץ Excel</p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>.xlsx או .xls</p>
                </div>
              )}
            </div>

            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem' }}>
              {importComplete ? (
                <button onClick={closeImportModal} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>סגור</button>
              ) : importPreview.length > 0 && !isImporting ? (
                <>
                  <button onClick={closeImportModal} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ביטול</button>
                  <button onClick={executeImport} style={{ flex: 2, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ייבא ({importPreview.length})</button>
                </>
              ) : !isImporting ? (
                <button onClick={closeImportModal} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer' }}>ביטול</button>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Printer Selection Modal */}
      {activeModal === 'printer' && (
        <>
          <div onClick={() => setActiveModal('print')} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 102 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '60vh', background: 'white', borderRadius: '1rem 1rem 0 0', zIndex: 103, display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>בחר מדפסת</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  {connectedPrinter ? `מחובר: ${connectedPrinter}` : 'לא מחוברת מדפסת'}
                </span>
              </div>
              <button onClick={() => setActiveModal('print')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0', paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
              {[
                { id: 'system', name: 'מדפסת ברירת מחדל', icon: 'desktop' },
                { id: 'pdf', name: 'שמור כ-PDF', icon: 'pdf' },
              ].map((printer) => (
                <div
                  key={printer.id}
                  onClick={async () => {
                    setConnectedPrinter(printer.name);
                    await setSetting('connected_printer', printer.name);
                    setActiveModal('print');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '1rem',
                    cursor: 'pointer',
                    background: connectedPrinter === printer.name ? 'var(--primary-light, #DBEAFE)' : 'white',
                    borderBottom: '1px solid var(--gray-100)',
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: connectedPrinter === printer.name ? 'var(--primary, #3B82F6)' : 'var(--gray-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: connectedPrinter === printer.name ? 'white' : 'var(--gray-500)' }}>
                      {printer.icon === 'pdf' ? (
                        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/>
                      ) : (
                        <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                      )}
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{printer.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                      {connectedPrinter === printer.name ? 'מחובר' : 'לחץ לחיבור'}
                    </div>
                  </div>
                  {connectedPrinter === printer.name && (
                    <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: 'var(--primary, #3B82F6)' }}>
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  )}
                </div>
              ))}

              {connectedPrinter && (
                <div
                  onClick={async () => {
                    setConnectedPrinter(null);
                    await setSetting('connected_printer', '');
                    setActiveModal('print');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '1rem',
                    cursor: 'pointer',
                    marginTop: '0.5rem',
                    borderTop: '1px solid var(--gray-200)',
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    background: '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: '#DC2626' }}>
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: '#DC2626' }}>נתק מדפסת</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>הסר את החיבור הנוכחי</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
