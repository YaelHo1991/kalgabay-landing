/**
 * PrintLabelsScreen - Print labels with A4 preview
 * Click on Members/Mitzvot tabs to open selection modal
 * Supports direct printing to network printers via IPP on Android
 */

import { useState, useEffect } from 'react';
import { getAllMembers, getAllMitzvot, getSetting, setSetting } from '../../../database';
import { generatePDF, generateSimplePDF } from '../../../utils/pdfGenerator';
import { generateQRDataUrl } from '../../../components/QRGenerator';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

type PrintMode = 'members' | 'mitzvot' | 'combined';

interface PrintItem {
  id: number;
  name: string;
  initials: string;
  code: string;
  type: 'members' | 'mitzvot';
}

interface NetworkPrinter {
  name: string;
  uri: string;
  host: string;
  port: number;
}

// Check if running on Android - synchronous check (fast, reliable)
function isAndroidSync(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('android') || userAgent.includes('wv');
}

// Async version that also tries Tauri API
async function checkIsAndroid(): Promise<boolean> {
  // Start with synchronous check
  if (isAndroidSync()) {
    console.log('PrintLabelsScreen: Detected Android via userAgent');
    return true;
  }

  // Then try Tauri API
  try {
    const currentPlatform = await platform();
    console.log('PrintLabelsScreen: Tauri platform:', currentPlatform);
    return currentPlatform === 'android';
  } catch (e) {
    console.log('PrintLabelsScreen: Platform API failed');
    return false;
  }
}

// Convert Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper to get initials from name
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
}

export default function PrintLabelsScreen() {
  const [selectedMembers, setSelectedMembers] = useState<PrintItem[]>([]);
  const [selectedMitzvot, setSelectedMitzvot] = useState<PrintItem[]>([]);
  const [allMembers, setAllMembers] = useState<PrintItem[]>([]);
  const [allMitzvot, setAllMitzvot] = useState<PrintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedCellsSet, setUsedCellsSet] = useState<Set<number>>(new Set());
  const [activeModal, setActiveModal] = useState<'members' | 'mitzvot' | 'printer' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null);
  const [connectedPrinterName, setConnectedPrinterName] = useState<string | null>(null);

  // Printing states
  const [isPrinting, setIsPrinting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState<NetworkPrinter[]>([]);
  // Initialize with synchronous check to prevent flash
  const [isAndroidPlatform, setIsAndroidPlatform] = useState(() => isAndroidSync());

  // Detect platform on mount and load printers
  useEffect(() => {
    const init = async () => {
      const isAndroid = await checkIsAndroid();
      console.log('PrintLabelsScreen: isAndroid =', isAndroid);
      setIsAndroidPlatform(isAndroid);

      // Auto-load printers on desktop (not Android)
      if (!isAndroid) {
        try {
          const printers = await invoke<{ name: string; is_default: boolean }[]>('get_system_printers');
          const mappedPrinters: NetworkPrinter[] = printers.map(p => ({
            name: p.name,
            uri: p.name,
            host: 'localhost',
            port: 0,
          }));
          setNetworkPrinters(mappedPrinters);

          // Auto-select default printer
          const defaultPrinter = printers.find(p => p.is_default);
          if (defaultPrinter) {
            setConnectedPrinter(defaultPrinter.name);
            setConnectedPrinterName(defaultPrinter.name);
          }
        } catch (e) {
          console.error('Failed to load printers:', e);
        }
      }
    };
    init();
  }, []);

  // Load all data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const members = await getAllMembers();
        const memberItems: PrintItem[] = members.map(m => ({
          id: m.id,
          name: `${m.first_name} ${m.last_name}`,
          initials: getInitials(m.first_name, m.last_name),
          code: m.code,
          type: 'members' as const
        }));
        setAllMembers(memberItems);

        const mitzvot = await getAllMitzvot();
        const mitzvaItems: PrintItem[] = mitzvot.map(m => ({
          id: m.id,
          name: m.name,
          initials: m.name.substring(0, 2),
          code: m.code,
          type: 'mitzvot' as const
        }));
        setAllMitzvot(mitzvaItems);

        // Load used cells from settings (stored as comma-separated list)
        const usedCellsStr = await getSetting('print_used_cells');
        if (usedCellsStr) {
          const cellNumbers = usedCellsStr.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
          setUsedCellsSet(new Set(cellNumbers));
        }

        // Load connected printer from settings
        const savedPrinter = await getSetting('connected_printer');
        if (savedPrinter) {
          setConnectedPrinter(savedPrinter);
        }
        const savedPrinterName = await getSetting('connected_printer_name');
        if (savedPrinterName) {
          setConnectedPrinterName(savedPrinterName);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const toggleMember = (item: PrintItem) => {
    setSelectedMembers(prev =>
      prev.find(m => m.id === item.id)
        ? prev.filter(m => m.id !== item.id)
        : [...prev, item]
    );
  };

  const toggleMitzva = (item: PrintItem) => {
    setSelectedMitzvot(prev =>
      prev.find(m => m.id === item.id)
        ? prev.filter(m => m.id !== item.id)
        : [...prev, item]
    );
  };

  const selectAllMembers = () => {
    if (selectedMembers.length === allMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers([...allMembers]);
    }
  };

  const selectAllMitzvot = () => {
    if (selectedMitzvot.length === allMitzvot.length) {
      setSelectedMitzvot([]);
    } else {
      setSelectedMitzvot([...allMitzvot]);
    }
  };

  // Generate A4 grid with pagination (32 cells per page - 8 rows x 4 cols)
  const cellsPerPage = 32;
  const totalSelected = selectedMembers.length + selectedMitzvot.length;
  const allSelectedItems = [...selectedMembers, ...selectedMitzvot];
  const usedCellsCount = usedCellsSet.size;

  // Calculate number of pages needed
  const availableCellsFirstPage = cellsPerPage - usedCellsCount;
  const itemsAfterFirstPage = Math.max(0, totalSelected - availableCellsFirstPage);
  const additionalPages = Math.ceil(itemsAfterFirstPage / cellsPerPage);
  const totalPages = totalSelected > 0 ? 1 + additionalPages : 1;

  const [currentPage, setCurrentPage] = useState(1);

  // Toggle cell used status (for edit mode)
  const toggleCellUsed = async (cellNum: number) => {
    const newSet = new Set(usedCellsSet);
    if (newSet.has(cellNum)) {
      newSet.delete(cellNum);
    } else {
      newSet.add(cellNum);
    }
    setUsedCellsSet(newSet);
    // Save to database
    await setSetting('print_used_cells', Array.from(newSet).join(','));
  };

  // Clear all used cells (for edit mode)
  const clearAllUsedCells = async () => {
    setUsedCellsSet(new Set());
    await setSetting('print_used_cells', '');
  };

  // Start new page - reset all used cells
  const startNewPage = async () => {
    setUsedCellsSet(new Set());
    await setSetting('print_used_cells', '');
    setCurrentPage(1);
  };

  // Handle print/PDF completion - mark printed cells as used
  const handlePrintComplete = async () => {
    if (totalSelected === 0) return;

    // Calculate which cells will be printed
    const newUsedCells = new Set(usedCellsSet);
    let itemIndex = 0;

    // Go through all cells and mark the ones with items as used
    for (let globalCell = 1; itemIndex < totalSelected; globalCell++) {
      if (!newUsedCells.has(globalCell)) {
        // This cell will have an item printed
        newUsedCells.add(globalCell);
        itemIndex++;
      }
    }

    // Clean up fully used pages - keep only cells from the first page that has at least one free cell
    const cleanedCells = new Set<number>();
    let foundFreePage = false;
    let pageStart = 1;

    while (!foundFreePage) {
      let freeCellsInPage = 0;
      for (let i = 0; i < cellsPerPage; i++) {
        const globalCell = pageStart + i;
        if (!newUsedCells.has(globalCell)) {
          freeCellsInPage++;
        }
      }

      if (freeCellsInPage > 0) {
        // This page has free cells - keep cells from here onwards
        foundFreePage = true;
        for (const cell of newUsedCells) {
          if (cell >= pageStart) {
            // Shift cell numbers to start from 1
            cleanedCells.add(cell - pageStart + 1);
          }
        }
      } else {
        // This page is full, move to next page
        pageStart += cellsPerPage;
        if (pageStart > 1000) break; // Safety limit
      }
    }

    // Save the cleaned cells
    setUsedCellsSet(cleanedCells);
    await setSetting('print_used_cells', Array.from(cleanedCells).join(','));

    // Clear selection
    setSelectedMembers([]);
    setSelectedMitzvot([]);
    setCurrentPage(1);
  };

  // Refresh printers list - works on both Android and Desktop
  const refreshPrinters = async () => {
    setIsScanning(true);
    try {
      console.log('Refreshing printers...');

      if (isAndroidPlatform) {
        // On Android, we'll use the system print dialog approach
        // The "printers" list here is just for UI - actual printer selection happens in print dialog
        // For now, show a message that printing uses system dialog
        setNetworkPrinters([]);
      } else {
        // On Desktop, use get_system_printers
        const printers = await invoke<{ name: string; is_default: boolean }[]>('get_system_printers');
        console.log('Found printers:', printers);
        const mappedPrinters: NetworkPrinter[] = printers.map(p => ({
          name: p.name,
          uri: p.name, // Use name as URI for desktop
          host: 'localhost',
          port: 0,
        }));
        setNetworkPrinters(mappedPrinters);

        // Auto-select default printer if none selected
        if (!connectedPrinter) {
          const defaultPrinter = printers.find(p => p.is_default);
          if (defaultPrinter) {
            setConnectedPrinter(defaultPrinter.name);
            setConnectedPrinterName(defaultPrinter.name);
            await setSetting('connected_printer', defaultPrinter.name);
            await setSetting('connected_printer_name', defaultPrinter.name);
          }
        }
      }
    } catch (error) {
      console.error('Refresh printers error:', error);
    } finally {
      setIsScanning(false);
    }
  };

  // Prepare print items with QR codes
  const preparePrintItems = async () => {
    const items = [];
    for (const item of allSelectedItems) {
      const qrDataUrl = await generateQRDataUrl(item.code, 200);
      items.push({
        name: item.name,
        qrDataUrl,
        serialNumber: item.type === 'mitzvot' ? item.id : undefined,
        isMitzva: item.type === 'mitzvot',
      });
    }
    return items;
  };

  // Calculate start position for printing
  const getStartPosition = () => {
    let startPos = 1;
    while (usedCellsSet.has(startPos)) startPos++;
    return startPos;
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (totalSelected === 0) return;
    setIsPrinting(true);
    try {
      const printItems = await preparePrintItems();
      const type: 'combined' | 'members' | 'mitzvot' =
        selectedMembers.length > 0 && selectedMitzvot.length > 0
          ? 'combined'
          : selectedMembers.length > 0 ? 'members' : 'mitzvot';

      if (isAndroidPlatform) {
        // On Android: Use simple PDF generator (no html2canvas - avoids crashes)
        console.log('[PDF] Android: Using simple PDF generator...');

        try {
          // Generate PDF blob using simple method
          const blob = await generateSimplePDF(printItems, getStartPosition(), type);
          console.log('[PDF] Blob created, size:', blob.size);

          const fileName = `labels-${Date.now()}.pdf`;

          // Convert to base64
          const base64 = await blobToBase64(blob);
          console.log('[PDF] Base64 length:', base64.length);

          // Call Android plugin to save and open PDF
          const result = await invoke('plugin:android-print|openPdf', {
            pdfBase64: base64,
            fileName: fileName
          });
          console.log('[PDF] Plugin result:', result);

        } catch (error) {
          console.error('[PDF] Error:', error);
          alert('שגיאה ביצירת PDF: ' + error);
        }
      } else {
        // On Desktop: Generate and download PDF directly
        await generatePDF(printItems, getStartPosition(), type);
      }

      await handlePrintComplete();
    } catch (error) {
      console.error('PDF error:', error);
      alert('שגיאה ביצירת PDF: ' + error);
    } finally {
      setIsPrinting(false);
    }
  };

  // Print - on Android opens system print dialog, on desktop downloads PDF
  const handlePrint = async () => {
    if (totalSelected === 0) return;

    setIsPrinting(true);
    try {
      const printItems = await preparePrintItems();
      const type: 'combined' | 'members' | 'mitzvot' =
        selectedMembers.length > 0 && selectedMitzvot.length > 0
          ? 'combined'
          : selectedMembers.length > 0 ? 'members' : 'mitzvot';

      // Generate PDF as blob
      const blob = await generatePDF(printItems, getStartPosition(), type, undefined, true);

      if (blob && isAndroidPlatform) {
        // Android: Open system print dialog directly via plugin
        const base64 = await blobToBase64(blob);
        console.log('Calling Android print plugin...');
        await invoke('plugin:android-print|printPdf', {
          pdfBase64: base64
        });
        console.log('Print dialog opened');
      } else if (blob) {
        // Desktop/fallback: download PDF
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `מדבקות-${new Date().toISOString().slice(0, 10)}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }

      await handlePrintComplete();
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

  // Generate cells for current page
  const generatePageCells = (page: number): { num: number; status: string; item: PrintItem | null; globalCellNum: number }[] => {
    const cells: { num: number; status: string; item: PrintItem | null; globalCellNum: number }[] = [];

    // Calculate global cell number for this page
    const pageOffset = (page - 1) * cellsPerPage;

    // Count used cells before this position for item placement
    let itemsPlaced = 0;

    for (let i = 0; i < cellsPerPage; i++) {
      const cellNum = i + 1; // Cell number within page (1-32)
      const globalCellNum = pageOffset + cellNum; // Global cell number across all pages

      if (usedCellsSet.has(globalCellNum)) {
        // This cell is marked as used
        cells.push({ num: cellNum, status: 'used', item: null, globalCellNum });
      } else {
        // Calculate how many items have been placed before this cell
        let itemsBefore = 0;
        for (let j = 1; j < globalCellNum; j++) {
          if (!usedCellsSet.has(j)) {
            itemsBefore++;
          }
        }

        if (itemsBefore < allSelectedItems.length) {
          cells.push({ num: cellNum, status: 'selected', item: allSelectedItems[itemsBefore], globalCellNum });
        } else {
          cells.push({ num: cellNum, status: 'empty', item: null, globalCellNum });
        }
      }
    }
    return cells;
  };

  const currentPageCells = generatePageCells(currentPage);

  // Remove item from selection
  const removeItem = (item: PrintItem) => {
    if (item.type === 'members') {
      setSelectedMembers(prev => prev.filter(m => m.id !== item.id));
    } else {
      setSelectedMitzvot(prev => prev.filter(m => m.id !== item.id));
    }
  };

  // Filter items for modal
  const filteredItems = activeModal === 'members'
    ? allMembers.filter(m => m.name.includes(searchQuery))
    : allMitzvot.filter(m => m.name.includes(searchQuery));

  const selectedItems = activeModal === 'members' ? selectedMembers : selectedMitzvot;
  const toggleItem = activeModal === 'members' ? toggleMember : toggleMitzva;
  const selectAll = activeModal === 'members' ? selectAllMembers : selectAllMitzvot;
  const allItems = activeModal === 'members' ? allMembers : allMitzvot;

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
            <h1 className="header-title">הדפסת מדבקות</h1>
            <div className="header-subtitle">
              {totalSelected > 0 ? `${totalSelected} פריטים נבחרו` : 'בחר פריטים להדפסה'}
            </div>
          </div>
          <button
            className="header-icon-btn"
            onClick={() => setActiveModal('printer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: (connectedPrinter && !isAndroidPlatform) ? '6px 10px' : undefined,
              borderRadius: (connectedPrinter && !isAndroidPlatform) ? '20px' : undefined,
              background: (connectedPrinter && !isAndroidPlatform) ? 'var(--primary-light)' : undefined,
            }}
          >
            <svg viewBox="0 0 24 24" style={{ fill: (connectedPrinter && !isAndroidPlatform) ? 'var(--primary)' : undefined }}>
              <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
            </svg>
            {connectedPrinterName && !isAndroidPlatform && (
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 500, maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {connectedPrinterName}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="screen-content" style={{ paddingBottom: '220px' }}>
        {/* Selection Cards */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem', marginBottom: 0 }}>
          {/* Members Card */}
          <div
            onClick={() => { setActiveModal('members'); setSearchQuery(''); }}
            style={{
              flex: 1,
              background: selectedMembers.length > 0 ? 'var(--primary-light)' : 'white',
              border: `2px solid ${selectedMembers.length > 0 ? 'var(--primary)' : 'var(--gray-200)'}`,
              borderRadius: '0.75rem',
              padding: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: selectedMembers.length > 0 ? 'var(--primary)' : 'var(--gray-400)', marginBottom: '0.5rem' }}>
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            <div style={{ fontWeight: 'bold', color: selectedMembers.length > 0 ? 'var(--primary)' : 'var(--gray-700)' }}>
              מתפללים
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
              {selectedMembers.length > 0 ? `${selectedMembers.length} נבחרו` : `${allMembers.length} זמינים`}
            </div>
          </div>

          {/* Mitzvot Card */}
          <div
            onClick={() => { setActiveModal('mitzvot'); setSearchQuery(''); }}
            style={{
              flex: 1,
              background: selectedMitzvot.length > 0 ? 'var(--primary-light)' : 'white',
              border: `2px solid ${selectedMitzvot.length > 0 ? 'var(--primary)' : 'var(--gray-200)'}`,
              borderRadius: '0.75rem',
              padding: '1rem',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: selectedMitzvot.length > 0 ? 'var(--primary)' : 'var(--gray-400)', marginBottom: '0.5rem' }}>
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/>
            </svg>
            <div style={{ fontWeight: 'bold', color: selectedMitzvot.length > 0 ? 'var(--primary)' : 'var(--gray-700)' }}>
              מצוות
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
              {selectedMitzvot.length > 0 ? `${selectedMitzvot.length} נבחרו` : `${allMitzvot.length} זמינות`}
            </div>
          </div>
        </div>

        {/* A4 Preview */}
        <div className="a4-preview" style={{ margin: '0 1rem' }}>
          <div className="a4-preview-title">
            <span>תצוגת דף A4</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {totalSelected} פריטים • {usedCellsCount} תפוסים
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {usedCellsCount > 0 && (
                  <button
                    onClick={startNewPage}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      borderRadius: '4px',
                      border: '1px solid #F59E0B',
                      background: '#FEF3C7',
                      color: '#B45309',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}>
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    דף חדש
                  </button>
                )}
                <button
                  onClick={() => setIsEditingGrid(!isEditingGrid)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: isEditingGrid ? '1px solid #F59E0B' : '1px solid var(--gray-300)',
                    background: isEditingGrid ? '#FEF3C7' : 'white',
                    color: isEditingGrid ? '#B45309' : 'var(--gray-600)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'currentColor' }}>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                  {isEditingGrid ? 'סיום' : 'סמן תפוסים'}
                </button>
              </div>
            </div>
          </div>

          {/* Edit mode instructions */}
          {isEditingGrid && (
            <div style={{
              background: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.8rem', color: '#92400E' }}>
                לחץ על תאים כדי לסמן/לבטל תאים תפוסים
              </span>
              {usedCellsCount > 0 && (
                <button
                  onClick={clearAllUsedCells}
                  style={{
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #DC2626',
                    background: 'white',
                    color: '#DC2626',
                    cursor: 'pointer',
                  }}
                >
                  נקה הכל
                </button>
              )}
            </div>
          )}

          {/* Page Navigation */}
          {(totalPages > 1 || isEditingGrid) && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '0.75rem',
            }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid var(--gray-300)',
                  background: currentPage === 1 ? 'var(--gray-100)' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: currentPage === 1 ? 'var(--gray-400)' : 'var(--gray-700)' }}>
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
              </button>
              <span style={{ fontWeight: 'bold', color: 'var(--gray-700)' }}>
                עמוד {currentPage} {isEditingGrid || totalPages > 1 ? `מתוך ${Math.max(totalPages, currentPage)}` : ''}
              </span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!isEditingGrid && currentPage === totalPages}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid var(--gray-300)',
                  background: (!isEditingGrid && currentPage === totalPages) ? 'var(--gray-100)' : 'white',
                  cursor: (!isEditingGrid && currentPage === totalPages) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: (!isEditingGrid && currentPage === totalPages) ? 'var(--gray-400)' : 'var(--gray-700)' }}>
                  <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
                </svg>
              </button>
            </div>
          )}

          <div className="a4-grid">
            {currentPageCells.map((cell, idx) => (
              <div
                key={idx}
                className={`a4-cell ${cell.status}`}
                onClick={isEditingGrid ? () => toggleCellUsed(cell.globalCellNum) : undefined}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: cell.item ? '3px' : undefined,
                  background: cell.status === 'used'
                    ? '#9CA3AF'
                    : cell.item
                      ? (cell.item.type === 'members' ? '#2563EB' : '#0EA5E9')
                      : undefined,
                  cursor: isEditingGrid ? 'pointer' : undefined,
                  border: isEditingGrid && cell.status === 'used' ? '2px solid #6B7280' : undefined,
                }}
              >
                {cell.status === 'used' ? (
                  <span style={{ color: 'white', fontSize: '14px' }}>✓</span>
                ) : cell.item && !isEditingGrid ? (
                  <>
                    {/* X button to remove */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(cell.item!);
                      }}
                      style={{
                        position: 'absolute',
                        top: 1,
                        left: 1,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(255,255,255,0.3)',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: 0,
                      }}
                    >
                      ×
                    </button>

                    {/* QR Icon */}
                    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'white', marginBottom: 1, flexShrink: 0 }}>
                      <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h1v1h-1v-1zm-5 0h1v1h-1v-1zm1-1h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-4-4h1v1h-1v-1zm-2 2h1v1h-1v-1zm-1-1h1v1h-1v-1zm2 4h1v1h-1v-1zm2 0h1v1h-1v-1z"/>
                    </svg>

                    {/* Name - Larger and more visible */}
                    <span style={{
                      color: 'white',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: '1.1',
                      width: '100%',
                      paddingLeft: 1,
                      paddingRight: 1,
                    }}>
                      {cell.item.name}
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

      {/* Print Footer */}
      <div className="print-footer">
        <button
          className="print-footer-btn secondary"
          disabled={totalSelected === 0 || isPrinting}
          onClick={handleDownloadPdf}
        >
          {isPrinting ? (
            <span>טוען...</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              PDF
            </>
          )}
        </button>
        <button
          className="print-footer-btn primary"
          disabled={totalSelected === 0 || isPrinting}
          onClick={handlePrint}
        >
          {isPrinting ? (
            <span>מדפיס...</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3z"/></svg>
              הדפס ({totalSelected})
            </>
          )}
        </button>
      </div>

      {/* Selection Modal */}
      {activeModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setActiveModal(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 100,
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '80vh',
              background: 'white',
              borderRadius: '1rem 1rem 0 0',
              zIndex: 101,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>

            {/* Modal Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid var(--gray-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                  {activeModal === 'members' ? 'בחר מתפללים' : 'בחר מצוות'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  {selectedItems.length} נבחרו מתוך {allItems.length}
                </span>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--gray-100)' }}>
              <input
                type="text"
                placeholder="חיפוש..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--gray-200)',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                }}
              />
            </div>

            {/* Select All */}
            <div
              onClick={selectAll}
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--gray-100)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                background: selectedItems.length === allItems.length ? 'var(--primary-light)' : 'white',
              }}
            >
              <div style={{
                width: 22,
                height: 22,
                border: `2px solid ${selectedItems.length === allItems.length ? '#3B82F6' : '#D1D5DB'}`,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: selectedItems.length === allItems.length ? '#3B82F6' : 'white',
                transition: 'all 0.15s',
                color: selectedItems.length === allItems.length ? 'white' : 'transparent',
                fontSize: '12px',
                fontWeight: 'bold',
              }}>
                ✓
              </div>
              <span style={{ fontWeight: 'bold' }}>בחר הכל</span>
            </div>

            {/* Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
              {filteredItems.map((item) => {
                const isSelected = selectedItems.find(s => s.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--primary-light)' : 'white',
                    }}
                  >
                    <div style={{
                      width: 22,
                      height: 22,
                      border: `2px solid ${isSelected ? '#3B82F6' : '#D1D5DB'}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected ? '#3B82F6' : 'white',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                      color: isSelected ? 'white' : 'transparent',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}>
                      ✓
                    </div>
                    <div className="purchase-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem', flexShrink: 0 }}>
                      {item.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                        {item.code}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                  לא נמצאו תוצאות
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid var(--gray-200)',
              display: 'flex',
              gap: '0.75rem',
            }}>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid var(--gray-300)',
                  borderRadius: '0.5rem',
                  background: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                סגור
              </button>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '0.5rem',
                  background: 'var(--primary)',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                אישור ({selectedItems.length})
              </button>
            </div>
          </div>
        </>
      )}

      {/* Printer Selection Modal */}
      {activeModal === 'printer' && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setActiveModal(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 100,
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '70vh',
              background: 'white',
              borderRadius: '1rem 1rem 0 0',
              zIndex: 101,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid var(--gray-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>הגדרות מדפסת</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                  {isAndroidPlatform
                    ? 'ההדפסה תתבצע דרך מערכת אנדרואיד'
                    : connectedPrinterName
                      ? `מחובר: ${connectedPrinterName}`
                      : 'לא מחוברת מדפסת'}
                </span>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'var(--gray-500)' }}>
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Refresh Button - only show on Desktop (not Android) */}
            {!isAndroidPlatform && (
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--gray-100)' }}>
                {isScanning ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    color: 'var(--primary)',
                    padding: '0.5rem',
                  }}>
                    <span className="spinner" style={{ width: 18, height: 18 }}></span>
                    מחפש מדפסות...
                  </div>
                ) : (
                  <button
                    onClick={refreshPrinters}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: 'none',
                      borderRadius: '0.5rem',
                      background: 'transparent',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor' }}>
                      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                    </svg>
                    רענן רשימה
                  </button>
                )}
              </div>
            )}

            {/* Printer List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
              {/* Network Printers */}
              {networkPrinters.length > 0 && (
                <>
                  <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--gray-500)', fontWeight: 'bold' }}>
                    מדפסות ברשת
                  </div>
                  {networkPrinters.map((printer) => (
                    <div
                      key={printer.uri}
                      onClick={async () => {
                        setConnectedPrinter(printer.uri);
                        setConnectedPrinterName(printer.name);
                        await setSetting('connected_printer', printer.uri);
                        await setSetting('connected_printer_name', printer.name);
                        setActiveModal(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem',
                        cursor: 'pointer',
                        background: connectedPrinter === printer.uri ? 'var(--primary-light)' : 'white',
                        borderBottom: '1px solid var(--gray-100)',
                      }}
                    >
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        background: connectedPrinter === printer.uri ? 'var(--primary)' : 'var(--gray-100)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: connectedPrinter === printer.uri ? 'white' : 'var(--gray-500)' }}>
                          <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{printer.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                          {printer.host}:{printer.port}
                        </div>
                      </div>
                      {connectedPrinter === printer.uri && (
                        <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: 'var(--primary)' }}>
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </div>
                  ))}
                </>
              )}

              {/* Android message - uses system print dialog */}
              {isAndroidPlatform && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-600)' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'var(--primary)', marginBottom: '1rem' }}>
                    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                  </svg>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>הדפסה דרך מערכת אנדרואיד</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--gray-500)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                    לחץ על כפתור "הדפס" למטה.<br/>
                    תיפתח תיבת דו-שיח של אנדרואיד<br/>
                    עם כל המדפסות המחוברות למכשיר.
                  </div>
                  {totalSelected > 0 && (
                    <button
                      onClick={async () => {
                        setActiveModal(null);
                        await handlePrint();
                      }}
                      disabled={isPrinting}
                      style={{
                        padding: '0.75rem 2rem',
                        border: 'none',
                        borderRadius: '0.5rem',
                        background: 'var(--primary)',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        margin: '0 auto',
                        fontSize: '1rem',
                      }}
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'white' }}>
                        <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3z"/>
                      </svg>
                      {isPrinting ? 'פותח...' : `הדפס (${totalSelected})`}
                    </button>
                  )}
                </div>
              )}

              {/* No printers on Desktop */}
              {networkPrinters.length === 0 && !isAndroidPlatform && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'var(--gray-300)', marginBottom: '1rem' }}>
                    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
                  </svg>
                  <div>לא נמצאו מדפסות</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    ודא שהמדפסת מותקנת במחשב
                  </div>
                </div>
              )}

              {/* Disconnect option */}
              {connectedPrinter && (
                <div
                  onClick={async () => {
                    setConnectedPrinter(null);
                    setConnectedPrinterName(null);
                    await setSetting('connected_printer', '');
                    await setSetting('connected_printer_name', '');
                    setActiveModal(null);
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                      בטל את החיבור הנוכחי
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid var(--gray-200)',
            }}>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--gray-300)',
                  borderRadius: '0.5rem',
                  background: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                סגור
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
