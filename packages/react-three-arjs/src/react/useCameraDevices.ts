import { useEffect, useState } from 'react';
import { listCameraDevices } from '../core/source/source';

/**
 * The cameras available for `<ARCanvas source={{ type: 'webcam', deviceId }}>`,
 * kept up to date when devices are plugged in or out. Labels are empty until
 * the user has granted camera permission once (AR.js issue #26).
 */
export function useCameraDevices(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      listCameraDevices().then(
        (list) => active && setDevices(list),
        () => active && setDevices([]),
      );
    };
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);
  return devices;
}
