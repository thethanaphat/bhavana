import { icon } from '../../app/icons';
import { backgroundSounds, soundById } from '../../content/audio';
import type { ActiveSession, BellInterval, PracticePreference, PracticeSession, PracticeType, Settings } from '../../data/models';
import { elapsedMs, formatClock, remainingMs } from './timer';

const durations = [10, 15, 20, 30, 45, 60, 90];
const bellIntervals: BellInterval[] = [0, 1, 5, 10, 15];

function activityTitle(type: PracticeType): string {
  return type === 'sitting' ? 'นั่งสมาธิ' : 'เดินจงกรม';
}

function durationLabel(value: number | null): string {
  if (value === null) return 'ไม่กำหนดเวลา';
  if (value < 60) return `${value} นาที`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} ชั่วโมง` : `${hours} ชั่วโมง ${minutes} นาที`;
}

function preferenceLabel(preference: PracticePreference): string {
  const bell = preference.bellIntervalMin === 0 ? 'ไม่เปิดระฆังระหว่างฝึก' : `ระฆังทุก ${preference.bellIntervalMin} นาที`;
  const background = soundById(preference.backgroundSoundId)?.title;
  return `${durationLabel(preference.durationMin)} · ${bell}${background ? ` · ${background}` : ''}`;
}

export function renderPracticeHome(settings: Settings, active: ActiveSession | null, today: { count: number; durationSec: number }): string {
  const date = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const todayTitle = today.count === 0 ? 'ยังไม่มีบันทึกการฝึก' : `ฝึกแล้ว ${Math.floor(today.durationSec / 60)} นาที`;
  const todaySub = today.count === 0 ? 'เริ่มเมื่อพร้อม แล้วค่อย ๆ ไปทีละวัน' : `${today.count} ช่วงที่จบในวันนี้`;

  return `
    <section class="intro" aria-labelledby="home-title">
      <div class="eyebrow">พื้นที่ฝึกของคุณ</div>
      <h1 id="home-title">ให้วันนี้มีช่วงเวลา<br><em>ที่ได้อยู่กับตัวเอง</em></h1>
      <p>เริ่มจากไม่กี่นาทีก็เพียงพอ เลือกแบบที่เหมาะกับวันนี้</p>
    </section>

    <section class="today-panel" aria-label="สรุปวันนี้">
      <div class="today-icon">${icon('leaf')}</div>
      <div class="today-copy"><span class="eyebrow">วันนี้ · ${date}</span><strong>${todayTitle}</strong><span>${todaySub}</span></div>
    </section>

    ${active ? `<a class="active-session-card" href="#/practice/session"><span>${icon('clock')}</span><span><small>มีช่วงฝึกที่กำลังดำเนินอยู่</small><strong>${activityTitle(active.type)} · ${active.pausedAt ? 'หยุดพัก' : 'กำลังจับเวลา'}</strong></span>${icon('arrow')}</a>` : ''}

    <div class="section-heading"><div><span class="eyebrow">เริ่มฝึก</span><h2>เลือกกิจกรรม</h2></div><span>01 / 03</span></div>
    <div class="activity-list">
      <a class="activity-card" href="#/practice/sitting">
        <span class="activity-symbol sitting">${icon('lotus')}</span>
        <span class="activity-text"><strong>นั่งสมาธิ</strong><small>${preferenceLabel(settings.sitting)}</small></span>
        <span class="activity-arrow">${icon('arrow')}</span>
      </a>
      <a class="activity-card" href="#/practice/walking">
        <span class="activity-symbol walking">${icon('walk')}</span>
        <span class="activity-text"><strong>เดินจงกรม</strong><small>${preferenceLabel(settings.walking)}</small></span>
        <span class="activity-arrow">${icon('arrow')}</span>
      </a>
      <a class="activity-card" href="#/prayers">
        <span class="activity-symbol chanting">${icon('chant')}</span>
        <span class="activity-text"><strong>สวดมนต์</strong><small>เลือกบทสวดที่อยากอ่านวันนี้</small></span>
        <span class="activity-arrow">${icon('arrow')}</span>
      </a>
    </div>
    <p class="quiet-note">การฝึกของคุณเป็นเรื่องส่วนตัว และจะบันทึกไว้ในเครื่องนี้เท่านั้น</p>
  `;
}

function durationButton(minutes: number, selected: boolean): string {
  const primary = String(minutes);
  const unit = 'นาที';
  return `<button class="duration-option ${selected ? 'selected' : ''}" type="button" data-action="duration" data-value="${minutes}" aria-pressed="${selected}"><span>${primary}</span><small>${unit}</small></button>`;
}

export function renderDurationPicker(type: PracticeType, preference: PracticePreference, hasActive: boolean, canStart: boolean): string {
  const isCustom = preference.durationMin !== null && !durations.includes(preference.durationMin);
  return `
    <a class="back-link" href="#/practice">${icon('back')} กลับไปหน้าฝึก</a>
    <section class="picker-head">
      <span class="activity-symbol ${type}">${icon(type === 'sitting' ? 'lotus' : 'walk')}</span>
      <span class="eyebrow">กำหนดช่วงเวลาของคุณ</span>
      <h1>${activityTitle(type)}</h1>
      <p>เลือกช่วงเวลาที่พอดีกับวันนี้ เปลี่ยนได้ทุกครั้งก่อนเริ่ม</p>
    </section>
    <section class="picker-section" aria-labelledby="duration-title">
      <div class="section-heading compact"><div><span class="eyebrow">01 · ระยะเวลา</span><h2 id="duration-title">อยากฝึกนานเท่าไร</h2></div>${icon('clock')}</div>
      <div class="duration-grid">${durations.map((minutes) => durationButton(minutes, preference.durationMin === minutes)).join('')}</div>
      <div class="other-options">
        <button class="choice-row ${preference.durationMin === null ? 'selected' : ''}" type="button" data-action="duration" data-value="open" aria-pressed="${preference.durationMin === null}">
          <span><strong>ไม่กำหนดเวลา</strong><small>หยุดเมื่อคุณพร้อม</small></span><span class="radio-mark"></span>
        </button>
        <div class="choice-row custom-row ${isCustom ? 'selected' : ''}">
          <button class="custom-select" type="button" data-action="custom" aria-pressed="${isCustom}"><strong>กำหนดเอง</strong><small>ตั้งได้ตั้งแต่ 1–720 นาที</small></button>
          <span class="custom-input-wrap"><input id="custom-minutes" type="number" inputmode="numeric" min="1" max="720" value="${preference.customMinutes}" aria-label="จำนวนนาทีที่กำหนดเอง" /><span>นาที</span></span>
        </div>
      </div>
    </section>
    <section class="picker-section bell-section" aria-labelledby="bell-title">
      <div class="section-heading compact"><div><span class="eyebrow">02 · เสียงระหว่างฝึก</span><h2 id="bell-title">ระฆังเตือนสติ</h2></div>${icon('bell')}</div>
      <div class="segmented">${bellIntervals.map((value) => `<button type="button" data-action="bell" data-value="${value}" class="${preference.bellIntervalMin === value ? 'selected' : ''}" aria-pressed="${preference.bellIntervalMin === value}">${value === 0 ? 'ปิด' : `${value} นาที`}</button>`).join('')}</div>
      <p class="field-note">มีระฆังเริ่มและจบการฝึก ส่วนระฆังระหว่างฝึกเลือกความถี่ได้</p>
    </section>
    <section class="picker-section" aria-labelledby="background-title">
      <div class="section-heading compact"><div><span class="eyebrow">03 · เสียงพื้นหลัง</span><h2 id="background-title">บรรยากาศระหว่างฝึก</h2></div>${icon('sound')}</div>
      <div class="background-options">
        <button type="button" class="background-option ${preference.backgroundSoundId === null ? 'selected' : ''}" data-action="background" data-value="off" aria-pressed="${preference.backgroundSoundId === null}"><span><strong>ปิดเสียงพื้นหลัง</strong><small>ฝึกในความเงียบ</small></span><span class="radio-mark"></span></button>
        ${backgroundSounds.map((sound) => `<button type="button" class="background-option ${preference.backgroundSoundId === sound.id ? 'selected' : ''}" data-action="background" data-value="${sound.id}" aria-pressed="${preference.backgroundSoundId === sound.id}"><span><strong>${sound.title}</strong><small>${sound.description}</small></span><span class="radio-mark"></span></button>`).join('')}
      </div>
      <p class="field-note">เสียงพื้นหลังจะพักพร้อมตัวจับเวลา และสามารถเปิดใหม่ได้จากหน้าฝึก</p>
    </section>
    <div class="start-preview"><div><span>พร้อมสำหรับ</span><strong>${durationLabel(preference.durationMin)}</strong></div><button type="button" data-action="start" ${canStart ? '' : 'disabled'}>${hasActive ? 'กลับไปช่วงที่กำลังฝึก' : 'ไปหน้าฝึก'}</button></div>
  `;
}

export function renderReadyScreen(type: PracticeType, preference: PracticePreference, hasActive: boolean, canStart: boolean): string {
  return `
    <a class="back-link" href="#/practice/${type}">${icon('back')} กลับไปเลือกเวลา</a>
    <section class="timer-screen ready-screen" aria-labelledby="ready-title">
      <span class="activity-symbol ${type}">${icon(type === 'sitting' ? 'lotus' : 'walk')}</span>
      <span class="eyebrow">เตรียมตัวก่อนเริ่ม</span>
      <h1 id="ready-title">${activityTitle(type)}</h1>
      <p>${durationLabel(preference.durationMin)}</p>
      <p class="ready-sound">${soundById(preference.backgroundSoundId)?.title ?? 'ไม่มีเสียงพื้นหลัง'} · ${preference.bellIntervalMin ? `ระฆังทุก ${preference.bellIntervalMin} นาที` : 'ไม่เปิดระฆังระหว่างฝึก'}</p>
      <div class="timer-ring open"><div class="timer-ring-inner"><span>เวลาที่ฝึก</span><strong>00:00</strong><small>ยังไม่เริ่มจับเวลา</small></div></div>
      <p class="timer-elapsed">เมื่อพร้อม วางโทรศัพท์แล้วกดเริ่มฝึก</p>
      <button class="ready-start" type="button" data-action="begin-session" ${canStart ? '' : 'disabled'}>${hasActive ? 'กลับไปช่วงที่กำลังฝึก' : 'เริ่มฝึก'}</button>
    </section>
  `;
}

export function renderActiveTimer(active: ActiveSession, recovered: boolean, backgroundPlaying: boolean, audioMessage: string | null): string {
  const remaining = remainingMs(active, Date.now());
  const elapsed = elapsedMs(active, Date.now());
  const progress = active.plannedDurationSec === null ? 0 : Math.min(100, Math.round(elapsed / (active.plannedDurationSec * 10)));
  const mainClock = remaining === null ? formatClock(elapsed) : formatClock(Math.ceil(remaining / 1000) * 1000);
  return `
    <section class="timer-screen" aria-labelledby="timer-title">
      <span class="activity-symbol ${active.type}">${icon(active.type === 'sitting' ? 'lotus' : 'walk')}</span>
      <span class="eyebrow">${active.pausedAt ? 'หยุดพักอยู่' : 'ช่วงเวลาของคุณ'}</span>
      <h1 id="timer-title">${activityTitle(active.type)}</h1>
      <p>${active.plannedDurationSec === null ? 'ไม่กำหนดเวลาจบ' : `ตั้งไว้ ${durationLabel(active.plannedDurationSec / 60)}`}</p>
      <p class="timer-bell-note">${active.bellIntervalMin ? `ระฆังทุก ${active.bellIntervalMin} นาที` : 'ไม่เปิดระฆังระหว่างฝึก'}</p>
      ${recovered ? `<div class="recovery-note">กู้คืนช่วงฝึกจากเครื่องนี้แล้ว เวลาคำนวณต่อจากตอนที่เริ่ม</div>` : ''}
      <div class="timer-ring ${active.plannedDurationSec === null ? 'open' : ''}" id="timer-ring" style="--progress: ${progress}%">
        <div class="timer-ring-inner"><span id="timer-clock-label">${remaining === null ? 'เวลาที่ฝึก' : 'เวลาที่เหลือ'}</span><strong id="timer-clock" role="timer">${mainClock}</strong><small id="timer-status">${active.pausedAt ? 'หยุดพัก' : 'กำลังฝึก'}</small></div>
      </div>
      <p class="timer-elapsed" id="timer-elapsed">ฝึกแล้ว ${formatClock(elapsed)}</p>
      ${active.backgroundSoundId && soundById(active.backgroundSoundId) ? `<div class="timer-sound"><span>${icon('sound')}<span><strong>${soundById(active.backgroundSoundId)!.title}</strong><small>${active.pausedAt ? 'เสียงพักอยู่' : backgroundPlaying ? 'กำลังเล่นเสียงพื้นหลัง' : 'ยังไม่ได้เปิดเสียง'}</small></span></span><button type="button" data-action="toggle-background" ${active.pausedAt ? 'disabled' : ''}>${active.pausedAt ? 'พักอยู่' : backgroundPlaying ? 'ปิดเสียง' : 'เปิดเสียง'}</button></div>` : ''}
      ${audioMessage ? `<p class="audio-status" role="status">${audioMessage}</p>` : ''}
      <div class="timer-actions">
        <button type="button" class="timer-pause" data-action="${active.pausedAt ? 'resume-session' : 'pause-session'}">${active.pausedAt ? 'ฝึกต่อ' : 'หยุดพัก'}</button>
        <button type="button" class="timer-finish" data-action="finish-session">จบการฝึก</button>
      </div>
      <button type="button" class="timer-discard" data-action="discard-session">ยกเลิกโดยไม่บันทึก</button>
    </section>
  `;
}

export function renderCompletedSession(session: PracticeSession, bellLog: string[] = []): string {
  const title = session.status === 'stopped' ? 'จบก่อนเวลาที่ตั้งไว้' : 'ครบช่วงเวลาของคุณแล้ว';
  return `
    <section class="completed-screen">
      <span class="completed-symbol">${icon('leaf')}</span>
      <span class="eyebrow">บันทึกการฝึกแล้ว</span>
      <h1>${title}</h1>
      <p>ขอบคุณที่ให้เวลากับตัวเองในวันนี้</p>
      <div class="completed-detail"><span>${activityTitle(session.type)}</span><strong>${formatClock(session.durationSec * 1000)}</strong><small>เวลาที่ฝึกจริง${session.plannedDurationSec === null ? ' · ไม่กำหนดเวลา' : ` · ตั้งไว้ ${durationLabel(session.plannedDurationSec / 60)}`}</small></div>
      ${bellLog.length ? `<details class="bell-log"><summary>ระฆังรอบนี้ (${bellLog.length})</summary><ul>${bellLog.map((line) => `<li>${line}</li>`).join('')}</ul></details>` : ''}
      <a class="completed-home" href="#/practice">กลับไปหน้าฝึก ${icon('arrow')}</a>
    </section>
  `;
}
