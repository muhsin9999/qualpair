import { FirebaseCloudReader } from './cloud';
import { FirebaseDeviceReader } from './device';
import { PracticeCloudReader, PracticeDeviceReader } from './practice';
import type { CloudReader, DeviceReader } from './readers';

const KEY = 'qualcheck.practiceReaders';

/** Practice readers are on when the URL has ?practice or the user turned them on in settings. */
export function practiceMode(): boolean {
  try {
    if (new URLSearchParams(location.search).has('practice')) localStorage.setItem(KEY, '1');
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
