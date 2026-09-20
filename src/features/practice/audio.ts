import { audioAssetUrl, bellFiles, keepaliveFile, soundById } from '../../content/audio';
import type { BackgroundSoundId } from '../../data/models';

type BellKind = keyof typeof bellFiles;

export interface BellPlayback {
  playedMs: number;
  state: string;
}

export interface BellResult {
  ok: boolean;
  reason?: string;
  // วัดว่าหัวอ่านเดินหน้าไปจริงหรือไม่หลังสั่งเล่น เพราะ play() ที่ resolve สำเร็จ
  // ไม่ได้แปลว่ามีเสียงออกลำโพงบน iOS  ลอง webkitAudioDecodedByteCount แล้วพบว่า
  // Safari บนเครื่องจริงไม่มีค่านี้ให้ จึงใช้ currentTime ซึ่งมีทุกเบราว์เซอร์แทน
  verify: Promise<BellPlayback | null>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

export class PracticeAudio {
  private readonly background = new Audio();

  // iOS ปลดล็อกการเล่นเสียงเป็นราย element ไม่ใช่รายหน้าเว็บ
  // element ไหนไม่เคยถูก play() ในจังหวะที่ผู้ใช้แตะจริง จะถูกบล็อกไปตลอดอายุของหน้า
  // เดิมแยกระฆังเป็น 3 element ทำให้มีแต่ 'start' ที่ดัง เพราะมันเล่นตอนกดเริ่มฝึก
  // ส่วน interval กับ end ไม่เคยได้เล่นในจังหวะแตะเลย จึงเงียบสนิทแม้เปิดหน้าจอค้างไว้
  // ใช้ element เดียวแล้วสลับ src แทน ระฆังใบแรกจึงปลดล็อกให้ใบที่เหลือทั้งหมด
  private readonly bell = new Audio();

  // iOS ปล่อยให้ timer ของหน้าที่ถูกล็อกจอเดินต่อเฉพาะตอนที่หน้านั้นยังมีเสียงเล่นอยู่
  // รอบทดสอบที่ปิดเสียงพื้นหลังจึงเสียระฆังไปหลายใบ เพราะ tick มาช้า 15-27 วินาที
  // ตัวนี้เล่นโทน 40 Hz ที่ -70 dB ค้างไว้ตลอดช่วงฝึก เพื่อให้หน้าเว็บยังนับเป็น audible page
  private readonly keepalive = new Audio();
  private backgroundId: BackgroundSoundId | null = null;
  private keepaliveWanted = false;

  constructor() {
    this.background.loop = true;
    this.background.preload = 'none';
    this.bell.preload = 'auto';
    this.keepalive.loop = true;
    this.keepalive.preload = 'auto';
    this.keepalive.src = audioAssetUrl(keepaliveFile);
    // ดึงไฟล์ระฆังเข้า HTTP cache ล่วงหน้า เพราะ element เดียวจะ preload ได้ทีละไฟล์
    // ถ้าไม่ warm ไว้ ระฆังนาทีแรกอาจดังช้ากว่ากำหนดเพราะต้องรอโหลดก่อน
    for (const file of Object.values(bellFiles)) {
      void fetch(audioAssetUrl(file), { cache: 'force-cache' }).catch(() => { /* ออฟไลน์อยู่ก็ปล่อยให้ตอนเล่นจริงจัดการ */ });
    }
  }

  get isBackgroundPlaying(): boolean {
    return !this.background.paused && !this.background.ended;
  }

  get currentBackgroundId(): BackgroundSoundId | null {
    return this.backgroundId;
  }

  async playBell(kind: BellKind): Promise<BellResult> {
    const bell = this.bell;
    try {
      // ตั้ง src ใหม่ทุกครั้งแทนการ seek กลับไปที่ 0 ของไฟล์เดิม
      // บน iPhone จริงพบว่าระฆังใบที่ใช้เส้นทาง seek เป็นใบแรก (#2) เงียบซ้ำ ๆ หลายรอบ
      // ขณะที่ใบที่มาพร้อมการเปลี่ยน src (#1) ไม่เคยพลาดเลย การโหลดใหม่ทุกครั้ง
      // แพงกว่าเล็กน้อยแต่เริ่มจากต้นไฟล์เสมอ ไม่ต้องพึ่งว่า iOS จะยอม seek ให้หรือไม่
      bell.pause();
      bell.src = audioAssetUrl(bellFiles[kind]);
      bell.load();
      await bell.play();
      const verify = wait(1200).then<BellPlayback>(() => ({
        playedMs: Math.round(bell.currentTime * 1000),
        state: `readyState ${bell.readyState}${bell.paused ? ' หยุดอยู่' : ''}${bell.error ? ` error ${bell.error.code}` : ''}`,
      }));
      return { ok: true, verify };
    } catch (error) {
      // ห้ามกลืนเงียบ ๆ ชื่อ error คือเบาะแสเดียวที่บอกได้ว่าโดนบล็อกหรือไฟล์มีปัญหา
      return { ok: false, reason: error instanceof Error ? error.name : String(error), verify: Promise.resolve(null) };
    }
  }

  async playBackground(id: BackgroundSoundId, restart = false): Promise<boolean> {
    const sound = soundById(id);
    if (!sound) return false;
    try {
      if (this.backgroundId !== id) {
        this.background.pause();
        this.background.src = audioAssetUrl(sound.file);
        this.backgroundId = id;
        restart = true;
      }
      if (restart) {
        try { this.background.currentTime = 0; } catch { /* Media may not be loaded yet. */ }
      }
      await this.background.play();
      return true;
    } catch {
      return false;
    }
  }

  // แจ้งเมื่อเสียงค้ำถูกหยุดโดยที่แอปไม่ได้สั่ง เช่นสายเข้าหรือแอปอื่นแย่งช่องเสียงไป
  // ถ้าตัวค้ำดับ หน้าเว็บจะกลับไปเงียบและ timer จะถูกระงับทันทีโดยไม่มีอะไรบอก
  onKeepaliveInterrupted(listener: (playing: boolean) => void): void {
    this.keepalive.addEventListener('pause', () => { if (this.keepaliveWanted) listener(false); });
    this.keepalive.addEventListener('play', () => { if (this.keepaliveWanted) listener(true); });
  }

  // ต้องเรียกในจังหวะที่ผู้ใช้แตะจริง ไม่งั้น iOS จะบล็อก element นี้ไปตลอด
  startKeepalive(): void {
    this.keepaliveWanted = true;
    void this.keepalive.play().catch(() => { /* บล็อกก็ยังฝึกต่อได้ แค่เสียความแม่นยำตอนล็อกจอ */ });
  }

  stopKeepalive(): void {
    this.keepaliveWanted = false;
    this.keepalive.pause();
  }

  // ระฆังจบยาว 4.8 วินาที ถ้าดับตัวค้ำทันทีที่สั่งเล่น audio session อาจถูกปิด
  // แล้วตัดระฆังขาดกลางคัน โดยเฉพาะตอนล็อกจอ จึงรอให้ระฆังจบก่อนค่อยดับ
  stopKeepaliveAfterBell(): void {
    this.keepaliveWanted = false;
    const stop = (): void => { this.keepalive.pause(); };
    // กันเหนียวไว้เผื่อ 'ended' ไม่มา เช่นระฆังเล่นไม่ออกตั้งแต่แรก
    const fallback = window.setTimeout(stop, 7000);
    this.bell.addEventListener('ended', () => { window.clearTimeout(fallback); stop(); }, { once: true });
  }

  get isKeepaliveRunning(): boolean {
    return !this.keepalive.paused;
  }

  pauseBackground(): void {
    this.background.pause();
  }

  stopBackground(): void {
    this.background.pause();
    try { this.background.currentTime = 0; } catch { /* No media data loaded yet. */ }
  }
}
