export type PracticeType = 'sitting' | 'walking';
export type SessionStatus = 'completed' | 'stopped';
// 1 นาทีเริ่มจากใช้ทดสอบเสียงตอนล็อกจอ แล้วเก็บไว้ถาวร เพราะเหมาะกับผู้เริ่มฝึกที่อยากมีระฆังช่วยดึงสติถี่ ๆ
export type BellInterval = 0 | 1 | 5 | 10 | 15;
export type BackgroundSoundId = 'rain' | 'soft-tones';
// 'manual' = กรอกย้อนหลังเอง ไม่ได้จับเวลาจริง ใช้แยกป้ายในประวัติเท่านั้น สถิตินับเหมือนกัน
// เป็นฟิลด์ไม่บังคับ บันทึกเก่าและไฟล์สำรองเดิมจึงใช้ได้โดยไม่ต้อง migrate
export type RecordSource = 'manual';

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
  source?: RecordSource;
}

export interface ChantSession {
  id: string;
  prayerId: string;
  prayerTitleSnapshot: string;
  rounds: number | null;
  startedAt: string;
  endedAt: string;
  durationSec: number | null;
  source?: RecordSource;
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
