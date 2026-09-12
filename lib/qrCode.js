import QRCode from 'qrcode';

/**
 * generateQrSvg — Generates a cyberpunk-themed SVG QR code string.
 * @param {string} text - URL or pairing payload
 * @param {Object} options - color and sizing overrides
 * @returns {Promise<string>} Clean SVG string
 */
export async function generateQrSvg(text, options = {}) {
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: options.dark || '#FFB800',      // Neon Cyan QR modules
        light: options.light || '#0A0B10',    // Carbon dark background
      },
      width: options.width || 240,
    });
    return svg;
  } catch (err) {
    console.error('[generateQrSvg] Error generating QR code:', err);
    return null;
  }
}

/**
 * generateQrDataUrl — Generates a data URL PNG for image tags.
 */
export async function generateQrDataUrl(text, options = {}) {
  try {
    return await QRCode.toDataURL(text, {
      margin: options.margin !== undefined ? options.margin : 1,
      color: {
        dark: options.dark || '#FFB800',
        light: options.light || '#0A0B10',
      },
      width: options.width || 240,
    });
  } catch (err) {
    console.error('[generateQrDataUrl] Error generating QR data URL:', err);
    return null;
  }
}

