import { icon } from '../../app/icons';
import { escapeHtml } from '../../app/html';
import type { ChantSession, LegacyBaseline, PracticeSession } from '../../data/models';
import { buildRecordStats, periodWindow, type StatsPeriod } from './stats';

export type HistoryFilter = 'all' | 'sitting' | 'walking' | 'chanting';

type HistoryItem =
  | { kind: 'practice'; endedAt: string; value: PracticeSession }
  | { kind: 'chant'; endedAt: string; value: ChantSession };

function durationText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole} วินาที`;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ชั่วโมง`);
  if (minutes) parts.push(`${minutes} นาที`);
  if (!hours && rest) parts.push(`${rest} วินาที`);
  return parts.join(' ') || '0 นาที';
}

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function periodCaption(period: StatsPeriod, nowMs: number): string {
  if (period === 'all') return 'ข้อมูลที่บันทึกไว้ในเครื่องนี้';
  if (period === 'today') return shortDate(new Date(nowMs));
  const start = new Date(periodWindow(period, nowMs).startMs);
  if (period === 'week') return `${shortDate(start)} – ${shortDate(new Date(nowMs))} · สัปดาห์เริ่มวันจันทร์`;
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(start);
}

function periodButton(value: StatsPeriod, selected: StatsPeriod, label: string): string {
  return `<button type="button" class="${value === selected ? 'selected' : ''}" data-action="records-period" data-value="${value}" aria-pressed="${value === selected}">${label}</button>`;
}

function filterButton(value: HistoryFilter, selected: HistoryFilter, label: string): string {
  return `<button type="button" class="${value === selected ? 'selected' : ''}" data-action="history-filter" data-value="${value}" aria-pressed="${value === selected}">${label}</button>`;
}

function historyItems(sessions: PracticeSession[], chants: ChantSession[], filter: HistoryFilter): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const value of sessions) {
    if (filter === 'all' || filter === value.type) items.push({ kind: 'practice', endedAt: value.endedAt, value });
  }
  for (const value of chants) {
    if (filter === 'all' || filter === 'chanting') items.push({ kind: 'chant', endedAt: value.endedAt, value });
  }
  return items.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

function renderHistoryItem(item: HistoryItem): string {
  if (item.kind === 'chant') {
    const chant = item.value;
    const rounds = chant.rounds === null ? 'ไม่ระบุจำนวนรอบ' : `${chant.rounds} รอบ`;
    const duration = chant.durationSec === null ? 'ไม่ระบุเวลา' : durationText(chant.durationSec);
    return `<article class="history-card"><div class="history-top"><span class="history-kind chanting">สวดมนต์</span><time datetime="${chant.endedAt}">${dateTime(chant.endedAt)}</time></div><h3>${escapeHtml(chant.prayerTitleSnapshot)}</h3><p>${rounds}</p><small>เวลาที่สวด: ${duration}</small></article>`;
  }
  const session = item.value;
  const activity = session.type === 'sitting' ? 'นั่งสมาธิ' : 'เดินจงกรม';
  const status = session.plannedDurationSec === null ? 'ไม่กำหนดเวลาจบ' : session.status === 'completed' ? 'ครบเวลาที่ตั้งไว้' : 'จบก่อนเวลาที่ตั้งไว้';
  const planned = session.plannedDurationSec === null ? '' : ` · ตั้งไว้ ${durationText(session.plannedDurationSec)}`;
  return `<article class="history-card"><div class="history-top"><span class="history-kind ${session.type}">${activity}</span><time datetime="${session.endedAt}">${dateTime(session.endedAt)}</time></div><h3>ฝึกจริง ${durationText(session.durationSec)}</h3><p>${status}${planned}</p><small>เริ่ม ${dateTime(session.startedAt)}</small></article>`;
}

function localDateInput(nowMs: number): string {
  const date = new Date(nowMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function renderLegacy(baseline: LegacyBaseline | null, nowMs: number): string {
  const hours = baseline ? Math.floor(baseline.sittingDurationSec / 3600) : 0;
  const minutes = baseline ? Math.floor((baseline.sittingDurationSec % 3600) / 60) : 0;
  return `
    <details class="legacy-panel">
      <summary><span><strong>ยอดนั่งสมาธิจากแอปเดิม</strong><small>${baseline ? durationText(baseline.sittingDurationSec) : 'ยังไม่ได้เพิ่มยอดเดิม'}</small></span>${icon('arrow')}</summary>
      <div class="legacy-body"><p>ยอดนี้รวมเฉพาะสถิติ “ทั้งหมด” ของการนั่งสมาธิ ไม่สร้างบันทึกย้อนหลังในวัน สัปดาห์ หรือเดือน</p>
        <form id="legacy-form">
          <div class="legacy-duration"><label>ชั่วโมง<input name="hours" type="number" inputmode="numeric" min="0" max="99999" required value="${hours}"></label><label>นาที<input name="minutes" type="number" inputmode="numeric" min="0" max="59" required value="${minutes}"></label></div>
          <label>วันที่จดจากแอปเดิม<input name="asOfDate" type="date" required value="${baseline?.asOfDate ?? localDateInput(nowMs)}"></label>
          <label>หมายเหตุ <span>ไม่บังคับ</span><input name="note" type="text" maxlength="200" value="${escapeHtml(baseline?.note ?? '')}" placeholder="เช่น ยอดก่อนย้ายมาแอปนี้"></label>
          <button type="submit">${baseline ? 'บันทึกยอดเดิมใหม่' : 'เพิ่มยอดเดิม'}</button>
        </form>
        ${baseline ? '<button type="button" class="legacy-remove" data-action="delete-legacy">ลบยอดเดิมนี้</button>' : ''}
      </div>
    </details>`;
}

export function renderRecords(
  sessions: PracticeSession[], chants: ChantSession[], baseline: LegacyBaseline | null,
  period: StatsPeriod, filter: HistoryFilter, visibleCount: number, nowMs = Date.now(),
): string {
  const stats = buildRecordStats(sessions, chants, baseline, period, nowMs);
  const items = historyItems(sessions, chants, filter);
  const visible = items.slice(0, visibleCount);
  const sittingTotal = stats.sitting.durationSec + stats.legacySittingSec;
  return `
    <section class="page-heading"><span class="eyebrow">บันทึกส่วนตัว</span><h1>มองย้อนกลับอย่างอ่อนโยน</h1><p>ทุกช่วงเวลาที่ได้ฝึก จะเก็บไว้ในเครื่องของคุณ</p></section>
    <section aria-labelledby="stats-title" class="stats-section">
      <div class="section-heading"><div><span class="eyebrow">สถิติของคุณ</span><h2 id="stats-title">ดูตามช่วงเวลา</h2></div>${icon('chart')}</div>
      <div class="period-chips" aria-label="เลือกช่วงเวลาสถิติ">${periodButton('today', period, 'วันนี้')}${periodButton('week', period, 'สัปดาห์นี้')}${periodButton('month', period, 'เดือนนี้')}${periodButton('all', period, 'ทั้งหมด')}</div>
      <p class="period-caption">${periodCaption(period, nowMs)}</p>
      <div class="records-summary">
        <div><span>นั่งสมาธิ</span><strong>${durationText(sittingTotal)}</strong><small>${stats.sitting.count} ครั้ง${stats.legacySittingSec ? ' · รวมยอดเดิม' : ''}</small></div>
        <div><span>เดินจงกรม</span><strong>${durationText(stats.walking.durationSec)}</strong><small>${stats.walking.count} ครั้ง</small></div>
        <div><span>สวดมนต์</span><strong>${stats.chanting.count} ครั้ง</strong><small>${stats.chanting.rounds} รอบ${stats.chanting.timedCount ? ` · ${durationText(stats.chanting.durationSec)}` : ''}</small></div>
      </div>
      <p class="stats-note">เวลานั่งและเดินเป็นเวลาที่ฝึกจริง จำนวนรอบสวดนับแยกจากนาที</p>
    </section>
    ${renderLegacy(baseline, nowMs)}
    <section class="history-section" aria-labelledby="history-title">
      <div class="section-heading"><div><span class="eyebrow">เรื่องราวที่ผ่านมา</span><h2 id="history-title">ประวัติการฝึก</h2></div><span>${items.length} รายการ</span></div>
      <div class="history-filters" aria-label="กรองประวัติ">${filterButton('all', filter, 'ทั้งหมด')}${filterButton('sitting', filter, 'นั่ง')}${filterButton('walking', filter, 'เดิน')}${filterButton('chanting', filter, 'สวด')}</div>
      ${visible.length ? `<div class="history-list">${visible.map(renderHistoryItem).join('')}</div>${items.length > visibleCount ? '<button type="button" class="history-more" data-action="history-more">ดูบันทึกเพิ่ม</button>' : ''}` : `<div class="empty-state records-empty">${icon('leaf')}<h2>ยังไม่มีบันทึก${filter === 'all' ? 'การฝึก' : 'ในหมวดนี้'}</h2><p>เมื่อบันทึกการฝึกแล้ว ประวัติจะปรากฏที่นี่</p>${filter === 'all' ? `<a class="text-link" href="#/practice">ไปหน้าฝึก ${icon('arrow')}</a>` : ''}</div>`}
    </section>
  `;
}
