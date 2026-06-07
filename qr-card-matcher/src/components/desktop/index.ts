/**
 * Desktop Components
 * Components specific to the desktop (Windows/Mac/Linux) version
 */

// Re-export desktop-specific components
export { Dashboard } from '../Dashboard';
export { TitleBar } from '../TitleBar';
export { HebrewYearSidebar } from '../HebrewYearSidebar';
export { SyncSettings } from '../SyncSettings';
export { HamburgerMenu } from '../HamburgerMenu';
export { PrintPreviewModal } from '../PrintPreviewModal';
export { LabelPositionSelector } from '../LabelPositionSelector';

// Dashboard sub-components - explicit exports to avoid case sensitivity issues
export {
  DashboardDesktopView,
  DashboardHeader,
  MembersPage,
  MitzvotPage,
  PrintLabelsPage,
  ArchivePage,
  ScanningModal,
  PurchasesTable,
  NavTabs,
  ProgressWidget,
  UnpaidWidget,
  ReminderPreviewModal,
} from '../dashboard/index';
