/**
 * MembersScreen - Members list with search, filters, and CRUD operations
 * Features: View details, add, edit, delete, import/export, print members
 */

import { useState, useEffect, useRef } from 'react';
import {
  Member,
  getAllMembers,
  getPurchasedMitzvotForMember,
  createMember,
  updateMember,
  deleteMember,
  getSetting,
  setSetting,
} from '../../../database';
import { generateQRDataUrl } from '../../QRGenerator';
import { generatePDF } from '../../../utils/pdfGenerator';
import { exportMembersToExcel, importMembersFromExcel } from '../../../services/excelService';

// Extended member with stats
interface MemberWithStats extends Member {
  purchases: number;
  debt: number;
}

// Helper to get initials from name
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
}

type FilterType = 'all' | 'active' | 'debtors';
type ModalType = 'view' | 'add' | 'edit' | 'delete' | 'print' | 'import' | 'printer' | null;

interface CurrentUser {
  id: number;
  email: string;
  synagogue_name?: string;
  contact_name?: string;
}

interface MembersScreenProps {
  onNavigateToPrint?: (memberId: number) => void;
  currentUser?: CurrentUser | null;
}

export default function MembersScreen({ onNavigateToPrint, currentUser }: MembersScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [members, setMembers] = useState<MemberWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedMember, setSelectedMember] = useState<MemberWithStats | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    notes: '',
  });

  // Print state - same logic as PrintLabelsScreen
  const [usedCellsSet, setUsedCellsSet] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null);
  const cellsPerPage = 32;

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{firstName: string; lastName: string; phone?: string; email?: string; notes?: string}>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load members with their stats
  const loadMembers = async () => {
    setLoading(true);
    try {
      const allMembers = await getAllMembers();

      // Calculate stats for each member
      const membersWithStats = await Promise.all(
        allMembers.map(async (member) => {
          const purchases = await getPurchasedMitzvotForMember(member.id);
          const totalPurchases = purchases.reduce((sum, p) => sum + (p.bid_price || 0), 0);

          return {
            ...member,
            purchases: purchases.length,
            debt: 0, // Will be calculated based on payment status when needed
          };
        })
      );

      setMembers(membersWithStats);
    } catch (error) {
      console.error('Error loading members:', error);
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

  useEffect(() => {
    loadMembers();
    loadUsedCells();
    loadConnectedPrinter();
  }, []);

  // Find the gabbai member (best match with currentUser) - same logic as MembersPage
  const findGabbaiId = (): number | null => {
    if (!currentUser) return null;

    const userContactName = currentUser.contact_name?.toLowerCase().trim() || "";
    const userEmail = currentUser.email?.toLowerCase().trim() || "";

    // First priority: exact match on BOTH name AND email
    const exactMatch = members.find(m => {
      const memberFullName = `${m.first_name} ${m.last_name}`.toLowerCase().trim();
      const memberEmail = m.email?.toLowerCase().trim() || "";
      return userContactName !== "" && memberFullName === userContactName &&
             memberEmail !== "" && userEmail !== "" && memberEmail === userEmail;
    });
    if (exactMatch) return exactMatch.id;

    // Second priority: match on name only
    const nameMatch = members.find(m => {
      const memberFullName = `${m.first_name} ${m.last_name}`.toLowerCase().trim();
      return userContactName !== "" && memberFullName === userContactName;
    });
    if (nameMatch) return nameMatch.id;

    // Third priority: match on email only (only first match)
    const emailMatch = members.find(m => {
      const memberEmail = m.email?.toLowerCase().trim() || "";
      return memberEmail !== "" && userEmail !== "" && memberEmail === userEmail;
    });
    if (emailMatch) return emailMatch.id;

    return null;
  };

  const gabbaiId = findGabbaiId();

  const filters = [
    { id: 'all' as FilterType, label: 'הכל' },
    { id: 'active' as FilterType, label: 'פעילים' },
    { id: 'debtors' as FilterType, label: 'חייבים' },
  ];

  const filteredMembers = members
    .filter(member => {
      const fullName = `${member.first_name} ${member.last_name}`;
      // Search filter
      if (searchQuery && !fullName.includes(searchQuery) && !member.phone?.includes(searchQuery)) {
        return false;
      }
      // Type filter
      if (activeFilter === 'debtors' && member.debt === 0) {
        return false;
      }
      if (activeFilter === 'active' && member.purchases === 0) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Gabbai always comes first
      if (a.id === gabbaiId && b.id !== gabbaiId) return -1;
      if (a.id !== gabbaiId && b.id === gabbaiId) return 1;
      return 0;
    });

  // Open view modal
  const handleViewMember = (member: MemberWithStats) => {
    setSelectedMember(member);
    setActiveModal('view');
  };

  // Open add modal
  const handleOpenAddModal = () => {
    setFormData({ firstName: '', lastName: '', phone: '', email: '', notes: '' });
    setActiveModal('add');
  };

  // Open edit modal
  const handleOpenEditModal = (member: MemberWithStats, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMember(member);
    setFormData({
      firstName: member.first_name,
      lastName: member.last_name,
      phone: member.phone || '',
      email: member.email || '',
      notes: member.notes || '',
    });
    setActiveModal('edit');
  };

  // Open delete confirmation
  const handleOpenDeleteModal = (member: MemberWithStats, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMember(member);
    setActiveModal('delete');
  };

  // Handle add member
  const handleAddMember = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) return;

    setSaving(true);
    try {
      await createMember(
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.phone.trim() || undefined,
        formData.email.trim() || undefined,
        formData.notes.trim() || undefined
      );
      await loadMembers();
      setActiveModal(null);
    } catch (error) {
      console.error('Error adding member:', error);
    }
    setSaving(false);
  };

  // Handle edit member
  const handleEditMember = async () => {
    if (!selectedMember || !formData.firstName.trim() || !formData.lastName.trim()) return;

    setSaving(true);
    try {
      await updateMember(
        selectedMember.id,
        formData.firstName.trim(),
        formData.lastName.trim(),
        formData.phone.trim() || undefined,
        selectedMember.code,
        formData.email.trim() || undefined,
        formData.notes.trim() || undefined
      );
      await loadMembers();
      setActiveModal(null);
      setSelectedMember(null);
    } catch (error) {
      console.error('Error updating member:', error);
    }
    setSaving(false);
  };

  // Handle delete member
  const handleDeleteMember = async () => {
    if (!selectedMember) return;

    setSaving(true);
    try {
      await deleteMember(selectedMember.id);
      await loadMembers();
      setActiveModal(null);
      setSelectedMember(null);
    } catch (error) {
      console.error('Error deleting member:', error);
    }
    setSaving(false);
  };

  // Open print modal
  const handleOpenPrintModal = async (member: MemberWithStats, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Load used cells first, then set member and open modal together
    await loadUsedCells();
    setSelectedMember(member);
    setActiveModal('print');
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
    return 1;
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

  // Download as PDF and mark cell as used
  const downloadAsPdf = async () => {
    if (!selectedMember) return;

    setIsPrinting(true);
    try {
      const qrDataUrl = await generateQRDataUrl(selectedMember.code, 200);
      const selectedCell = getFirstAvailableCell();

      const labelItems = [{
        name: `${selectedMember.first_name} ${selectedMember.last_name}`,
        qrDataUrl,
        serialNumber: selectedMember.id,
        isMitzva: false,
      }];

      const customPositions = new Map<number, number>();
      customPositions.set(0, selectedCell);

      await generatePDF(labelItems, selectedCell, "members", customPositions);

      // Mark cell as used
      const newUsedCells = new Set(usedCellsSet);
      newUsedCells.add(selectedCell);
      setUsedCellsSet(newUsedCells);
      await setSetting('print_used_cells', Array.from(newUsedCells).join(','));

      setActiveModal(null);
      setSelectedMember(null);
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
      await exportMembersToExcel(members);
    } catch (error) {
      console.error("Error exporting members:", error);
      alert('שגיאה בייצוא');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (file: File) => {
    try {
      const data = await importMembersFromExcel(file);
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
        const member = importPreview[i];
        await createMember(
          member.firstName,
          member.lastName,
          member.phone,
          member.email,
          member.notes
        );
        setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
      }
      setImportComplete(true);
      await loadMembers();
    } catch (error) {
      console.error("Error importing members:", error);
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
    setSelectedMember(null);
    setIsEditingGrid(false);
    setFormData({ firstName: '', lastName: '', phone: '', email: '', notes: '' });
  };

  const usedCellsCount = usedCellsSet.size;
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
            <h1 className="header-title">מתפללים</h1>
            <div className="header-subtitle">{members.length} רשומים</div>
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
            placeholder="חיפוש לפי שם או טלפון..."
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

        {/* Member Grid */}
        <div className="member-grid">
          {filteredMembers.map((member) => {
            // Gabbai identified by matching currentUser (name/email)
            const isGabbai = member.id === gabbaiId;
            return (
              <div
                key={member.id}
                className="member-card"
                onClick={() => handleViewMember(member)}
                style={{
                  cursor: 'pointer',
                  position: 'relative',
                  ...(isGabbai ? {
                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                    border: '2px solid #F59E0B',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                  } : {}),
                }}
              >
                {/* Delete X button in corner */}
                <button
                  onClick={(e) => handleOpenDeleteModal(member, e)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: isGabbai ? 'rgba(255,255,255,0.8)' : 'var(--gray-100)',
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
                <div className="member-card-header">
                  <div
                    className="purchase-avatar"
                    style={isGabbai ? { background: '#F59E0B', color: 'white' } : undefined}
                  >
                    {getInitials(member.first_name, member.last_name)}
                  </div>
                  <div>
                    <div className="member-card-name">{member.first_name} {member.last_name}</div>
                    <div className="member-card-code">מתפלל-{member.id}</div>
                  </div>
                </div>
                {/* Contact details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  {member.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                      <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'var(--gray-400)' }}>
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                      </svg>
                      <span dir="ltr">{member.phone}</span>
                    </div>
                  )}
                  {member.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                      <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'var(--gray-400)' }}>
                        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                      </svg>
                      <span dir="ltr" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</span>
                    </div>
                  )}
                </div>
                <div className="member-stats">
                  <div className="member-stat">
                    <div className="member-stat-value">{member.purchases}</div>
                    <div className="member-stat-label">רכישות</div>
                  </div>
                  <div className="member-stat">
                    <div className="member-stat-value">₪{member.debt.toLocaleString()}</div>
                    <div className="member-stat-label">חוב</div>
                  </div>
                </div>
                <div className="member-card-actions">
                  <button
                    className="member-action-btn secondary"
                    onClick={(e) => handleOpenEditModal(member, e)}
                  >
                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredMembers.length === 0 && (
          <div className="empty-state" style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
            <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'currentColor', marginBottom: '1rem' }}>
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            <p>{searchQuery ? 'לא נמצאו מתפללים התואמים לחיפוש' : 'אין מתפללים'}</p>
          </div>
        )}
      </div>

      {/* View Member Modal */}
      {activeModal === 'view' && selectedMember && (
        <>
          <div
            onClick={closeModal}
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
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>פרטי מתפלל</h3>
              <button
                onClick={closeModal}
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

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {/* Member Avatar and Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="purchase-avatar" style={{ width: 64, height: 64, fontSize: '1.5rem' }}>
                  {getInitials(selectedMember.first_name, selectedMember.last_name)}
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                    {selectedMember.first_name} {selectedMember.last_name}
                  </div>
                  <div style={{ color: 'var(--gray-500)', fontSize: '0.9rem' }}>
                    קוד: {selectedMember.code}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedMember.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                    <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'var(--gray-500)' }}>
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                    <span>{selectedMember.phone}</span>
                  </div>
                )}
                {selectedMember.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                    <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'var(--gray-500)' }}>
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    <span>{selectedMember.email}</span>
                  </div>
                )}
                {selectedMember.notes && (
                  <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                    <div style={{ fontWeight: 500, marginBottom: '0.25rem', color: 'var(--gray-600)' }}>הערות:</div>
                    <div style={{ color: 'var(--gray-700)' }}>{selectedMember.notes}</div>
                  </div>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ flex: 1, padding: '1rem', background: 'var(--blue-50)', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--blue-600)' }}>{selectedMember.purchases}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>רכישות</div>
                  </div>
                  <div style={{ flex: 1, padding: '1rem', background: selectedMember.debt > 0 ? 'var(--warning-light)' : 'var(--success-light)', borderRadius: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.5rem', color: selectedMember.debt > 0 ? 'var(--warning)' : 'var(--success)' }}>₪{selectedMember.debt.toLocaleString()}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>חוב</div>
                  </div>
                </div>
              </div>
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
                onClick={() => handleOpenDeleteModal(selectedMember)}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #DC2626',
                  borderRadius: '0.5rem',
                  background: 'white',
                  color: '#DC2626',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'currentColor' }}>
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
              <button
                onClick={() => handleOpenEditModal(selectedMember)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: '1px solid var(--gray-300)',
                  borderRadius: '0.5rem',
                  background: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor' }}>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
                </svg>
                עריכה
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Member Modal */}
      {(activeModal === 'add' || activeModal === 'edit') && (
        <>
          <div
            onClick={closeModal}
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
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '85vh',
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
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                {activeModal === 'add' ? 'הוסף מתפלל' : 'ערוך מתפלל'}
              </h3>
              <button
                onClick={closeModal}
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

            {/* Form Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                    שם פרטי *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="הכנס שם פרטי"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                    שם משפחה *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="הכנס שם משפחה"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                    טלפון
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="050-0000000"
                    dir="ltr"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                    אימייל
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    dir="ltr"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                    הערות
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="הערות נוספות..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--gray-200)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                      resize: 'none',
                    }}
                  />
                </div>
              </div>
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
                onClick={closeModal}
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
                ביטול
              </button>
              <button
                onClick={activeModal === 'add' ? handleAddMember : handleEditMember}
                disabled={saving || !formData.firstName.trim() || !formData.lastName.trim()}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '0.5rem',
                  background: (saving || !formData.firstName.trim() || !formData.lastName.trim())
                    ? 'var(--gray-300)'
                    : 'var(--primary, #3B82F6)',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: (saving || !formData.firstName.trim() || !formData.lastName.trim())
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                {saving ? 'שומר...' : (activeModal === 'add' ? 'הוסף' : 'שמור')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {activeModal === 'delete' && selectedMember && (
        <>
          <div
            onClick={closeModal}
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
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'white',
              borderRadius: '1rem 1rem 0 0',
              zIndex: 101,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.3s ease-out',
            }}
          >
            {/* Modal Content */}
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--primary-light, #DBEAFE)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}>
                <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: 'var(--primary, #3B82F6)' }}>
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'var(--gray-900)' }}>
                מחיקת מתפלל
              </h3>
              <p style={{ margin: 0, color: 'var(--gray-600)' }}>
                האם אתה בטוח שברצונך למחוק את <strong>{selectedMember.first_name} {selectedMember.last_name}</strong>?
              </p>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--gray-500)', fontSize: '0.85rem' }}>
                פעולה זו אינה ניתנת לביטול
              </p>
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
                onClick={closeModal}
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
                ביטול
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: '0.5rem',
                  background: saving ? 'var(--gray-300)' : 'var(--primary, #3B82F6)',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'מוחק...' : 'מחק'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
      />

      {/* Print Modal - Same as MitzvotScreen */}
      {activeModal === 'print' && selectedMember && (
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
              {/* A4 Preview - Same as MitzvotScreen */}
              <div className="a4-preview">
                <div className="a4-preview-title">
                  <span>תצוגת דף A4</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                      {selectedMember.first_name} {selectedMember.last_name} • {usedCellsCount} תפוסים
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

                {/* A4 Grid - Member styling (blue #2563EB like PrintLabelsScreen) */}
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
                        background: cell.status === 'used' ? '#9CA3AF' : cell.status === 'selected' ? '#2563EB' : undefined,
                        cursor: isEditingGrid ? 'pointer' : undefined,
                        border: isEditingGrid && cell.status === 'used' ? '2px solid #6B7280' : undefined,
                      }}
                    >
                      {cell.status === 'used' ? (
                        <span style={{ color: 'white', fontSize: '14px' }}>✓</span>
                      ) : cell.status === 'selected' && !isEditingGrid && selectedMember ? (
                        <>
                          {/* QR icon like PrintLabelsScreen */}
                          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'white', marginBottom: 1, flexShrink: 0 }}>
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13 0h1v1h-1v-1zm-5 0h1v1h-1v-1zm1-1h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-2 0h1v1h-1v-1zm2 2h1v1h-1v-1zm-4-4h1v1h-1v-1zm-2 2h1v1h-1v-1zm-1-1h1v1h-1v-1zm2 4h1v1h-1v-1zm2 0h1v1h-1v-1z"/>
                          </svg>
                          <span style={{ color: 'white', fontSize: '9px', fontWeight: 'bold', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: '1.1', width: '100%', paddingLeft: 1, paddingRight: 1 }}>
                            {selectedMember.first_name} {selectedMember.last_name}
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

            {/* Print Footer - Fixed at bottom (blue styling like PrintLabelsScreen) */}
            <div style={{ padding: '1rem', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--gray-200)', display: 'flex', gap: '0.75rem', background: 'white', flexShrink: 0 }}>
              <button onClick={() => window.print()} style={{ flex: 1, padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: '0.5rem', background: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'currentColor' }}><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                הדפס
              </button>
              <button onClick={downloadAsPdf} disabled={isPrinting} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '0.5rem', background: isPrinting ? 'var(--gray-300)' : 'var(--primary, #3B82F6)', color: 'white', fontWeight: 'bold', cursor: isPrinting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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
          <div
            onClick={closeImportModal}
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
            {/* Modal Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid var(--gray-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                {importComplete ? 'ייבוא הושלם' : importPreview.length > 0 ? 'תצוגה מקדימה' : 'ייבוא מאקסל'}
              </h3>
              <button
                onClick={closeImportModal}
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

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {importComplete ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--success-light, #DCFCE7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                  }}>
                    <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: 'var(--success, #22C55E)' }}>
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  </div>
                  <h4 style={{ margin: '0 0 0.5rem' }}>הייבוא הושלם בהצלחה!</h4>
                  <p style={{ color: 'var(--gray-600)', margin: 0 }}>
                    {importPreview.length} מתפללים יובאו
                  </p>
                </div>
              ) : importPreview.length > 0 ? (
                <>
                  {isImporting && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{
                        background: 'var(--gray-200)',
                        borderRadius: '0.25rem',
                        height: 8,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          background: 'var(--primary, #3B82F6)',
                          height: '100%',
                          width: `${importProgress}%`,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                        מייבא... {importProgress}%
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--gray-600)' }}>
                    נמצאו {importPreview.length} מתפללים לייבוא:
                  </div>
                  <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid var(--gray-200)',
                    borderRadius: '0.5rem',
                  }}>
                    {importPreview.map((member, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          borderBottom: idx < importPreview.length - 1 ? '1px solid var(--gray-100)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                        }}
                      >
                        <div className="purchase-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>
                          {getInitials(member.firstName, member.lastName)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{member.firstName} {member.lastName}</div>
                          {member.phone && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{member.phone}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'var(--primary-light, #DBEAFE)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                  }}>
                    <svg viewBox="0 0 24 24" style={{ width: 32, height: 32, fill: 'var(--primary, #3B82F6)' }}>
                      <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                    </svg>
                  </div>
                  <h4 style={{ margin: '0 0 0.5rem' }}>ייבוא מאקסל</h4>
                  <p style={{ color: 'var(--gray-600)', margin: '0 0 1rem', fontSize: '0.9rem' }}>
                    בחר קובץ Excel עם עמודות: שם פרטי, שם משפחה, טלפון, אימייל, הערות
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '0.5rem',
                      background: 'var(--primary, #3B82F6)',
                      color: 'white',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    בחר קובץ
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {importPreview.length > 0 && !importComplete && (
              <div style={{
                padding: '1rem',
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
                borderTop: '1px solid var(--gray-200)',
                display: 'flex',
                gap: '0.75rem',
              }}>
                <button
                  onClick={closeImportModal}
                  disabled={isImporting}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid var(--gray-300)',
                    borderRadius: '0.5rem',
                    background: 'white',
                    fontWeight: 'bold',
                    cursor: isImporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  ביטול
                </button>
                <button
                  onClick={executeImport}
                  disabled={isImporting}
                  style={{
                    flex: 2,
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '0.5rem',
                    background: isImporting ? 'var(--gray-300)' : 'var(--primary, #3B82F6)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: isImporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isImporting ? 'מייבא...' : 'ייבא'}
                </button>
              </div>
            )}

            {importComplete && (
              <div style={{
                padding: '1rem',
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
                borderTop: '1px solid var(--gray-200)',
              }}>
                <button
                  onClick={closeImportModal}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '0.5rem',
                    background: 'var(--primary, #3B82F6)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  סגור
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Printer Selection Modal - Same as MitzvotScreen */}
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
