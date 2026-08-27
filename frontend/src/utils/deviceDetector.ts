export interface DeviceInfo {
  label: string;
  os: string;
  type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { label: 'Desktop PC', os: 'Desktop', type: 'desktop', browser: 'Browser' };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;
  const screenWidth = window.innerWidth || (typeof screen !== 'undefined' ? screen.width : 1024);

  // Browser detection
  let browser = 'Chrome';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/OPR|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';

  // OS & Device Type detection
  let os = 'Windows';
  let type: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  let deviceName = 'Windows Desktop';

  if (/Android/i.test(ua)) {
    os = 'Android';
    if (/Tablet|Nexus 7|Nexus 10/i.test(ua) || (maxTouch > 0 && screenWidth >= 768)) {
      type = 'tablet';
      deviceName = 'Android Tablet';
    } else {
      type = 'mobile';
      deviceName = 'Android Phone';
    }
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS';
    type = 'mobile';
    deviceName = 'iPhone';
  } else if (/iPad/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1)) {
    os = 'iOS';
    type = 'tablet';
    deviceName = 'iPad';
  } else if (/Macintosh|MacIntel|MacPPC|Mac68K/i.test(ua) || platform.startsWith('Mac')) {
    os = 'macOS';
    type = 'desktop';
    deviceName = 'MacBook';
  } else if (/Win32|Win64|Windows|WinCE/i.test(ua) || platform.startsWith('Win')) {
    os = 'Windows';
    type = 'desktop';
    const isTouch = maxTouch > 0;
    const isSmallScreen = screenWidth <= 1600;
    deviceName = isTouch ? 'Windows Laptop' : (isSmallScreen ? 'Windows Laptop' : 'Windows Desktop');
  } else if (/Linux/i.test(ua) || platform.startsWith('Linux')) {
    if (/CrOS/i.test(ua)) {
      os = 'Chrome OS';
      type = 'desktop';
      deviceName = 'Chromebook';
    } else {
      os = 'Linux';
      type = 'desktop';
      deviceName = 'Linux PC';
    }
  }

  // Refine label if browser is explicitly relevant
  let finalLabel = deviceName;
  if (browser && os === 'Windows' && deviceName === 'Windows Desktop') {
    finalLabel = `${browser} on Windows`;
  }

  return {
    label: finalLabel,
    os,
    type,
    browser
  };
}
