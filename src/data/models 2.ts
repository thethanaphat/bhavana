export type PracticeType = 'sitting' | 'walking';
export type SessionStatus = 'completed' | 'stopped';
// 1 นาทีมีไว้ย่นรอบทดสอบเสียงตอนล็อกจอ iPhone ให้เหลือไม่กี่นาที
// ถ้ายืนยันผลแล้วและไม่ต้องการให้ผู้ใช้เห็น ให้ลบ `1 |` ออกจากบรรทัดล่าง แล้วลบ 1 ออกจาก bellIntervals ใน view และ guard ใน App
export type BellInterval = 0 | 1 | 5 | 10 | 15;
export type BackgroundSoundId = 'rain' | 'soft-tones';

export interface RunInterval {
  startedAt: string;
  endedAt: string;
}

export interface PracticeSession {
  id: string;
  type: PracticeType;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  plannedDurationSec: number | null;
  status: SessionStatus;
  bellIntervalMin: BellInterval;
  backgroundSoundId: BackgroundSoundId | null;
  runIntervals?: RunInterval[];
}

export interface ChantSession {
  id: string;
  prayerId: string;
  prayerTitleSnapshot: string;
  rounds: number | null;
  startedAt: string;
  endedAt: string;
  durationSec: number | null;
}

export interface CustomPrayer {
  id: string;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveSession {
  id: 'current';
  sessionId: string;
  type: PracticeType;
  startedAt: string;
  accumulatedPauseMs: number;
  pausedAt: string | null;
  plannedDurationSec: number | null;
  bellIntervalMin: BellInterval;
  backgroundSoundId: BackgroundSoundId | null;
  completedIntervals?: RunInterval[];
  runningSince?: string | null;
}

export interface PracticePreference {
  durationMin: number | null;
  customMinutes: number;
  bellIntervalMin: BellInterval;
  backgroundSoundId: BackgroundSoundId | null;
}

export interface Settings {
  id: 'main';
  sitting: PracticePreference;
  walking: PracticePreference;
  textScale: number;
  theme: 'system' | 'light' | 'dark';
}

export interface LegacyBaseline {
  id: 'sitting';
  sittingDurationSec: number;
  asOfDate: string;
  note: string;
}

export function defaultSettings(): Settings {
  return {
    id: 'main',
    sitting: { durationMin: 20, customMinutes: 25, bellIntervalMin: 0, backgroundSoundId: null },
    walking: { durationMin: 15, customMinutes: 25, bellIntervalMin: 0, backgroundSoundId: null },
    textScale: 1,
    theme: 'system',
  };
}
