// SVG Icons
const HomeIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </svg>
);

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);

const DocumentIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const PrintIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
  </svg>
);

const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
  </svg>
);

export type TabId = "home" | "members" | "mitzvot" | "print" | "archive";

interface Tab {
  id: TabId;
  label: string;
  icon: () => JSX.Element;
  badge?: number;
}

const TABS: Tab[] = [
  { id: "home", label: "דף הבית", icon: HomeIcon },
  { id: "members", label: "מתפללים", icon: PeopleIcon },
  { id: "mitzvot", label: "מצוות", icon: DocumentIcon },
  { id: "print", label: "הדפסת מדבקות", icon: PrintIcon },
  { id: "archive", label: "ארכיון", icon: ArchiveIcon },
];

interface NavTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  membersCount?: number;
  mitzvotCount?: number;
}

export function NavTabs({
  activeTab,
  onTabChange,
  membersCount,
  mitzvotCount
}: NavTabsProps) {
  const getTabBadge = (tabId: TabId): number | undefined => {
    switch (tabId) {
      case "members":
        return membersCount;
      case "mitzvot":
        return mitzvotCount;
      default:
        return undefined;
    }
  };

  return (
    <div className="nav-tabs-container">
      <nav className="nav-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const badge = getTabBadge(tab.id);

          return (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon />
              {tab.label}
              {badge !== undefined && (
                <span className="nav-tab-badge">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
