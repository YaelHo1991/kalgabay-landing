import { useState } from "react";

// Galilyon stickers: 52.5mm x 35mm, 4x8 grid on A4
export const LABEL_CONFIG = {
  width: 52.5,      // 5.25cm - full width: 4 × 52.5 = 210mm
  height: 35,       // 3.5cm measured
  columns: 4,
  rows: 8,
  totalLabels: 32,
  topMargin: 5,     // 0.5cm measured from photo
  bottomMargin: 12, // Remaining: 297 - 5 - 280 = 12mm
  leftMargin: 0,    // No margin - stickers span full width
  pageWidth: 210,
  pageHeight: 297,
};

export function getLabelPosition(position: number): { top: string; right: string; row: number; col: number } {
  const adjustedPosition = ((position - 1) % LABEL_CONFIG.totalLabels) + 1;
  const row = Math.ceil(adjustedPosition / LABEL_CONFIG.columns);
  const col = ((adjustedPosition - 1) % LABEL_CONFIG.columns) + 1;

  // Calculate top position: topMargin + (row-1) * height
  const topMm = LABEL_CONFIG.topMargin + (row - 1) * LABEL_CONFIG.height;
  // Calculate right position: (columns - col) * width (RTL layout)
  const rightMm = (LABEL_CONFIG.columns - col) * LABEL_CONFIG.width;

  return {
    top: `${topMm}mm`,
    right: `${rightMm}mm`,
    row,
    col
  };
}

interface PreviewData {
  name: string;
  isMitzva: boolean;
}

interface LabelPositionSelectorProps {
  selectedPosition: number;
  onPositionChange?: (position: number) => void;
  onPositionSelect?: (position: number) => void;
  usedPositions?: number[];
  highlightedPositions?: number[];
  title?: string;
  previewData?: PreviewData;
}

export function LabelPositionSelector({
  selectedPosition,
  onPositionChange,
  onPositionSelect,
  usedPositions = [],
  highlightedPositions = [],
  title,
  previewData,
}: LabelPositionSelectorProps) {
  // Use either onPositionSelect or onPositionChange
  const handlePositionChange = onPositionSelect || onPositionChange || (() => {});
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);

  const renderCell = (position: number) => {
    const isSelected = position === selectedPosition;
    const isUsed = usedPositions.includes(position);
    const isHighlighted = highlightedPositions.includes(position);
    const isHovered = position === hoveredPosition;

    return (
      <div
        key={position}
        onClick={() => !isUsed && handlePositionChange(position)}
        onMouseEnter={() => setHoveredPosition(position)}
        onMouseLeave={() => setHoveredPosition(null)}
        style={{
          width: "100%",
          aspectRatio: `${LABEL_CONFIG.width}/${LABEL_CONFIG.height}`,
          border: isSelected
            ? "2px solid #3B82F6"
            : isHighlighted
            ? "2px solid #10B981"
            : "1px solid #e0e0e0",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isUsed ? "not-allowed" : "pointer",
          backgroundColor: isSelected
            ? "#EFF6FF"
            : isUsed
            ? "#F3F4F6"
            : isHighlighted
            ? "#D1FAE5"
            : isHovered
            ? "#F9FAFB"
            : "white",
          fontSize: "12px",
          fontWeight: isSelected ? "bold" : "normal",
          color: isUsed ? "#9CA3AF" : isSelected ? "#3B82F6" : "#374151",
          transition: "all 0.15s ease",
        }}
      >
        {position}
      </div>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {title && (
        <p style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#666", textAlign: "center" }}>
          {title}
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${LABEL_CONFIG.columns}, 1fr)`,
          gap: "4px",
          padding: "10px",
          backgroundColor: "#f9f9f9",
          borderRadius: "8px",
          maxWidth: "300px",
          margin: "0 auto",
        }}
      >
        {Array.from({ length: LABEL_CONFIG.totalLabels }, (_, i) => renderCell(i + 1))}
      </div>
      {previewData && selectedPosition > 0 && (
        <div style={{
          marginTop: "15px",
          padding: "10px",
          background: previewData.isMitzva ? "#FEF3C7" : "#EFF6FF",
          borderRadius: "8px",
          textAlign: "center",
          fontSize: "14px",
        }}>
          <strong>תצוגה מקדימה:</strong> {previewData.name}
        </div>
      )}
    </div>
  );
}

export default LabelPositionSelector;
