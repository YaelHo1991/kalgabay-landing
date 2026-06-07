import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QRGeneratorProps {
  value: string;
  size?: number;
}

export function QRGenerator({ value, size = 128 }: QRGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    }
  }, [value, size]);

  return <canvas ref={canvasRef} />;
}

export async function generateQRDataUrl(
  value: string,
  size: number = 200
): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    return dataUrl;
  } catch (error) {
    console.error("Error generating QR code:", error);
    return "";
  }
}

export default QRGenerator;
