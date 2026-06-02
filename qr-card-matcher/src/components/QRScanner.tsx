import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";

// Result can be either a string (legacy) or an object with code and optional amount
export interface ScanResult {
  code: string;
  amount?: number;
  amountConfidence?: number;
}

// Multi-scan result for batch mode
export interface MultiScanResult {
  codes: string[];
  total: number;
}

interface QRScannerProps {
  onScan: (result: string) => void;
  onScanWithAmount?: (result: ScanResult) => void; // New callback with amount detection
  onMultiScan?: (results: MultiScanResult) => void; // Callback for multi-scan batch mode
  onError?: (error: string) => void;
  onClose?: () => void;
  autoStart?: boolean;
  stopOnScan?: boolean; // If false, keep camera open after scan (for retry scenarios)
  resetTrigger?: number; // Increment this to reset scan cooldown (allows re-scanning same code)
  detectAmount?: boolean; // Enable visual amount detection from colored card
  multiScanMode?: boolean; // Enable scanning multiple QR codes in single frame
  hideCloseButton?: boolean; // Hide the close button (for persistent scanner)
  showCameraSelector?: boolean; // Show dropdown camera selector instead of just switch button
}

// 10 distinct colors for digit encoding - HSL ranges for detection
// Each color has a unique hue range for reliable camera detection
type ColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface ColorRange {
  name: string;
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  lMin: number;
  lMax: number;
}

// Color definitions matching the printable cards:
// 0=Black, 1=Red, 2=Blue, 3=Green, 4=Orange, 5=Purple, 6=Cyan, 7=Magenta, 8=Brown, 9=Lime
const COLOR_DEFINITIONS: Record<ColorIndex, ColorRange> = {
  0: { name: 'black',   hMin: 0,   hMax: 360, sMin: 0,  sMax: 20,  lMin: 0,  lMax: 25 },  // שחור
  1: { name: 'red',     hMin: 0,   hMax: 15,  sMin: 50, sMax: 100, lMin: 30, lMax: 60 },  // אדום
  2: { name: 'blue',    hMin: 200, hMax: 230, sMin: 50, sMax: 100, lMin: 25, lMax: 55 },  // כחול
  3: { name: 'green',   hMin: 100, hMax: 145, sMin: 40, sMax: 100, lMin: 20, lMax: 45 },  // ירוק
  4: { name: 'orange',  hMin: 20,  hMax: 45,  sMin: 80, sMax: 100, lMin: 40, lMax: 60 },  // כתום
  5: { name: 'purple',  hMin: 270, hMax: 310, sMin: 40, sMax: 100, lMin: 20, lMax: 45 },  // סגול
  6: { name: 'cyan',    hMin: 175, hMax: 195, sMin: 50, sMax: 100, lMin: 35, lMax: 55 },  // תכלת
  7: { name: 'magenta', hMin: 320, hMax: 345, sMin: 50, sMax: 100, lMin: 35, lMax: 55 },  // מג'נטה
  8: { name: 'brown',   hMin: 15,  hMax: 35,  sMin: 30, sMax: 70,  lMin: 20, lMax: 40 },  // חום
  9: { name: 'lime',    hMin: 70,  hMax: 100, sMin: 40, sMax: 100, lMin: 35, lMax: 60 },  // ליים
};

// Also check for red in the high hue range (wraps around 360)
const RED_HIGH_HUE: ColorRange = { name: 'red', hMin: 350, hMax: 360, sMin: 50, sMax: 100, lMin: 30, lMax: 60 };

// Color mappings for each column (digit -> color index)
// These must match exactly what's printed on the cards!
const COLOR_MAPPINGS = {
  thousands: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as ColorIndex[], // אלפים
  hundreds:  [1, 0, 3, 2, 5, 4, 7, 6, 9, 8] as ColorIndex[], // מאות
  tens:      [2, 3, 0, 1, 7, 6, 4, 5, 8, 9] as ColorIndex[], // עשרות
  units:     [3, 2, 1, 0, 6, 7, 5, 4, 9, 8] as ColorIndex[], // אחדות
};

// Reverse mappings: color index -> digit for each column
const REVERSE_MAPPINGS = {
  thousands: {} as Record<ColorIndex, number>,
  hundreds:  {} as Record<ColorIndex, number>,
  tens:      {} as Record<ColorIndex, number>,
  units:     {} as Record<ColorIndex, number>,
};

// Build reverse mappings
(Object.keys(COLOR_MAPPINGS) as Array<keyof typeof COLOR_MAPPINGS>).forEach(column => {
  COLOR_MAPPINGS[column].forEach((colorIndex, digit) => {
    REVERSE_MAPPINGS[column][colorIndex] = digit;
  });
});

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

// Detect which color index (0-9) this pixel belongs to
function detectColorIndex(r: number, g: number, b: number): ColorIndex | null {
  const [h, s, l] = rgbToHsl(r, g, b);

  const checkRange = (range: ColorRange): boolean =>
    h >= range.hMin && h <= range.hMax &&
    s >= range.sMin && s <= range.sMax &&
    l >= range.lMin && l <= range.lMax;

  // Check for red in high hue range first (wraps around)
  if (checkRange(RED_HIGH_HUE)) return 1;

  // Check each color definition
  for (let i = 0; i <= 9; i++) {
    if (checkRange(COLOR_DEFINITIONS[i as ColorIndex])) {
      return i as ColorIndex;
    }
  }

  return null;
}

// Get the dominant color in a region by sampling pixels
function getDominantColor(imageData: ImageData, startX: number, startY: number, width: number, height: number, imageWidth: number): ColorIndex | null {
  const colorCounts: Record<number, number> = {};
  let totalSamples = 0;

  // Sample every 2 pixels for accuracy
  for (let y = startY; y < startY + height && y < imageData.height; y += 2) {
    for (let x = startX; x < startX + width && x < imageWidth; x += 2) {
      const idx = (y * imageWidth + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];

      const colorIndex = detectColorIndex(r, g, b);
      if (colorIndex !== null) {
        colorCounts[colorIndex] = (colorCounts[colorIndex] || 0) + 1;
        totalSamples++;
      }
    }
  }

  if (totalSamples < 5) return null; // Not enough samples

  // Find the most common color
  let maxCount = 0;
  let dominantColor: ColorIndex | null = null;

  for (const [colorStr, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = parseInt(colorStr) as ColorIndex;
    }
  }

  // Require at least 30% of samples to be the dominant color
  if (dominantColor !== null && maxCount / totalSamples < 0.3) {
    return null;
  }

  return dominantColor;
}

interface ColumnDetection {
  column: 'thousands' | 'hundreds' | 'tens' | 'units';
  colorIndex: ColorIndex;
  digit: number;
  confidence: number;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

export function QRScanner({ onScan, onScanWithAmount, onMultiScan, onError, onClose, autoStart = true, stopOnScan = true, resetTrigger = 0, detectAmount = false, multiScanMode = false, hideCloseButton = false, showCameraSelector = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasAutoStarted = useRef(false);
  const lastScannedCode = useRef<string | null>(null);
  const scanCooldown = useRef(false);
  const [detectedAmount, setDetectedAmount] = useState<number | null>(null);
  const [amountConfidence, setAmountConfidence] = useState<number>(0);

  // Multi-scan state
  const [collectedCodes, setCollectedCodes] = useState<Set<string>>(new Set());
  const scannedCodesRef = useRef<Set<string>>(new Set());

  // Camera selector dropdown state
  const [showCameraDropdown, setShowCameraDropdown] = useState(false);

  const stopScanning = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsScanning(false);
  }, [stream]);

  const startScanning = useCallback(async (cameraId?: string) => {
    try {
      const deviceId = cameraId || selectedCamera;

      let constraints: MediaStreamConstraints;

      if (deviceId) {
        constraints = {
          video: {
            deviceId: { ideal: deviceId },
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
      } else {
        constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = mediaStream;

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("Video load error"));
          setTimeout(() => reject(new Error("Timeout waiting for video")), 5000);
        });

        await video.play();
        setIsScanning(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          onError?.("גישה למצלמה נדחתה. יש לאשר גישה בהגדרות המערכת.");
        } else if (err.name === 'NotFoundError') {
          onError?.("לא נמצאה מצלמה במערכת.");
        } else if (err.name === 'NotReadableError') {
          onError?.("המצלמה בשימוש על ידי תוכנה אחרת.");
        } else {
          onError?.(`שגיאת מצלמה: ${err.message}`);
        }
      } else {
        onError?.("לא ניתן לגשת למצלמה. ודא שהתרת גישה למצלמה.");
      }
    }
  }, [selectedCamera, onError]);

  // Load available cameras on mount
  useEffect(() => {
    const loadCameras = async () => {
      setIsLoading(true);
      setCameraError(null);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError("ממשק המצלמה אינו זמין");
          setIsLoading(false);
          return;
        }

        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        tempStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `מצלמה ${index + 1}`
          }));

        setCameras(videoDevices);

        if (videoDevices.length > 0 && !selectedCamera) {
          const backCamera = videoDevices.find(c =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment') ||
            c.label.includes('0')
          );
          setSelectedCamera(backCamera?.deviceId || videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error loading cameras:", err);
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setCameraError("יש לאשר גישה למצלמה בהגדרות האפליקציה");
          } else {
            setCameraError(`שגיאה בטעינת מצלמות: ${err.message}`);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadCameras();
  }, []);

  // Auto-start scanning when cameras are loaded
  useEffect(() => {
    if (autoStart && !hasAutoStarted.current && !isLoading && !cameraError && selectedCamera && !isScanning) {
      hasAutoStarted.current = true;
      startScanning();
    }
  }, [autoStart, isLoading, cameraError, selectedCamera, isScanning, startScanning]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [stream]);

  // Reset cooldown when resetTrigger changes (e.g., user clicks "try again")
  useEffect(() => {
    if (resetTrigger > 0) {
      lastScannedCode.current = null;
      scanCooldown.current = false;
    }
  }, [resetTrigger]);

  // Function to detect amount from colored digits on card
  // The card has 4 columns (thousands, hundreds, tens, units) each showing digits 0-9
  // Each digit is printed in a specific color based on the column's mapping
  // The selected digit is visible in the "window frame" area
  const detectAmountFromImage = useCallback((imageData: ImageData, width: number, height: number): { amount: number; confidence: number } | null => {
    // Assume the digit columns are in the middle 60% of the image width
    // and in the middle 50% of the image height (where the window frames are)
    const columnsStartX = Math.floor(width * 0.2);
    const columnsEndX = Math.floor(width * 0.8);
    const columnsWidth = columnsEndX - columnsStartX;

    // Window area is roughly in the center vertically
    const windowStartY = Math.floor(height * 0.35);
    const windowEndY = Math.floor(height * 0.65);
    const windowHeight = windowEndY - windowStartY;

    // Divide into 4 columns
    const columnWidth = columnsWidth / 4;
    const columns: Array<'thousands' | 'hundreds' | 'tens' | 'units'> = ['thousands', 'hundreds', 'tens', 'units'];

    const detections: ColumnDetection[] = [];

    columns.forEach((columnName, idx) => {
      // Calculate the region for this column's window
      const colStartX = Math.floor(columnsStartX + idx * columnWidth + columnWidth * 0.15);
      const colWidth = Math.floor(columnWidth * 0.7);

      // Sample the window region to find the dominant color
      const dominantColor = getDominantColor(
        imageData,
        colStartX,
        windowStartY,
        colWidth,
        windowHeight,
        width
      );

      if (dominantColor !== null) {
        // Use the reverse mapping to get the digit from the detected color
        const digit = REVERSE_MAPPINGS[columnName][dominantColor];
        if (digit !== undefined) {
          detections.push({
            column: columnName,
            colorIndex: dominantColor,
            digit,
            confidence: 1
          });
        }
      }
    });

    if (detections.length === 0) return null;

    // Calculate the amount from detected digits
    let amount = 0;
    const multipliers: Record<string, number> = {
      thousands: 1000,
      hundreds: 100,
      tens: 10,
      units: 1
    };

    detections.forEach(det => {
      amount += det.digit * multipliers[det.column];
    });

    const confidence = detections.length / 4;
    return { amount, confidence };
  }, []);

  // Scan multiple regions of the image to find QR codes
  const scanMultipleRegions = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number): string[] => {
    const foundCodes: string[] = [];
    const checkedCodes = new Set<string>();

    // Define overlapping scan regions (grid pattern with overlap)
    const regions = [
      // Full image
      { x: 0, y: 0, w: width, h: height },
      // Quadrants
      { x: 0, y: 0, w: width * 0.6, h: height * 0.6 },
      { x: width * 0.4, y: 0, w: width * 0.6, h: height * 0.6 },
      { x: 0, y: height * 0.4, w: width * 0.6, h: height * 0.6 },
      { x: width * 0.4, y: height * 0.4, w: width * 0.6, h: height * 0.6 },
      // Halves
      { x: 0, y: 0, w: width, h: height * 0.55 },
      { x: 0, y: height * 0.45, w: width, h: height * 0.55 },
      { x: 0, y: 0, w: width * 0.55, h: height },
      { x: width * 0.45, y: 0, w: width * 0.55, h: height },
      // Center region
      { x: width * 0.2, y: height * 0.2, w: width * 0.6, h: height * 0.6 },
    ];

    for (const region of regions) {
      try {
        const regionData = ctx.getImageData(
          Math.floor(region.x),
          Math.floor(region.y),
          Math.floor(region.w),
          Math.floor(region.h)
        );

        const code = jsQR(regionData.data, Math.floor(region.w), Math.floor(region.h), {
          inversionAttempts: "dontInvert",
        });

        if (code && !checkedCodes.has(code.data)) {
          checkedCodes.add(code.data);
          foundCodes.push(code.data);
        }
      } catch {
        // Skip invalid regions
      }
    }

    return foundCodes;
  }, []);

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) {
      if (isScanning) {
        animationRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Try to detect amount from colored markers (if enabled)
      if (detectAmount) {
        const amountResult = detectAmountFromImage(imageData, canvas.width, canvas.height);
        if (amountResult && amountResult.confidence > 0.3) {
          setDetectedAmount(amountResult.amount);
          setAmountConfidence(amountResult.confidence);
        }
      }

      // Multi-scan mode: scan multiple regions for multiple QR codes
      if (multiScanMode) {
        const foundCodes = scanMultipleRegions(ctx, canvas.width, canvas.height);

        // Add new codes to collection
        let hasNewCodes = false;
        for (const code of foundCodes) {
          if (!scannedCodesRef.current.has(code)) {
            scannedCodesRef.current.add(code);
            hasNewCodes = true;
          }
        }

        if (hasNewCodes) {
          setCollectedCodes(new Set(scannedCodesRef.current));
        }

        animationRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      // Single scan mode (original behavior)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code) {
        // Prevent duplicate scans of the same code or during cooldown
        if (scanCooldown.current || code.data === lastScannedCode.current) {
          animationRef.current = requestAnimationFrame(scanFrame);
          return;
        }

        lastScannedCode.current = code.data;
        scanCooldown.current = true;

        // Set cooldown to prevent rapid repeated scans
        setTimeout(() => {
          scanCooldown.current = false;
        }, 1500);

        // If amount detection is enabled and we have a callback for it
        if (detectAmount && onScanWithAmount) {
          const amountResult = detectAmountFromImage(imageData, canvas.width, canvas.height);
          onScanWithAmount({
            code: code.data,
            amount: amountResult?.amount,
            amountConfidence: amountResult?.confidence,
          });
        } else {
          onScan(code.data);
        }

        if (stopOnScan) {
          stopScanning();
          return;
        }
        // If not stopping, continue scanning after cooldown
      }
    }

    animationRef.current = requestAnimationFrame(scanFrame);
  }, [isScanning, onScan, onScanWithAmount, stopScanning, stopOnScan, detectAmount, detectAmountFromImage, multiScanMode, scanMultipleRegions]);

  useEffect(() => {
    if (isScanning && !animationRef.current) {
      animationRef.current = requestAnimationFrame(scanFrame);
    }
  }, [isScanning, scanFrame]);

  const switchCamera = () => {
    if (cameras.length <= 1) return;

    const currentIndex = cameras.findIndex(c => c.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex].deviceId;

    setSelectedCamera(nextCamera);

    if (isScanning) {
      stopScanning();
      setTimeout(() => startScanning(nextCamera), 100);
    }
  };

  const handleClose = () => {
    stopScanning();
    onClose?.();
  };

  return (
    <div className="scanner-container" style={{ position: 'relative' }}>
      {/* Video container with overlay */}
      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxHeight: "300px",
            objectFit: "cover",
            display: isScanning ? "block" : "none",
            backgroundColor: "#000",
          }}
          playsInline
          muted
          autoPlay
        />

        {/* Loading state */}
        {isLoading && (
          <div style={{
            width: "100%",
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a1a1a",
            borderRadius: "12px",
            color: "white"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: "40px",
                height: "40px",
                border: "3px solid #333",
                borderTopColor: "#C9A86C",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 10px"
              }} />
              טוען מצלמה...
            </div>
          </div>
        )}

        {/* Scanning overlay with status text */}
        {isScanning && (
          <>
            {/* Close button (X) - only show if not hidden */}
            {!hideCloseButton && (
              <button
                onClick={handleClose}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}

            {/* Switch camera button / Camera selector dropdown */}
            {cameras.length > 1 && (
              <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}>
                <button
                  onClick={() => showCameraSelector ? setShowCameraDropdown(!showCameraDropdown) : switchCamera()}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: showCameraDropdown ? 'rgba(79, 168, 217, 0.9)' : 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                    <path d="M12 17c1.65 0 3-1.35 3-3h-2c0 .55-.45 1-1 1s-1-.45-1-1h-2c0 1.65 1.35 3 3 3z" transform="rotate(180 12 14)"/>
                  </svg>
                </button>

                {/* Camera selector dropdown */}
                {showCameraSelector && showCameraDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    left: '0',
                    background: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    minWidth: '200px',
                    overflow: 'hidden',
                    direction: 'rtl'
                  }}>
                    <div style={{
                      padding: '10px 15px',
                      background: '#1E5AA8',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      בחר מצלמה
                    </div>
                    {cameras.map((camera, index) => (
                      <button
                        key={camera.deviceId}
                        onClick={() => {
                          setSelectedCamera(camera.deviceId);
                          setShowCameraDropdown(false);
                          if (isScanning) {
                            stopScanning();
                            setTimeout(() => startScanning(camera.deviceId), 100);
                          }
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '12px 15px',
                          border: 'none',
                          background: selectedCamera === camera.deviceId ? '#e3f2fd' : 'white',
                          textAlign: 'right',
                          cursor: 'pointer',
                          borderBottom: index < cameras.length - 1 ? '1px solid #eee' : 'none',
                          fontSize: '0.9rem',
                          color: '#333',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedCamera !== camera.deviceId) {
                            e.currentTarget.style.background = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = selectedCamera === camera.deviceId ? '#e3f2fd' : 'white';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          {selectedCamera === camera.deviceId && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1E5AA8">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                          )}
                          <span>{camera.label || `מצלמה ${index + 1}`}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Amount detection overlay - show when detecting amount */}
            {detectAmount && detectedAmount !== null && (
              <div style={{
                position: 'absolute',
                top: '50px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: amountConfidence > 0.5 ? 'rgba(39, 174, 96, 0.9)' : 'rgba(241, 196, 15, 0.9)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}>
                <span>סכום:</span>
                <span style={{ fontSize: '24px' }}>{detectedAmount.toLocaleString()} ₪</span>
                {amountConfidence < 0.5 && <span style={{ fontSize: '12px' }}>(חלקי)</span>}
              </div>
            )}

            {/* Multi-scan mode overlay */}
            {multiScanMode && collectedCodes.size > 0 && (
              <div style={{
                position: 'absolute',
                top: '50px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(39, 174, 96, 0.95)',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                maxWidth: '90%'
              }}>
                <span style={{
                  background: 'white',
                  color: '#27ae60',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  {collectedCodes.size}
                </span>
                <span>קודים נסרקו</span>
              </div>
            )}

            {/* Status text overlay */}
            <div style={{
              position: 'absolute',
              bottom: multiScanMode ? '70px' : '15px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                background: '#4CAF50',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite'
              }} />
              {multiScanMode ? 'סורק מספר קודים...' : 'מחפש קוד QR...'}
            </div>

            {/* Multi-scan action buttons */}
            {multiScanMode && (
              <div style={{
                position: 'absolute',
                bottom: '15px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '10px'
              }}>
                <button
                  onClick={() => {
                    if (collectedCodes.size > 0 && onMultiScan) {
                      onMultiScan({
                        codes: Array.from(collectedCodes),
                        total: collectedCodes.size
                      });
                      stopScanning();
                    }
                  }}
                  disabled={collectedCodes.size === 0}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: collectedCodes.size > 0 ? '#27ae60' : '#666',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: collectedCodes.size > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '14px'
                  }}
                >
                  ✓ סיום ({collectedCodes.size})
                </button>
                <button
                  onClick={() => {
                    scannedCodesRef.current.clear();
                    setCollectedCodes(new Set());
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid white',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  נקה
                </button>
              </div>
            )}

            {/* Corner frame decoration */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '180px',
              height: '180px',
              border: '2px solid rgba(201, 168, 108, 0.8)',
              borderRadius: '12px',
              pointerEvents: 'none'
            }} />
          </>
        )}
      </div>

      {/* Hidden canvas for QR processing */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {cameraError && (
        <div style={{
          background: '#ffebee',
          color: '#c62828',
          padding: '15px',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          {cameraError}
          <br />
          <button
            className="btn"
            onClick={() => window.location.reload()}
            style={{ marginTop: '10px', background: '#c62828', color: 'white' }}
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// Manual input as fallback
export function ManualQRInput({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code.trim());
      setCode("");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
      <div className="form-group">
        <label>או הכנס קוד ידנית:</label>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="הכנס קוד QR..."
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">
            אישור
          </button>
        </div>
      </div>
    </form>
  );
}
