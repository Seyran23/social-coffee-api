import QRCode from 'qrcode';

interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: {
    dark?: string;
    light?: string;
  };
}

const DEFAULT_QR_OPTIONS: QRCodeOptions = {
  width: 400,
  margin: 2,
  errorCorrectionLevel: 'M',
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
};

export async function generateQRCodeDataURL(
  data: string,
  options: QRCodeOptions = {},
): Promise<string> {
  try {
    const mergedOptions = { ...DEFAULT_QR_OPTIONS, ...options };

    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      type: 'image/png',
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      color: mergedOptions.color,
    });
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Generate QR code as SVG string
 * Best for: Vector graphics, scalable displays, print materials
 * @param data - Data to encode
 * @param options - QR code generation options
 * @returns SVG string
 */
export async function generateQRCodeSVG(
  data: string,
  options: QRCodeOptions = {},
): Promise<string> {
  try {
    const mergedOptions = { ...DEFAULT_QR_OPTIONS, ...options };

    return await QRCode.toString(data, {
      type: 'svg',
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      color: mergedOptions.color,
    });
  } catch (error) {
    throw new Error(`Failed to generate QR code SVG: ${error.message}`);
  }
}
