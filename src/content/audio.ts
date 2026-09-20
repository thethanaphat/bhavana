import type { BackgroundSoundId } from '../data/models';

export interface BackgroundSound {
  id: BackgroundSoundId;
  title: string;
  description: string;
  file: string;
}

export const backgroundSounds: BackgroundSound[] = [
  { id: 'rain', title: 'ฝนเบา', description: 'เสียงฝนต่อเนื่อง', file: 'ambience/rain.m4a' },
  { id: 'soft-tones', title: 'เสียงบรรเลงเบา', description: 'ทำนองโน้ตช้า ๆ', file: 'ambience/soft-tones.m4a' },
];

// สตรีมเงียบสำหรับค้ำ audio session ของ iOS ไม่ใช่เสียงบรรยากาศให้ผู้ใช้เลือก
export const keepaliveFile = 'ambience/keepalive.m4a';

export const bellFiles = {
  start: 'bells/start.m4a',
  interval: 'bells/interval.m4a',
  end: 'bells/end.m4a',
} as const;

export function soundById(id: BackgroundSoundId | null): BackgroundSound | undefined {
  return backgroundSounds.find((sound) => sound.id === id);
}

// เสียงบทสวดอยู่ใต้ audio/prayers/ แยกจากระฆังและเสียงบรรยากาศ
// รับ URL เต็มได้ด้วย เพื่อให้วันที่ย้ายไฟล์ไป object storage เช่น Cloudflare R2
// แก้แค่ catalog.json ใส่ URL เต็มลงไป ไม่ต้องแตะโค้ดหน้าจอสักบรรทัด
export function prayerAudioUrl(file: string): string {
  if (/^https?:\/\//i.test(file)) return file;
  return `${import.meta.env.BASE_URL}audio/prayers/${encodeURIComponent(file)}`;
}

export function audioAssetUrl(file: string): string {
  const version = file.startsWith('ambience/') ? '?v=2' : '';
  return `${import.meta.env.BASE_URL}audio/${file}${version}`;
}
