import { FirebaseCloudReader } from './cloud';
import { FirebaseDeviceReader } from './device';
import { PracticeCloudReader, PracticeDeviceReader } from './practice';
import type { CloudReader, DeviceReader } from './readers';

const KEY = 'qualcheck.practiceReaders';

/** Practice readers are on when the URL has ?practice or the user turned them on in settings. */
export function practiceMode(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('practice');
    if (q !== null) {
      // ?practice turns practice readers on; ?practice=0 (or off / false) turns them off again.
      if (/^(0|off|false|no)$/i.test(q)) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, '1');
    }
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPracticeMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: practice mode simply stays off */
  }
}

let device: DeviceReader | null = null;
let cloud: CloudReader | null = null;

export function getDeviceReader(): DeviceReader {
  if (!device) device = practiceMode() ? new PracticeDeviceReader() : new FirebaseDeviceReader();
  return device;
}

export function getCloudReader(): CloudReader {
  if (!cloud) cloud = practiceMode() ? new PracticeCloudReader() : new FirebaseCloudReader();
  return cloud;
}

/** For tests. */
export function setReaders(d: DeviceReader, c: CloudReader) {
  device = d;
  cloud = c;
}
