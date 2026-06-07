import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { generateQRDataUrl } from "../components/QRGenerator";
import { invoke } from "@tauri-apps/api/core";

// Check if running on Android
function isAndroid(): boolean {
  return navigator.userAgent.toLowerCase().includes('android');
}

interface MemberPdfData {
  type: "member";
  name: string;
  phone?: string;
  email?: string;
  code: string;
  synagogueName?: string;
}

interface MitzvaPdfData {
  type: "mitzva";
  name: string;
  code: string;
  serialNumber: number;
  synagogueName?: string;
}

type PdfData = MemberPdfData | MitzvaPdfData;

const DEFAULT_SYNAGOGUE_NAME = "בית הכנסת";

async function createCardElement(data: PdfData): Promise<{ container: HTMLDivElement; cardElement: HTMLElement }> {
  // Generate QR code
  const qrDataUrl = await generateQRDataUrl(data.code, 200);

  // Create a hidden container for the card
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  document.body.appendChild(container);

  // Determine styling based on type - Mitzva has darker, more prominent styling
  const isMitzva = data.type === "mitzva";
  const borderColor = isMitzva ? "#1E5AA8" : "#4FA8D9";
  const nameColor = isMitzva ? "#163D75" : "#333";
  const nameFontSize = isMitzva ? "30px" : "26px";
  const footerColor = isMitzva ? "#1E5AA8" : "#1E5AA8";

  // Create the card HTML - matching the app's card design with small QR on side
  container.innerHTML = `
    <div id="pdf-card" style="
      width: 400px;
      background: white;
      border-radius: 16px;
      border: 3px solid ${borderColor};
      padding: 25px;
      box-sizing: border-box;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      position: relative;
    ">
      ${data.type === "mitzva" ? `
        <!-- Serial number badge -->
        <div style="
          position: absolute;
          top: 12px;
          right: 12px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1E5AA8 0%, #163D75 100%);
          color: #E3F2FD;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 20px;
          font-family: 'David Libre', 'Frank Ruhl Libre', 'Times New Roman', serif;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          border: 2px solid #4FA8D9;
        ">${data.serialNumber}</div>
      ` : ""}
      <!-- Main content area with QR on side -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      ">
        <!-- User info - main section -->
        <div style="
          flex: 1;
          text-align: center;
          padding-left: 20px;
        ">
          <h2 style="
            font-size: ${nameFontSize};
            color: ${nameColor};
            margin: 0 0 15px 0;
            font-weight: bold;
          ">${data.name}</h2>

          ${data.type === "member" && data.phone ? `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              color: #555;
              font-size: 14px;
              margin-bottom: 8px;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              <span style="direction: ltr;">${data.phone}</span>
            </div>
          ` : ""}

          ${data.type === "member" && data.email ? `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              color: #555;
              font-size: 13px;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path></svg>
              <span style="direction: ltr;">${data.email}</span>
            </div>
          ` : ""}
        </div>

        <!-- QR code - small on the side -->
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-right: 15px;
          border-right: 1px solid #e0e0e0;
        ">
          <img src="${qrDataUrl}" style="width: 70px; height: 70px;" />
          <span style="
            font-size: 8px;
            color: #999;
            margin-top: 5px;
            max-width: 75px;
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: center;
          ">${data.code.substring(0, 12)}...</span>
        </div>
      </div>

      <!-- Footer -->
      <div style="
        border-top: 1px solid #eee;
        margin-top: 20px;
        padding-top: 12px;
        text-align: center;
      ">
        <p style="
          font-size: 12px;
          color: ${footerColor};
          margin: 0;
        ">${data.synagogueName || DEFAULT_SYNAGOGUE_NAME}</p>
      </div>
    </div>
  `;

  // Wait for the image to load
  await new Promise(resolve => setTimeout(resolve, 100));

  const cardElement = document.getElementById("pdf-card");
  if (!cardElement) {
    document.body.removeChild(container);
    throw new Error("Failed to create card element");
  }

  return { container, cardElement };
}

export async function generateCardPdf(data: PdfData): Promise<void> {
  const { container, cardElement } = await createCardElement(data);

  const canvas = await html2canvas(cardElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  // Create PDF with appropriate size
  const imgWidth = 100; // mm
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [imgWidth + 10, imgHeight + 10],
  });

  // Add the canvas as an image
  const imgData = canvas.toDataURL("image/png");
  doc.addImage(imgData, "PNG", 5, 5, imgWidth, imgHeight);

  // Clean up
  document.body.removeChild(container);

  // Download
  const fileName = data.type === "member"
    ? `member-${data.name.replace(/\s+/g, "-")}.pdf`
    : `mitzva-${data.name.replace(/\s+/g, "-")}.pdf`;

  doc.save(fileName);
}

export async function generateCardPng(data: PdfData): Promise<void> {
  const { container, cardElement } = await createCardElement(data);

  const canvas = await html2canvas(cardElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  // Clean up
  document.body.removeChild(container);

  const fileName = data.type === "member"
    ? `member-${data.name.replace(/\s+/g, "-")}.png`
    : `mitzva-${data.name.replace(/\s+/g, "-")}.png`;

  if (isAndroid()) {
    // On Android, use Tauri to save the file
    try {
      const dataUrl = canvas.toDataURL("image/png");
      // Extract base64 data from data URL
      const base64Data = dataUrl.split(',')[1];
      // Save via Tauri command
      await invoke('save_image_to_gallery', {
        fileName,
        base64Data
      });
      alert(`התמונה נשמרה בגלריה: ${fileName}`);
    } catch (error) {
      console.error('Error saving image on Android:', error);
      // Fallback: try share API
      try {
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/png')
        );
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: fileName,
          });
        } else {
          alert('לא ניתן לשמור את התמונה במכשיר זה');
        }
      } catch (shareError) {
        console.error('Share fallback failed:', shareError);
        alert('לא ניתן לשמור את התמונה במכשיר זה');
      }
    }
  } else {
    // On desktop, use standard download
    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
}

// Label config matching LabelPositionSelector
// Galilyon stickers: 52.5mm x 35mm, 4x8 grid on A4
const LABEL_CONFIG = {
  width: 52.5,      // 5.25cm - full width: 4 × 52.5 = 210mm
  height: 35,       // 3.5cm per sticker
  columns: 4,
  rows: 8,
  totalLabels: 32,
  topMargin: 7,     // Reduced to 7mm to raise first row
  bottomMargin: 8,  // 8mm bottom margin
  leftMargin: 0,    // No margin - stickers span full width
  rowGap: 1,        // 1mm gap between rows
  pageWidth: 210,
  pageHeight: 297,
};

interface LabelItem {
  name: string;
  qrDataUrl: string;
  serialNumber?: number; // Simple serial number to display above QR for manual entry
  isMitzva?: boolean; // Preserve item type for correct styling in mixed print
}

// Generate PDF with sticker labels using HTML canvas for Hebrew support
// If returnBlob is true, returns a Blob instead of downloading
// If rotateForPrinter is true, rotates the page 180 degrees for correct printer orientation
export async function generatePDF(
  items: LabelItem[],
  startPosition: number,
  type: "mitzvot" | "members" | "combined",
  customPositions?: Map<number, number>,
  returnBlob: boolean = false,
  rotateForPrinter: boolean = false
): Promise<Blob | void> {
  const { width, height, columns, totalLabels, topMargin, leftMargin, rowGap, pageWidth, pageHeight } = LABEL_CONFIG;

  // Calculate positions for each item (use custom positions if provided)
  const getItemPosition = (index: number): number => {
    return customPositions?.get(index) ?? (startPosition + index);
  };

  // Calculate total pages needed based on the last position used
  const allPositions = items.map((_, index) => getItemPosition(index));
  const lastPosition = Math.max(...allPositions);
  const totalPages = Math.ceil(lastPosition / totalLabels);

  // Use pixels for precise rendering - 96 DPI is standard screen DPI
  // For A4 at 96 DPI: 210mm = 794px, 297mm = 1123px
  const DPI = 96;
  const MM_TO_PX = DPI / 25.4;

  const pageWidthPx = Math.round(pageWidth * MM_TO_PX);
  const pageHeightPx = Math.round(pageHeight * MM_TO_PX);
  const widthPx = Math.round(width * MM_TO_PX);
  const heightPx = Math.round(height * MM_TO_PX);
  const topMarginPx = Math.round(topMargin * MM_TO_PX);
  const leftMarginPx = Math.round(leftMargin * MM_TO_PX);

  // Create hidden container for rendering
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  document.body.appendChild(container);

  // Create all pages as HTML
  const pages: HTMLDivElement[] = [];

  // White background for the page
  const pageBgColor = "#ffffff";

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const pageDiv = document.createElement("div");
    pageDiv.style.cssText = `
      width: ${pageWidthPx}px;
      height: ${pageHeightPx}px;
      background: ${pageBgColor};
      position: relative;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
    `;

    // Create grid container - using pixels for precise placement
    const rowGapPx = Math.round(rowGap * MM_TO_PX);
    const gridDiv = document.createElement("div");
    gridDiv.style.cssText = `
      position: absolute;
      top: ${topMarginPx}px;
      left: ${leftMarginPx}px;
      display: grid;
      grid-template-columns: repeat(${columns}, ${widthPx}px);
      grid-auto-rows: ${heightPx}px;
      row-gap: ${rowGapPx}px;
      direction: rtl;
    `;

    // Build a map of position to item for this logic
    const positionToItem = new Map<number, LabelItem>();
    items.forEach((item, index) => {
      const pos = getItemPosition(index);
      positionToItem.set(pos, item);
    });

    // Pixel conversions for label elements
    const px = (mm: number) => Math.round(mm * MM_TO_PX);

    // Add labels for this page
    for (let pos = 1; pos <= totalLabels; pos++) {
      const globalPos = pageNum * totalLabels + pos;
      const item = positionToItem.get(globalPos);

      const labelDiv = document.createElement("div");
      labelDiv.style.cssText = `
        width: ${widthPx}px;
        height: ${heightPx}px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: ${px(4)}px ${px(4)}px;
      `;

      if (item) {
        // Check each item's type - use item.isMitzva if set, otherwise fall back to global type
        const isMitzva = item.isMitzva !== undefined ? item.isMitzva : (type === "mitzvot");

        // No outer border - the inner frame around the name is the design element
        labelDiv.style.background = "transparent";
        labelDiv.style.position = "relative";

        // Different styles for Mitzvot vs Members
        // Mitzvot: Light background, dark text (warm gold tones)
        // Members: Dark background, light text (inverted for contrast)
        const frameStyle = isMitzva
          ? {
              bg: "linear-gradient(180deg, #FDF8F0 0%, #E3F2FD 100%)",
              border: "#1E5AA8",
              text: "#163D75",
              decor: "#4FA8D9",
              decorSymbol: "✡",
            }
          : {
              bg: "linear-gradient(180deg, #1E5AA8 0%, #163D75 100%)",
              border: "#4FA8D9",
              text: "#E3F2FD",
              decor: "#4FA8D9",
              decorSymbol: "●",
            };

        // Calculate font size based on name length - auto-shrink for long names
        const nameLength = item.name.length;
        let nameFontSize = px(4.5); // Default size
        if (nameLength > 20) {
          nameFontSize = px(3);
        } else if (nameLength > 15) {
          nameFontSize = px(3.5);
        } else if (nameLength > 10) {
          nameFontSize = px(4);
        }

        labelDiv.innerHTML = `
          <!-- Decorative frame around the name - this is the main design element -->
          <div style="
            width: 90%;
            padding: ${px(2)}px ${px(3)}px;
            background: ${frameStyle.bg};
            border: ${px(0.8)}px solid ${frameStyle.border};
            border-radius: ${px(2)}px;
            box-shadow: 0 ${px(0.5)}px ${px(1)}px rgba(0,0,0,0.15);
            position: relative;
          ">
            <!-- Corner decorations inside frame -->
            <div style="position: absolute; top: ${px(0.5)}px; right: ${px(1)}px; font-size: ${px(2)}px; color: ${frameStyle.decor};">${frameStyle.decorSymbol}</div>
            <div style="position: absolute; top: ${px(0.5)}px; left: ${px(1)}px; font-size: ${px(2)}px; color: ${frameStyle.decor};">${frameStyle.decorSymbol}</div>

            <!-- Name centered in frame - font size auto-adjusts for long names -->
            <div style="
              font-size: ${nameFontSize}px;
              font-weight: bold;
              color: ${frameStyle.text};
              text-align: center;
              max-width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              ${isMitzva ? 'font-family: "David Libre", "Frank Ruhl Libre", serif;' : ''}
            ">
              ${item.name}
            </div>
          </div>

          <!-- Spacer -->
          <div style="flex: 1;"></div>

          <!-- Serial number above QR -->
          ${item.serialNumber ? `
            <div style="
              font-size: ${px(2.5)}px;
              color: ${isMitzva ? '#333' : '#222'};
              text-align: center;
              margin-bottom: ${px(0.5)}px;
              font-weight: 800;
            ">
              #${item.serialNumber}
            </div>
          ` : ''}

          <!-- QR at bottom - larger for better scanning -->
          <img src="${item.qrDataUrl}" style="width: ${px(14)}px; height: ${px(14)}px; margin-bottom: ${px(1)}px;" />
        `;
      }

      gridDiv.appendChild(labelDiv);
    }

    pageDiv.appendChild(gridDiv);
    container.appendChild(pageDiv);
    pages.push(pageDiv);
  }

  // Wait for images to load
  await new Promise(resolve => setTimeout(resolve, 200));

  // Create PDF from HTML
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      doc.addPage();
    }

    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    // If rotating for printer, create a new canvas rotated 180 degrees
    let finalCanvas = canvas;
    if (rotateForPrinter) {
      const rotatedCanvas = document.createElement("canvas");
      rotatedCanvas.width = canvas.width;
      rotatedCanvas.height = canvas.height;
      const ctx = rotatedCanvas.getContext("2d");
      if (ctx) {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI); // 180 degrees
        ctx.drawImage(canvas, 0, 0);
      }
      finalCanvas = rotatedCanvas;
    }

    const imgData = finalCanvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
  }

  // Cleanup
  document.body.removeChild(container);

  // Return blob or download
  if (returnBlob) {
    return doc.output('blob');
  }

  // Download the PDF with Hebrew filename
  const timestamp = new Date().toISOString().slice(0, 10);
  const typeNames: Record<string, string> = {
    members: "מתפללים",
    mitzvot: "מצוות",
    combined: "משולב",
  };
  const typeName = typeNames[type] || "מדבקות";
  const fileName = `${typeName}-${timestamp}.pdf`;
  doc.save(fileName);
}

// Server-based PDF generator for Android
// Sends the HTML to the server which converts it to PDF
// This ensures 100% match with desktop output
export async function generateServerPDF(
  items: LabelItem[],
  startPosition: number,
  type: "mitzvot" | "members" | "combined",
  customPositions?: Map<number, number>
): Promise<Blob> {
  const { width, height, columns, totalLabels, topMargin, leftMargin, rowGap, pageWidth, pageHeight } = LABEL_CONFIG;

  // Calculate positions for each item (use custom positions if provided)
  const getItemPosition = (index: number): number => {
    return customPositions?.get(index) ?? (startPosition + index);
  };

  // Calculate total pages needed based on the last position used
  const allPositions = items.map((_, index) => getItemPosition(index));
  const lastPosition = Math.max(...allPositions);
  const totalPages = Math.ceil(lastPosition / totalLabels);

  // Use pixels for precise rendering - 96 DPI is standard screen DPI
  const DPI = 96;
  const MM_TO_PX = DPI / 25.4;

  const pageWidthPx = Math.round(pageWidth * MM_TO_PX);
  const pageHeightPx = Math.round(pageHeight * MM_TO_PX);
  const widthPx = Math.round(width * MM_TO_PX);
  const heightPx = Math.round(height * MM_TO_PX);
  const topMarginPx = Math.round(topMargin * MM_TO_PX);
  const leftMarginPx = Math.round(leftMargin * MM_TO_PX);
  const rowGapPx = Math.round(rowGap * MM_TO_PX);

  // Pixel conversions for label elements
  const px = (mm: number) => Math.round(mm * MM_TO_PX);

  // Build position to item map
  const positionToItem = new Map<number, LabelItem>();
  items.forEach((item, index) => {
    const pos = getItemPosition(index);
    positionToItem.set(pos, item);
  });

  // Generate HTML for all pages
  let pagesHtml = '';

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    let labelsHtml = '';

    for (let pos = 1; pos <= totalLabels; pos++) {
      const globalPos = pageNum * totalLabels + pos;
      const item = positionToItem.get(globalPos);

      let labelContent = '';
      if (item) {
        const isMitzva = item.isMitzva !== undefined ? item.isMitzva : (type === "mitzvot");

        const frameStyle = isMitzva
          ? {
              bg: "linear-gradient(180deg, #FDF8F0 0%, #E3F2FD 100%)",
              border: "#1E5AA8",
              text: "#163D75",
              decor: "#4FA8D9",
              decorSymbol: "✡",
            }
          : {
              bg: "linear-gradient(180deg, #1E5AA8 0%, #163D75 100%)",
              border: "#4FA8D9",
              text: "#E3F2FD",
              decor: "#4FA8D9",
              decorSymbol: "●",
            };

        const nameLength = item.name.length;
        let nameFontSize = px(4.5);
        if (nameLength > 20) {
          nameFontSize = px(3);
        } else if (nameLength > 15) {
          nameFontSize = px(3.5);
        } else if (nameLength > 10) {
          nameFontSize = px(4);
        }

        labelContent = `
          <div style="
            width: 90%;
            padding: ${px(2)}px ${px(3)}px;
            background: ${frameStyle.bg};
            border: ${px(0.8)}px solid ${frameStyle.border};
            border-radius: ${px(2)}px;
            box-shadow: 0 ${px(0.5)}px ${px(1)}px rgba(0,0,0,0.15);
            position: relative;
          ">
            <div style="position: absolute; top: ${px(0.5)}px; right: ${px(1)}px; font-size: ${px(2)}px; color: ${frameStyle.decor};">${frameStyle.decorSymbol}</div>
            <div style="position: absolute; top: ${px(0.5)}px; left: ${px(1)}px; font-size: ${px(2)}px; color: ${frameStyle.decor};">${frameStyle.decorSymbol}</div>
            <div style="
              font-size: ${nameFontSize}px;
              font-weight: bold;
              color: ${frameStyle.text};
              text-align: center;
              max-width: 100%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              ${isMitzva ? 'font-family: "David Libre", "Frank Ruhl Libre", serif;' : ''}
            ">
              ${item.name}
            </div>
          </div>
          <div style="flex: 1;"></div>
          ${item.serialNumber ? `
            <div style="
              font-size: ${px(2.5)}px;
              color: ${isMitzva ? '#333' : '#222'};
              text-align: center;
              margin-bottom: ${px(0.5)}px;
              font-weight: 800;
            ">
              #${item.serialNumber}
            </div>
          ` : ''}
          <img src="${item.qrDataUrl}" style="width: ${px(14)}px; height: ${px(14)}px; margin-bottom: ${px(1)}px;" />
        `;
      }

      labelsHtml += `
        <div style="
          width: ${widthPx}px;
          height: ${heightPx}px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: ${px(4)}px;
          background: transparent;
        ">
          ${labelContent}
        </div>
      `;
    }

    pagesHtml += `
      <div style="
        width: ${pageWidthPx}px;
        height: ${pageHeightPx}px;
        background: #ffffff;
        position: relative;
        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
        direction: rtl;
        page-break-after: ${pageNum < totalPages - 1 ? 'always' : 'auto'};
      ">
        <div style="
          position: absolute;
          top: ${topMarginPx}px;
          left: ${leftMarginPx}px;
          display: grid;
          grid-template-columns: repeat(${columns}, ${widthPx}px);
          grid-auto-rows: ${heightPx}px;
          row-gap: ${rowGapPx}px;
          direction: rtl;
        ">
          ${labelsHtml}
        </div>
      </div>
    `;
  }

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          size: A4;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
        }
      </style>
    </head>
    <body>${pagesHtml}</body>
    </html>
  `;

  // Send to server
  const response = await fetch('https://yanshouf.com/api/html-to-pdf.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      html: fullHtml,
      filename: `labels-${type}-${new Date().toISOString().slice(0, 10)}.pdf`,
      returnBase64: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Server error' }));
    throw new Error(error.error || 'Failed to generate PDF on server');
  }

  return await response.blob();
}

// Simple PDF generator for Android - uses jsPDF directly without html2canvas
// This avoids crashes on Android WebView
export async function generateSimplePDF(
  items: LabelItem[],
  startPosition: number,
  type: "mitzvot" | "members" | "combined"
): Promise<Blob> {
  const { width, height, columns, totalLabels, topMargin, leftMargin, rowGap, pageWidth, pageHeight } = LABEL_CONFIG;

  // Create PDF
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Calculate positions
  const getItemPosition = (index: number): number => startPosition + index;
  const allPositions = items.map((_, index) => getItemPosition(index));
  const lastPosition = Math.max(...allPositions);
  const totalPages = Math.ceil(lastPosition / totalLabels);

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    if (pageNum > 0) {
      doc.addPage();
    }

    // Draw labels on this page
    for (let i = 0; i < items.length; i++) {
      const position = getItemPosition(i);
      const pageIndex = Math.floor((position - 1) / totalLabels);

      if (pageIndex !== pageNum) continue;

      const posOnPage = ((position - 1) % totalLabels);
      const row = Math.floor(posOnPage / columns);
      const col = columns - 1 - (posOnPage % columns); // RTL

      const x = leftMargin + col * width;
      const y = topMargin + row * (height + rowGap);

      const item = items[i];
      const isMitzva = item.isMitzva;

      // Draw border
      doc.setDrawColor(isMitzva ? 30 : 79, isMitzva ? 93 : 168, isMitzva ? 168 : 217);
      doc.setLineWidth(0.3);
      doc.roundedRect(x + 0.5, y + 0.5, width - 1, height - 1, 2, 2);

      // Draw name - simple text (Hebrew might not render perfectly but will work)
      doc.setFontSize(9);
      doc.setTextColor(isMitzva ? 22 : 51, isMitzva ? 61 : 51, isMitzva ? 117 : 51);

      // Center the name
      const textWidth = doc.getTextWidth(item.name);
      const textX = x + (width - textWidth) / 2;
      doc.text(item.name, textX, y + 8);

      // Draw serial number if exists
      if (item.serialNumber) {
        doc.setFontSize(8);
        doc.setTextColor(51, 51, 51);
        const serialText = `#${item.serialNumber}`;
        const serialWidth = doc.getTextWidth(serialText);
        doc.text(serialText, x + (width - serialWidth) / 2, y + 14);
      }

      // Draw QR code
      try {
        const qrSize = 14;
        const qrX = x + (width - qrSize) / 2;
        const qrY = y + height - qrSize - 2;
        doc.addImage(item.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      } catch (e) {
        console.error('Failed to add QR image:', e);
      }
    }
  }

  return doc.output('blob');
}
