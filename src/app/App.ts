import { icon } from './icons';
import { loadSettings, saveSettings } from '../data/db';
import { defaultSettings, type ActiveSession, type BackgroundSoundId, type BellInterval, type ChantSession, type CustomPrayer, type LegacyBaseline, type PracticeSession, type PracticeType, type Settings } from '../data/models';
import { discardPracticeSession, finishPracticeSession, getActiveSession, listPracticeSessions, pausePracticeSession, resumePracticeSession, startPracticeSession } from '../data/practiceRepository';
import { addChantSession, deleteCustomPrayer, listChantSessions, listCustomPrayers, saveCustomPrayer } from '../data/prayerRepository';
import { deleteLegacyBaseline, getLegacyBaseline, saveLegacyBaseline } from '../data/recordsRepository';
import { renderActiveTimer, renderCompletedSession, renderDurationPicker, renderPracticeHome, renderReadyScreen } from '../features/practice/view';
import { elapsedMs, formatClock, isDue, remainingMs } from '../features/practice/timer';
import { PracticeAudio } from '../features/practice/audio';
import { bellLatenessLimitMs, intervalBellIndex, intervalBellResult } from '../features/practice/bells';
import { prayerAudioUrl } from '../content/audio';
import { downloadJson } from './html';
import { backupFileName, readBackup } from '../data/backup';
import { clearHistory, collectBackup, restoreBackup } from '../data/backupRepository';
import { adoptPendingBellLog, appendBellLog, bellLogForSession, formatBellLog, patchBellLog, PENDING, type BellKind } from '../features/practice/bellLog';
import { findPrayer } from '../content/prayers';
import { renderCustomPrayerForm, renderPrayerDetail, renderPrayerList, type PrayerEntry } from '../features/prayers/view';
import { renderRecords, type HistoryFilter } from '../features/records/view';
import { buildRecordStats, type StatsPeriod } from '../features/records/stats';

type Tab = 'practice' | 'prayers' | 'records';
type Route = { tab: Tab; page: 'home' | 'picker' | 'ready' | 'session' | 'completed' | 'detail' | 'new' | 'edit'; type?: PracticeType; prayerId?: string; custom?: boolean };

function routeFromHash(): Route {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'prayers') {
    if (parts[1] === 'new') return { tab: 'prayers', page: 'new' };
    if (parts[1] === 'custom' && parts[2]) {
      return { tab: 'prayers', page: parts[3] === 'edit' ? 'edit' : 'detail', prayerId: parts[2], custom: true };
    }
    return parts[1] ? { tab: 'prayers', page: 'detail', prayerId: parts[1] } : { tab: 'prayers', page: 'home' };
  }
  if (parts[0] === 'records') return { tab: 'records', page: 'home' };
  if (parts[0] === 'practice' && parts[1] === 'session') return { tab: 'practice', page: 'session' };
  if (parts[0] === 'practice' && parts[1] === 'completed') return { tab: 'practice', page: 'completed' };
  if (parts[0] === 'practice' && parts[1] === 'ready' && (parts[2] === 'sitting' || parts[2] === 'walking')) {
    return { tab: 'practice', page: 'ready', type: parts[2] };
  }
  if (parts[0] === 'practice' && (parts[1] === 'sitting' || parts[1] === 'walking')) {
    return { tab: 'practice', page: 'picker', type: parts[1] };
  }
  return { tab: 'practice', page: 'home' };
}

function navItem(tab: Tab, current: Tab, label: string, iconName: 'lotus' | 'book' | 'chart'): string {
  const active = current === tab;
  return `<a class="nav-item ${active ? 'active' : ''}" href="#/${tab}" ${active ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`;
}

function todaySummary(sessions: PracticeSession[]): { count: number; durationSec: number } {
  const today = buildRecordStats(sessions, [], null, 'today');
  return {
    count: today.sitting.count + today.walking.count,
    durationSec: today.sitting.durationSec + today.walking.durationSec,
  };
}

export class App {
  private settings: Settings = defaultSettings();
  private active: ActiveSession | null = null;
  private sessions: PracticeSession[] = [];
  private customPrayers: CustomPrayer[] = [];
  private chants: ChantSession[] = [];
  private baseline: LegacyBaseline | null = null;
  private statsPeriod: StatsPeriod = 'today';
  private historyFilter: HistoryFilter = 'all';
  private historyVisibleCount = 20;
  private audioStates = new Map<string, 'checking' | 'available' | 'missing'>();
  private readonly practiceAudio = new PracticeAudio();
  private audioMessage: string | null = null;
  private bellCursor: { sessionId: string; index: number } | null = null;
  private savedPrayerId: string | null = null;
  private lastFinished: PracticeSession | null = null;
  private recovered = false;
  private storageIssue = false;
  private settingsOpen = false;
  private dataMessage: { tone: 'ok' | 'error'; text: string } | null = null;
  private busy = false;
  private started = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly root: HTMLElement) {
    this.root.addEventListener('click', (event) => void this.onClick(event));
    this.root.addEventListener('change', (event) => void this.onChange(event));
    this.root.addEventListener('submit', (event) => void this.onSubmit(event));
    window.addEventListener('hashchange', () => { this.savedPrayerId = null; this.render(); });
    window.addEventListener('pageshow', () => { if (this.started) void this.refreshFromDatabase(); });
    document.addEventListener('visibilitychange', () => {
      if (this.started && document.visibilityState === 'visible') void this.refreshFromDatabase();
    });
  }

  async start(): Promise<void> {
    try {
      [this.settings, this.active, this.sessions, this.customPrayers, this.chants, this.baseline] = await Promise.all([
        loadSettings(), getActiveSession(), listPracticeSessions(), listCustomPrayers(), listChantSessions(), getLegacyBaseline(),
      ]);
      this.recovered = this.active !== null;
      this.syncBellCursor();
    } catch (error) {
      this.onDataError(error);
    }
    this.started = true;
    if (this.active && routeFromHash().tab === 'practice' && routeFromHash().page === 'home') {
      location.hash = '#/practice/session';
    }
    this.render();
    this.practiceAudio.onKeepaliveInterrupted((playing) => {
      if (!this.active) return;
      appendBellLog({
        sessionId: this.active.sessionId, kind: 'keepalive', index: null,
        atIso: new Date().toISOString(), latenessMs: 0,
        outcome: playing ? 'recovered' : 'interrupted',
      });
    });
    window.setInterval(() => void this.tick(), 1000);
    void this.tick();
  }

  private render(): void {
    const route = routeFromHash();
    let content: string;
    if (route.tab === 'practice' && route.page === 'picker' && route.type) {
      content = renderDurationPicker(route.type, this.settings[route.type], this.active !== null, !this.storageIssue);
    } else if (route.tab === 'practice' && route.page === 'ready' && route.type) {
      content = renderReadyScreen(route.type, this.settings[route.type], this.active !== null, !this.storageIssue);
    } else if (route.tab === 'practice' && route.page === 'session' && this.active) {
      content = renderActiveTimer(this.active, this.recovered, this.practiceAudio.isBackgroundPlaying, this.audioMessage);
    } else if (route.tab === 'practice' && route.page === 'completed' && this.lastFinished) {
      content = renderCompletedSession(this.lastFinished, formatBellLog(bellLogForSession(this.lastFinished.id)));
    } else if (route.tab === 'prayers' && (route.page === 'new' || route.page === 'edit')) {
      const editPrayer = route.page === 'edit' ? this.customPrayers.find((item) => item.id === route.prayerId) ?? null : null;
      content = route.page === 'edit' && !editPrayer
        ? renderPrayerDetail(null, this.settings.textScale, 'missing', false)
        : renderCustomPrayerForm(editPrayer);
    } else if (route.tab === 'prayers' && route.page === 'detail' && route.prayerId) {
      const prayer = this.prayerForRoute(route);
      content = renderPrayerDetail(prayer, this.settings.textScale, prayer?.audioFile ? this.audioStates.get(prayer.id) ?? 'checking' : 'missing', this.savedPrayerId === prayer?.id);
      if (prayer?.audioFile && !this.audioStates.has(prayer.id)) void this.checkPrayerAudio(prayer);
    } else if (route.tab === 'prayers') {
      content = renderPrayerList(this.customPrayers);
    } else if (route.tab === 'records') {
      content = renderRecords(this.sessions, this.chants, this.baseline, this.statsPeriod, this.historyFilter, this.historyVisibleCount);
    } else {
      content = renderPracticeHome(this.settings, this.active, todaySummary(this.sessions));
    }

    const title = route.tab === 'prayers' ? 'บทสวด' : route.tab === 'records' ? 'บันทึก' : 'ฝึก';
    document.title = `${title} · Mindful Practice`;
    this.root.querySelector<HTMLAudioElement>('#prayer-audio')?.pause();
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="app-header">
          <a class="brand" href="#/practice" aria-label="Mindful Practice หน้าฝึก"><span class="brand-mark">${icon('lotus')}</span><span><strong>Mindful</strong><small>Practice</small></span></a>
          <button class="header-action" type="button" data-action="settings" aria-label="ข้อมูลและตั้งค่า">${icon('settings')}</button>
        </header>
        ${this.storageIssue ? `<div class="storage-warning" role="alert">เครื่องนี้ไม่สามารถบันทึกข้อมูลในเครื่องได้ โปรดลองเปิดแอปใหม่อีกครั้ง</div>` : ''}
        <main id="main-content" class="main-content">${content}</main>
        <nav class="bottom-nav" aria-label="เมนูหลัก">
          ${navItem('practice', route.tab, 'ฝึก', 'lotus')}
          ${navItem('prayers', route.tab, 'บทสวด', 'book')}
          ${navItem('records', route.tab, 'บันทึก', 'chart')}
        </nav>
      </div>
      <dialog class="info-dialog" aria-labelledby="info-title">
        <div class="dialog-head"><span class="eyebrow">Mindful Practice</span><button type="button" data-action="close-settings" aria-label="ปิด">${icon('close')}</button></div>
        <h2 id="info-title">พื้นที่ส่วนตัวของคุณ</h2>
        <p>ไม่ต้องลงทะเบียนหรือกรอกข้อมูลส่วนตัว การตั้งค่าและบันทึกการฝึกจะอยู่บนอุปกรณ์เครื่องนี้</p>
        <div class="dialog-note">เพิ่มแอปไปที่หน้าจอโฮมของ iPhone ได้จากเมนูแชร์ใน Safari</div>
        <div class="data-tools">
          <h3>ข้อมูลของคุณ</h3>
          <p>ข้อมูลผูกกับที่อยู่เว็บที่ใช้เปิดแอป ถ้าย้ายไปเปิดจากที่อยู่อื่นต้องส่งออกแล้วนำเข้ากลับ</p>
          <button type="button" data-action="export-data">ส่งออกเป็นไฟล์ JSON</button>
          <label class="data-import">
            <span>นำเข้าจากไฟล์สำรอง</span>
            <input type="file" id="import-file" accept="application/json,.json" />
          </label>
          <button type="button" class="danger" data-action="clear-history">ล้างประวัติการฝึกทั้งหมด</button>
          ${this.dataMessage ? `<p class="data-message ${this.dataMessage.tone}" role="status">${this.dataMessage.text}</p>` : ''}
        </div>
      </dialog>
    `;

    const dialog = this.root.querySelector<HTMLDialogElement>('dialog.info-dialog');
    dialog?.addEventListener('close', () => { this.settingsOpen = false; });
    if (this.settingsOpen) dialog?.showModal();
  }

  private async onClick(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'settings') {
      this.settingsOpen = true;
      this.render();
      return;
    }
    if (action === 'export-data' || action === 'clear-history') {
      await this.handleDataAction(action);
      return;
    }
    if (action === 'close-settings') {
      this.root.querySelector<HTMLDialogElement>('dialog.info-dialog')?.close();
      return;
    }

    if (this.busy) return;
    const route = routeFromHash();
    if (route.tab === 'prayers') {
      if (action === 'font-decrease' || action === 'font-increase') {
        const change = action === 'font-increase' ? 0.1 : -0.1;
        this.settings.textScale = Math.max(0.9, Math.min(1.4, Math.round((this.settings.textScale + change) * 10) / 10));
        this.root.querySelector<HTMLElement>('#prayer-text')?.style.setProperty('--text-scale', String(this.settings.textScale));
        this.root.querySelector<HTMLButtonElement>('[data-action="font-decrease"]')!.disabled = this.settings.textScale <= 0.9;
        this.root.querySelector<HTMLButtonElement>('[data-action="font-increase"]')!.disabled = this.settings.textScale >= 1.4;
        await this.persistSettings();
      } else if (action === 'restart-audio') {
        const audio = this.root.querySelector<HTMLAudioElement>('#prayer-audio');
        if (audio) {
          audio.currentTime = 0;
          try { await audio.play(); } catch { /* Safari may refuse playback after interruption. Native controls remain available. */ }
        }
      } else if (action === 'delete-prayer' && route.custom && route.prayerId) {
        if (!window.confirm('ลบบทสวดส่วนตัวนี้ใช่ไหม? บันทึกการสวดเดิมจะยังอยู่')) return;
        await this.runSessionAction(async () => {
          await deleteCustomPrayer(route.prayerId!);
          this.customPrayers = await listCustomPrayers();
          location.hash = '#/prayers';
          this.render();
        });
      }
      return;
    }
    if (route.tab === 'records') {
      if (action === 'records-period') {
        const period = button.dataset.value;
        if (period === 'today' || period === 'week' || period === 'month' || period === 'all') {
          this.statsPeriod = period;
          this.render();
        }
      } else if (action === 'history-filter') {
        const filter = button.dataset.value;
        if (filter === 'all' || filter === 'sitting' || filter === 'walking' || filter === 'chanting') {
          this.historyFilter = filter;
          this.historyVisibleCount = 20;
          this.render();
        }
      } else if (action === 'history-more') {
        this.historyVisibleCount += 20;
        this.render();
      } else if (action === 'delete-legacy' && this.baseline) {
        if (!window.confirm('ลบเฉพาะยอดนั่งสมาธิที่นำมาจากแอปเดิมใช่ไหม? ประวัติที่ฝึกในแอปนี้จะยังอยู่')) return;
        await this.runSessionAction(async () => {
          await deleteLegacyBaseline();
          this.baseline = null;
          this.render();
        });
      }
      return;
    }
    if (route.tab !== 'practice') return;
    if (route.page === 'picker' && route.type) {
      if (action === 'start') {
        location.hash = this.active ? '#/practice/session' : `#/practice/ready/${route.type}`;
        return;
      }
      const value = button.dataset.value;
      if (action === 'duration') {
        const minutes = value === 'open' ? null : Number(value);
        if (minutes !== null && ![10, 15, 20, 30, 45, 60, 90].includes(minutes)) return;
        this.settings[route.type].durationMin = minutes;
      } else if (action === 'custom') {
        this.settings[route.type].durationMin = this.settings[route.type].customMinutes;
      } else if (action === 'bell') {
        const interval = Number(value);
        if (![0, 1, 5, 10, 15].includes(interval)) return;
        this.settings[route.type].bellIntervalMin = interval as BellInterval;
      } else if (action === 'background') {
        if (value !== 'off' && value !== 'rain' && value !== 'soft-tones') return;
        this.settings[route.type].backgroundSoundId = value === 'off' ? null : value as BackgroundSoundId;
      } else {
        return;
      }
      this.render();
      await this.persistSettings();
      return;
    }

    if (route.page === 'ready' && route.type && action === 'begin-session') {
      if (this.storageIssue) return;
      if (this.active) {
        location.hash = '#/practice/session';
        return;
      }
      const preference = this.settings[route.type];
      this.audioMessage = null;
      // เรียกในจังหวะแตะเดียวกับระฆังเริ่ม เพื่อให้ iOS ปลดล็อก element นี้ด้วย
      this.practiceAudio.startKeepalive();
      void this.ringBell('start').then(() => {
        if (this.active) adoptPendingBellLog(this.active.sessionId);
      });
      const backgroundPromise = preference.backgroundSoundId
        ? this.practiceAudio.playBackground(preference.backgroundSoundId, true)
        : null;
      await this.runSessionAction(async () => {
        this.active = await startPracticeSession(route.type!, preference);
        adoptPendingBellLog(this.active.sessionId);
        this.bellCursor = { sessionId: this.active.sessionId, index: 0 };
        this.recovered = false;
        location.hash = '#/practice/session';
        this.render();
      });
      if (!this.active) this.practiceAudio.stopBackground();
      if (backgroundPromise && !await backgroundPromise && this.active) {
        this.audioMessage = 'เปิดเสียงพื้นหลังไม่ได้ ลองแตะเปิดเสียงอีกครั้ง';
        this.render();
      }
      return;
    }

    if (route.page !== 'session' || !this.active) return;
    const sessionId = this.active.sessionId;
    if (action === 'toggle-background' && this.active.backgroundSoundId && !this.active.pausedAt) {
      if (this.practiceAudio.isBackgroundPlaying) {
        this.practiceAudio.pauseBackground();
        this.audioMessage = null;
      } else {
        const played = await this.practiceAudio.playBackground(this.active.backgroundSoundId);
        this.audioMessage = played ? null : 'เปิดเสียงพื้นหลังไม่ได้ ลองแตะเปิดเสียงอีกครั้ง';
      }
      this.render();
      return;
    }
    if (action === 'discard-session' && !window.confirm('ยกเลิกช่วงฝึกนี้โดยไม่บันทึกใช่ไหม?')) return;
    if (!['pause-session', 'resume-session', 'finish-session', 'discard-session'].includes(action ?? '')) return;
    if (action === 'pause-session') {
      this.practiceAudio.pauseBackground();
      this.practiceAudio.stopKeepalive();
      this.audioMessage = null;
    }
    if (action === 'resume-session') {
      this.audioMessage = null;
      this.practiceAudio.startKeepalive();
    }
    const resumeBackground = action === 'resume-session' && this.active.backgroundSoundId
      ? this.practiceAudio.playBackground(this.active.backgroundSoundId)
      : null;
    await this.runSessionAction(async () => {
      if (action === 'pause-session') {
        this.active = await pausePracticeSession(sessionId);
      } else if (action === 'resume-session') {
        this.active = await resumePracticeSession(sessionId);
      } else if (action === 'finish-session') {
        await this.finish(sessionId, 'user');
        return;
      } else if (action === 'discard-session') {
        this.practiceAudio.stopBackground();
        this.practiceAudio.stopKeepalive();
        await discardPracticeSession(sessionId);
        this.active = null;
        this.bellCursor = null;
        this.recovered = false;
        location.hash = '#/practice';
      }
      this.recovered = false;
      this.render();
    });
    if (resumeBackground && !await resumeBackground && this.active) {
      this.audioMessage = 'เปิดเสียงพื้นหลังไม่ได้ ลองแตะเปิดเสียงอีกครั้ง';
      this.render();
    }
  }

  private async onChange(event: Event): Promise<void> {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id === 'import-file') {
      const file = target.files?.[0];
      target.value = '';
      if (file) await this.importFromFile(file);
      return;
    }
    if (!(target instanceof HTMLInputElement) || target.id !== 'custom-minutes') return;
    const route = routeFromHash();
    if (route.tab !== 'practice' || route.page !== 'picker' || !route.type) return;
    const minutes = Number(target.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
      target.setCustomValidity('กรุณาใส่จำนวนเต็ม 1–720 นาที');
      target.reportValidity();
      return;
    }
    target.setCustomValidity('');
    this.settings[route.type].customMinutes = minutes;
    this.settings[route.type].durationMin = minutes;
    this.render();
    await this.persistSettings();
  }

  private async onSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== 'chant-form' && form.id !== 'custom-prayer-form' && form.id !== 'legacy-form') return;
    event.preventDefault();
    if (this.busy || this.storageIssue) return;
    const values = new FormData(form);
    if (form.id === 'legacy-form') {
      const hours = Number(values.get('hours'));
      const minutes = Number(values.get('minutes'));
      const asOfDate = String(values.get('asOfDate') ?? '');
      const note = String(values.get('note') ?? '').trim();
      if (!Number.isInteger(hours) || hours < 0 || hours > 99999 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || note.length > 200) return;
      await this.runSessionAction(async () => {
        this.baseline = await saveLegacyBaseline(hours, minutes, asOfDate, note);
        this.render();
      });
      return;
    }
    if (form.id === 'custom-prayer-form') {
      const title = String(values.get('title') ?? '').trim();
      const text = String(values.get('text') ?? '').trim();
      if (!title || !text) return;
      await this.runSessionAction(async () => {
        const saved = await saveCustomPrayer(title, text, form.dataset.id || undefined);
        this.customPrayers = await listCustomPrayers();
        location.hash = `#/prayers/custom/${encodeURIComponent(saved.id)}`;
        this.render();
      });
      return;
    }
    const route = routeFromHash();
    const prayer = this.prayerForRoute(route);
    if (!prayer || prayer.id !== form.dataset.prayerId) return;
    const roundsText = String(values.get('rounds') ?? '').trim();
    const durationText = String(values.get('durationMin') ?? '').trim();
    const rounds = roundsText ? Number(roundsText) : null;
    const durationMin = durationText ? Number(durationText) : null;
    if ((rounds !== null && (!Number.isInteger(rounds) || rounds < 1 || rounds > 9999)) ||
        (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 720))) return;
    await this.runSessionAction(async () => {
      const item = await addChantSession(prayer.id, prayer.title, rounds, durationMin);
      this.chants = [item, ...this.chants];
      this.savedPrayerId = prayer.id;
      this.render();
    });
  }

  private prayerForRoute(route: Route): PrayerEntry | null {
    if (route.tab !== 'prayers' || route.page !== 'detail' || !route.prayerId) return null;
    if (route.custom) {
      const prayer = this.customPrayers.find((item) => item.id === route.prayerId);
      return prayer ? { id: prayer.id, title: prayer.title, text: prayer.text, custom: true } : null;
    }
    const prayer = findPrayer(route.prayerId);
    return prayer ? { id: prayer.id, title: prayer.title, text: prayer.text, audioFile: prayer.audioFile, custom: false } : null;
  }

  private async checkPrayerAudio(prayer: PrayerEntry): Promise<void> {
    if (!prayer.audioFile) return;
    this.audioStates.set(prayer.id, 'checking');
    let available = false;
    try {
      const url = prayerAudioUrl(prayer.audioFile);
      const response = await fetch(url, { method: 'HEAD' });
      available = response.ok && /^(audio\/|video\/mp4|application\/octet-stream)/i.test(response.headers.get('content-type') ?? '');
    } catch { /* Audio is optional and may be unavailable offline. */ }
    this.audioStates.set(prayer.id, available ? 'available' : 'missing');
    const route = routeFromHash();
    if (route.tab === 'prayers' && route.page === 'detail' && route.prayerId === prayer.id) this.render();
  }

  private async handleDataAction(action: 'export-data' | 'clear-history'): Promise<void> {
    try {
      if (action === 'export-data') {
        const nowIso = new Date().toISOString();
        const backup = await collectBackup(nowIso);
        downloadJson(backup, backupFileName(nowIso));
        const total = backup.practiceSessions.length + backup.chantSessions.length;
        this.dataMessage = { tone: 'ok', text: `ส่งออกแล้ว ${total} รายการ เก็บไฟล์ไว้ให้ดี เพราะไม่มีบัญชีสำหรับกู้คืน` };
      } else {
        const counts = `การฝึก ${this.sessions.length} · การสวด ${this.chants.length}`;
        if (!window.confirm(`ล้างประวัติทั้งหมด (${counts}) และยอดสะสมเดิมใช่ไหม? บทสวดส่วนตัวและการตั้งค่าจะยังอยู่ การล้างนี้ย้อนกลับไม่ได้`)) return;
        await clearHistory();
        this.active = null;
        this.bellCursor = null;
        this.lastFinished = null;
        [this.sessions, this.chants, this.baseline] = [[], [], null];
        this.dataMessage = { tone: 'ok', text: 'ล้างประวัติแล้ว' };
      }
    } catch (error) {
      this.dataMessage = { tone: 'error', text: `ทำไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}` };
    }
    this.render();
  }

  private async importFromFile(file: File): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      this.dataMessage = { tone: 'error', text: 'อ่านไฟล์ไม่ได้ ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง' };
      this.render();
      return;
    }
    const check = readBackup(parsed);
    if (!check.ok) {
      this.dataMessage = { tone: 'error', text: `นำเข้าไม่ได้ · ${check.errors.join(' · ')}` };
      this.render();
      return;
    }
    const { practiceSessions, chantSessions, customPrayers } = check.counts;
    const incoming = `การฝึก ${practiceSessions} · การสวด ${chantSessions} · บทสวดส่วนตัว ${customPrayers}`;
    const current = `การฝึก ${this.sessions.length} · การสวด ${this.chants.length} · บทสวดส่วนตัว ${this.customPrayers.length}`;
    if (!window.confirm(`นำเข้าจะแทนที่ข้อมูลเดิมทั้งหมด\n\nของเดิม: ${current}\nในไฟล์: ${incoming}\n\nดำเนินการต่อใช่ไหม?`)) return;
    try {
      await restoreBackup(check.data);
      this.settings = check.data.settings;
      this.active = null;
      this.bellCursor = null;
      this.lastFinished = null;
      [this.sessions, this.chants, this.customPrayers, this.baseline] = await Promise.all([
        listPracticeSessions(), listChantSessions(), listCustomPrayers(), getLegacyBaseline(),
      ]);
      this.dataMessage = { tone: 'ok', text: `นำเข้าแล้ว · ${incoming}` };
    } catch (error) {
      this.dataMessage = { tone: 'error', text: `นำเข้าไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}` };
    }
    this.render();
  }

  // ระฆังที่ไม่ดังต้องมองเห็นได้บนหน้าจอ ไม่ใช่หายไปเฉย ๆ
  // เพราะอาการ "เงียบโดยไม่มีสาเหตุ" คือสิ่งที่ทำให้ไล่ปัญหาบน iPhone ยากที่สุด
  private async ringBell(kind: Exclude<BellKind, 'keepalive'>, index: number | null = null, latenessMs = 0): Promise<void> {
    // อ่าน sessionId ก่อน await เพราะ finish() จะล้าง this.active ทิ้งระหว่างที่ระฆังยังเล่นอยู่
    const sessionId = this.active?.sessionId ?? PENDING;
    const result = await this.practiceAudio.playBell(kind);
    const logId = appendBellLog({
      sessionId, kind, index, atIso: new Date().toISOString(), latenessMs,
      outcome: result.ok ? 'rang' : 'failed', reason: result.reason,
    });
    // ผลการวัดเสียงมาทีหลัง จึงเติมกลับเข้าบันทึกแล้ววาดหน้าสรุปใหม่ถ้ายังอยู่หน้านั้น
    void result.verify.then((playback) => {
      if (playback === null) return;
      patchBellLog(logId, { playedMs: playback.playedMs, state: playback.state });
      if (routeFromHash().page === 'completed') this.render();
    });
    const page = routeFromHash().page;
    if (result.ok) {
      if (page === 'completed') this.render();
      return;
    }
    this.audioMessage = `ระฆังไม่ดัง (${kind}: ${result.reason ?? 'ไม่ทราบสาเหตุ'})`;
    if (page === 'session' || page === 'completed') this.render();
  }

  private async finish(sessionId: string, mode: 'user' | 'due'): Promise<void> {
    const now = Date.now();
    const dueLateMs = this.active?.plannedDurationSec === null || !this.active
      ? Infinity
      : elapsedMs(this.active, now) - this.active.plannedDurationSec * 1000;
    this.practiceAudio.stopBackground();
    const endLateness = Number.isFinite(dueLateMs) ? Math.max(0, dueLateMs) : 0;
    if (mode === 'user' || dueLateMs <= bellLatenessLimitMs) {
      void this.ringBell('end', null, endLateness);
    } else if (this.active) {
      appendBellLog({
        sessionId: this.active.sessionId, kind: 'end', index: null, atIso: new Date().toISOString(),
        latenessMs: endLateness, outcome: 'skipped-late',
      });
    }
    this.practiceAudio.stopKeepaliveAfterBell();
    const finished = await finishPracticeSession(sessionId, mode);
    if (!finished) {
      this.active = await getActiveSession();
      this.render();
      return;
    }
    this.active = null;
    this.bellCursor = null;
    this.audioMessage = null;
    this.recovered = false;
    this.lastFinished = finished;
    this.sessions = [finished, ...this.sessions.filter((item) => item.id !== finished.id)];
    location.hash = '#/practice/completed';
    this.render();
  }

  private async tick(): Promise<void> {
    if (!this.active || this.busy) return;
    const now = Date.now();
    if (isDue(this.active, now)) {
      await this.runSessionAction(() => this.finish(this.active!.sessionId, 'due'));
      return;
    }
    if (!this.bellCursor || this.bellCursor.sessionId !== this.active.sessionId) this.syncBellCursor(now);
    if (this.bellCursor) {
      const result = intervalBellResult(this.active, now, this.bellCursor.index);
      const crossed = result.index > this.bellCursor.index;
      this.bellCursor.index = result.index;
      if (result.ring) {
        void this.ringBell('interval', result.index, result.latenessMs);
      } else if (crossed && result.index > 0) {
        appendBellLog({
          sessionId: this.active.sessionId, kind: 'interval', index: result.index,
          atIso: new Date().toISOString(), latenessMs: result.latenessMs, outcome: 'skipped-late',
        });
      }
    }
    if (routeFromHash().page !== 'session') return;
    const remaining = remainingMs(this.active, now);
    const elapsed = elapsedMs(this.active, now);
    const clock = this.root.querySelector<HTMLElement>('#timer-clock');
    const elapsedLabel = this.root.querySelector<HTMLElement>('#timer-elapsed');
    const ring = this.root.querySelector<HTMLElement>('#timer-ring');
    if (clock) clock.textContent = remaining === null ? formatClock(elapsed) : formatClock(Math.ceil(remaining / 1000) * 1000);
    if (elapsedLabel) elapsedLabel.textContent = `ฝึกแล้ว ${formatClock(elapsed)}`;
    if (ring && this.active.plannedDurationSec !== null) {
      ring.style.setProperty('--progress', `${Math.min(100, elapsed / (this.active.plannedDurationSec * 10))}%`);
    }
  }

  private async refreshFromDatabase(): Promise<void> {
    if (this.busy || this.storageIssue) return;
    try {
      [this.active, this.sessions, this.chants, this.customPrayers, this.baseline] = await Promise.all([
        getActiveSession(), listPracticeSessions(), listChantSessions(), listCustomPrayers(), getLegacyBaseline(),
      ]);
      this.recovered = this.active !== null;
      this.syncBellCursor();
      if (!this.active) this.practiceAudio.stopBackground();
      this.render();
      await this.tick();
    } catch (error) {
      this.onDataError(error);
    }
  }

  private syncBellCursor(now = Date.now()): void {
    if (!this.active) {
      this.bellCursor = null;
    } else if (this.bellCursor?.sessionId !== this.active.sessionId) {
      this.bellCursor = { sessionId: this.active.sessionId, index: intervalBellIndex(this.active, now) };
    }
  }

  private async runSessionAction(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.onDataError(error);
    } finally {
      this.busy = false;
    }
  }

  private persistSettings(): Promise<void> {
    if (this.storageIssue) return Promise.resolve();
    const snapshot = structuredClone(this.settings);
    this.writeQueue = this.writeQueue.then(() => saveSettings(snapshot)).catch((error) => this.onDataError(error));
    return this.writeQueue;
  }

  private onDataError(error: unknown): void {
    console.error('Local data error', error);
    this.storageIssue = true;
    this.render();
  }
}
