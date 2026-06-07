/**
 * Platform Detection Module
 * Detects whether the app is running on desktop or mobile
 */

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

let cachedPlatform: Platform | null = null;

/**
 * Get the current platform
 * Uses Tauri's os plugin when available, falls back to user agent detection
 */
export async function getPlatform(): Promise<Platform> {
  if (cachedPlatform) return cachedPlatform;

  try {
    // Try to use Tauri's os plugin
    const { platform } = await import('@tauri-apps/plugin-os');
    const p = await platform();
    cachedPlatform = p as Platform;
  } catch {
    // Fallback: detect from user agent (for dev/web mode)
    cachedPlatform = detectPlatformFromUserAgent();
  }

  return cachedPlatform;
}

/**
 * Synchronous check if platform is mobile
 * Note: Call getPlatform() first to initialize
 */
export function isMobile(): boolean {
  return cachedPlatform === 'android' || cachedPlatform === 'ios';
}

/**
 * Synchronous check if platform is desktop
 * Note: Call getPlatform() first to initialize
 */
export function isDesktop(): boolean {
  return cachedPlatform === 'windows' || cachedPlatform === 'macos' || cachedPlatform === 'linux';
}

/**
 * Check if running on Android specifically
 */
export function isAndroid(): boolean {
  return cachedPlatform === 'android';
}

/**
 * Check if running on Windows specifically
 */
export function isWindows(): boolean {
  return cachedPlatform === 'windows';
}

/**
 * Fallback detection using user agent
 */
function detectPlatformFromUserAgent(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';

  return 'unknown';
}

/**
 * Get cached platform synchronously (returns null if not initialized)
 */
export function getCachedPlatform(): Platform | null {
  return cachedPlatform;
}

/**
 * Force re-detection of platform
 */
export async function refreshPlatform(): Promise<Platform> {
  cachedPlatform = null;
  return getPlatform();
}
