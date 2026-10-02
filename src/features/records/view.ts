import { icon } from '../../app/icons';
import { escapeHtml } from '../../app/html';
import type { ChantSession, LegacyBaseline, PracticeSession } from '../../data/models';
import type { BackfillKind } from './backfill';
import {
  buildBuckets, buildRecordStats, chantInWindow, containsNow, periodWindow, practiceInWindow,
  type StatsBucket, type StatsPeriod, type TimeWindow,
} from './stats';

export type HistoryFilter = 'all' | 'sitting' | 'walking' | 'chanting';

type HistoryItem =
  | { kind: 'practice'; endedAt: string; value: PracticeSession }
  | { kind: 'chant'; endedAt: string; value: ChantSession };

export interface BackfillDraft {
  kind: BackfillKind;
  date: string;
  time: string;
  prayerId: string;
}

export interface BackfillPrayerOption {
  id: string;
  title: string;
}

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

// แกนกราฟใช้หน่วยสั้น เพราะช่องแคบบน iPhone
function shortDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function periodCaption(period: StatsPeriod, anchorMs: number, nowMs: number): string {
  if (period === 'all') return 'ทุกบันทึกในเครื่องนี้';
  const window = periodWindow(period, anchorMs);
  const start = new Date(window.startMs);
  const current = containsNow(period, anchorMs, nowMs);
  if (period === 'day') {
    const label = new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
    return current ? `วันนี้ · ${label}` : label;
  }
  if (period === 'week') {
    const label = `${shortDate(start)} – ${shortDate(new Date(window.endMs - 1))}`;
    return current ? `สัปดาห์นี้ · ${label}` : label;
  }
  const label = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(start);
  return current ? `เดือนนี้ · ${label}` : label;
}

function periodButton(value: StatsPeriod, selected: StatsPeriod, label: string): string {
  return `<button type="button" class="${value === selected ? 'selected' : ''}" data-action="records-period" data-value="${value}" aria-pressed="${value === selected}">${label}</button>`;
}

function filterButton(value: HistoryFilter, selected: HistoryFilter, label: string): string {
  return `<button type="button" class="${value === selected ? 'selected' : ''}" data-action="history-filter" data-value="${value}" aria-pressed="${value === selected}">${label}</button>`;
}

function historyItems(sessions: PracticeSession[], chants: ChantSession[], filter: HistoryFilter, window: TimeWindow): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const value of sessions) {
    if ((filter === 'all' || filter === value.type) && practiceInWindow(value, window)) items.push({ kind: 'practice', endedAt: value.endedAt, value });
  }
  for (const value of chants) {
    if ((filter === 'all' || filter === 'chanting') && chantInWindow(value, window)) items.push({ kind: 'chant', endedAt: value.endedAt, value });
  }
  return items.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

function deleteButton(kind: 'practice' | 'chant', id: string): string {
  return `<button type="button" class="history-delete" data-action="delete-record" data-kind="${kind}" data-id="${escapeHtml(id)}">ลบ</button>`;
}

const manualTag = '<span class="history-manual">บันทึกย้อนหลัง</span>';

function renderHistoryItem(item: HistoryItem): string {
  if (item.kind === 'chant') {
    const chant = item.value;
    const rounds = chant.rounds === null ? 'ไม่ระบุจำนวนรอบ' : `${chant.rounds} รอบ`;
    const duration = chant.durationSec === null ? 'ไม่ระบุเวลา' : durationText(chant.durationSec);
    return `<article class="history-card"><div class="history-top"><span class="history-kind chanting">สวดมนต์</span>${chant.source === 'manual' ? manualTag : ''}<time datetime="${chant.endedAt}">${dateTime(chant.endedAt)}</time></div><h3>${escapeHtml(chant.prayerTitleSnapshot)}</h3><p>${rounds}</p><div class="history-foot"><small>เวลาที่สวด: ${duration}</small>${deleteButton('chant', chant.id)}</div></article>`;
  }
  const session = item.value;
  const activity = session.type === 'sitting' ? 'นั่งสมาธิ' : 'เดินจงกรม';
  if (session.source === 'manual') {
    return `<article class="history-card"><div class="history-top"><span class="history-kind ${session.type}">${activity}</span>${manualTag}<time datetime="${session.endedAt}">${dateTime(session.endedAt)}</time></div><h3>ฝึก ${durationText(session.durationSec)}</h3><div class="history-foot"><small>เริ่ม ${dateTime(session.startedAt)}</small>${deleteButton('practice', session.id)}</div></article>`;
  }
  const status = session.plannedDurationSec === null ? 'ไม่กำหนดเวลาจบ' : session.status === 'completed' ? 'ครบเวลาที่ตั้งไว้' : 'จบก่อนเวลาที่ตั้งไว้';
  const planned = session.plannedDurationSec === null ? '' : ` · ตั้งไว้ ${durationText(session.plannedDurationSec)}`;
  return `<article class="history-card"><div class="history-top"><span class="history-kind ${session.type}">${activity}</span><time datetime="${session.endedAt}">${dateTime(session.endedAt)}</time></div><h3>ฝึกจริง ${durationText(session.durationSec)}</h3><p>${status}${planned}</p><div class="history-foot"><small>เริ่ม ${dateTime(session.startedAt)}</small>${deleteButton('practice', session.id)}</div></article>`;
}

export function localDateInput(nowMs: number): string {
  const date = new Date(nowMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const weekdayLabels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function bucketLabel(period: StatsPeriod, bucket: StatsBucket, index: number): string {
  const start = new Date(bucket.startMs);
  if (period === 'week') return weekdayLabels[index];
  if (period === 'month') return [1, 8, 15, 22, 29].includes(start.getDate()) ? String(start.getDate()) : '';
  return new Intl.DateTimeFormat('th-TH', { month: 'narrow' }).format(start);
}

function bucketName(period: StatsPeriod, bucket: StatsBucket): string {
  const start = new Date(bucket.startMs);
  return period === 'all'
    ? new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(start)
    : new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(start);
}

// เฉลี่ยเฉพาะวันที่ผ่านมาแล้ว ไม่หารด้วยวันในอนาคตของสัปดาห์/เดือนนี้ ตัวเลขจะได้ไม่ต่ำผิดจริง
function averagePerDay(buckets: StatsBucket[], nowMs: number): number | null {
  const elapsed = buckets.filter((bucket) => bucket.startMs <= nowMs);
  if (!elapsed.length) return null;
  const total = elapsed.reduce((sum, bucket) => sum + bucket.sittingSec + bucket.walkingSec, 0);
  return total / elapsed.length;
}

function renderChart(period: StatsPeriod, buckets: StatsBucket[], nowMs: number): string {
  if (!buckets.length) return '';
  const max = Math.max(...buckets.map((bucket) => bucket.sittingSec + bucket.walkingSec));
  const drill: StatsPeriod = period === 'all' ? 'month' : 'day';
  const average = period === 'all' ? null : averagePerDay(buckets, nowMs);
  const columns = buckets.map((bucket, index) => {
    const total = bucket.sittingSec + bucket.walkingSec;
    const height = (seconds: number) => max ? `${(seconds / max) * 100}%` : '0%';
    const isNow = nowMs >= bucket.startMs && nowMs < bucket.endMs;
    const future = bucket.startMs > nowMs;
    const name = `${bucketName(period, bucket)}: ${total ? shortDuration(total) : 'ไม่มีการฝึก'}${bucket.chantCount ? ` · สวด ${bucket.chantCount} ครั้ง` : ''}`;
    return `<button type="button" class="chart-col${isNow ? ' now' : ''}" data-action="records-jump" data-period="${drill}" data-anchor="${bucket.startMs}" aria-label="${name}" ${future ? 'disabled' : ''}>
      <span class="chart-track"><span class="chart-bar walking" style="height:${height(bucket.walkingSec)}"></span><span class="chart-bar sitting" style="height:${height(bucket.sittingSec)}"></span></span>
      <span class="chart-dot${bucket.chantCount ? ' on' : ''}"></span>
      <span class="chart-label">${bucketLabel(period, bucket, index)}</span>
    </button>`;
  }).join('');
  return `
    <div class="chart-card">
      <div class="chart-head"><span>${average === null ? 'นาทีที่ฝึกรายเดือน' : `เฉลี่ยวันละ <strong>${shortDuration(average)}</strong>`}</span><span>${max ? `สูงสุด ${shortDuration(max)}` : ''}</span></div>
      <div class="chart-bars" style="--cols:${buckets.length}">${columns}</div>
      <div class="chart-legend"><span><i class="sitting"></i>นั่ง</span><span><i class="walking"></i>เดิน</span><span><i class="chanting"></i>มีการสวด</span><span class="chart-hint">แตะแท่งเพื่อดูรายละเอียด</span></div>
    </div>`;
}

export function renderRecords(
  sessions: PracticeSession[], chants: ChantSession[], baseline: LegacyBaseline | null,
  period: StatsPeriod, anchorMs: number, filter: HistoryFilter, visibleCount: number, nowMs = Date.now(),
): string {
  const stats = buildRecordStats(sessions, chants, baseline, period, anchorMs);
  const window = periodWindow(period, anchorMs);
  const items = historyItems(sessions, chants, filter, window);
  const visible = items.slice(0, visibleCount);
  const sittingTotal = stats.sitting.durationSec + stats.legacySittingSec;
  const atNow = period === 'all' || containsNow(period, anchorMs, nowMs);
  const nav = period === 'all' ? '' : `
      <button type="button" class="period-step" data-action="records-shift" data-value="-1" aria-label="ช่วงก่อนหน้า">${icon('back')}</button>`;
  const navNext = period === 'all' ? '' : `
      <button type="button" class="period-step" data-action="records-shift" data-value="1" aria-label="ช่วงถัดไป" ${atNow ? 'disabled' : ''}>${icon('arrow')}</button>`;
  return `
    <section class="page-heading"><span class="eyebrow">บันทึกส่วนตัว</span><h1>มองย้อนกลับอย่างอ่อนโยน</h1><p>ทุกช่วงเวลาที่ได้ฝึก จะเก็บไว้ในเครื่องของคุณ</p></section>
    <a class="backfill-link" href="#/records/add"><span>${icon('clock')}</span><span><strong>บันทึกย้อนหลัง</strong><small>ฝึกโดยไม่ได้จับเวลา หรือสวดแล้วลืมบันทึก</small></span>${icon('arrow')}</a>
    <section aria-labelledby="stats-title" class="stats-section">
      <div class="section-heading"><div><span class="eyebrow">สถิติของคุณ</span><h2 id="stats-title">ดูตามช่วงเวลา</h2></div>${icon('chart')}</div>
      <div class="period-chips" aria-label="เลือกช่วงเวลาสถิติ">${periodButton('day', period, 'วัน')}${periodButton('week', period, 'สัปดาห์')}${periodButton('month', period, 'เดือน')}${periodButton('all', period, 'ทั้งหมด')}</div>
      <div class="period-nav">${nav}<p class="period-caption">${periodCaption(period, anchorMs, nowMs)}</p>${navNext}</div>
      <div class="records-summary">
        <div><span>นั่งสมาธิ</span><strong>${durationText(sittingTotal)}</strong><small>${stats.sitting.count} ครั้ง${stats.legacySittingSec ? ' · รวมยอดยกมาจากไฟล์สำรอง' : ''}</small></div>
        <div><span>เดินจงกรม</span><strong>${durationText(stats.walking.durationSec)}</strong><small>${stats.walking.count} ครั้ง</small></div>
        <div><span>สวดมนต์</span><strong>${stats.chanting.count} ครั้ง</strong><small>${stats.chanting.rounds} รอบ${stats.chanting.timedCount ? ` · ${durationText(stats.chanting.durationSec)}` : ''}</small></div>
      </div>
      ${renderChart(period, buildBuckets(sessions, chants, period, anchorMs, nowMs), nowMs)}
      <p class="stats-note">เวลานั่งและเดินเป็นเวลาที่ฝึกจริง จำนวนรอบสวดนับแยกจากนาที</p>
    </section>
    <section class="history-section" aria-labelledby="history-title">
      <div class="section-heading"><div><span class="eyebrow">${period === 'all' ? 'เรื่องราวที่ผ่านมา' : 'ในช่วงที่เลือก'}</span><h2 id="history-title">ประวัติการฝึก</h2></div><span>${items.length} รายการ</span></div>
      <div class="history-filters" aria-label="กรองประวัติ">${filterButton('all', filter, 'ทั้งหมด')}${filterButton('sitting', filter, 'นั่ง')}${filterButton('walking', filter, 'เดิน')}${filterButton('chanting', filter, 'สวด')}</div>
      ${visible.length ? `<div class="history-list">${visible.map(renderHistoryItem).join('')}</div>${items.length > visibleCount ? '<button type="button" class="history-more" data-action="history-more">ดูบันทึกเพิ่ม</button>' : ''}` : `<div class="empty-state records-empty">${icon('leaf')}<h2>ยังไม่มีบันทึก${filter === 'all' ? '' : 'ในหมวดนี้'}${period === 'all' ? '' : 'ในช่วงนี้'}</h2><p>ฝึกแล้วแต่ไม่ได้จับเวลา เพิ่มเองได้</p><a class="text-link" href="#/records/add">บันทึกย้อนหลัง ${icon('arrow')}</a></div>`}
    </section>
  `;
}

function kindOption(kind: BackfillKind, selected: BackfillKind, label: string): string {
  return `<label><input type="radio" name="kind" value="${kind}" ${kind === selected ? 'checked' : ''}><span>${label}</span></label>`;
}

export function renderBackfillForm(
  draft: BackfillDraft, prayers: BackfillPrayerOption[],
  message: { tone: 'ok' | 'error'; text: string } | null, nowMs = Date.now(),
): string {
  const options = prayers.map((prayer) => `<option value="${escapeHtml(prayer.id)}" ${prayer.id === draft.prayerId ? 'selected' : ''}>${escapeHtml(prayer.title)}</option>`).join('');
  return `
    <a class="back-link" href="#/records">${icon('back')} กลับไปบันทึก</a>
    <section class="page-heading"><span class="eyebrow">บันทึกส่วนตัว</span><h1>บันทึกย้อนหลัง</h1><p>สำหรับวันที่ฝึกโดยไม่ได้จับเวลา หรือสวดมนต์แล้วลืมบันทึก</p></section>
    ${message ? `<div class="backfill-message ${message.tone}" role="status">${escapeHtml(message.text)}</div>` : ''}
    <form id="backfill-form" class="backfill-form" novalidate>
      <fieldset class="kind-choice"><legend>กิจกรรม</legend>${kindOption('sitting', draft.kind, 'นั่งสมาธิ')}${kindOption('walking', draft.kind, 'เดินจงกรม')}${kindOption('chanting', draft.kind, 'สวดมนต์')}</fieldset>
      <div class="backfill-pair">
        <label>วันที่<input name="date" type="date" required max="${localDateInput(nowMs)}" value="${draft.date}"></label>
        <label>เวลาเริ่ม<input name="time" type="time" required value="${draft.time}"></label>
      </div>
      <label class="chant-only">บทสวด<select name="prayerId">${options}</select></label>
      <label class="chant-only">จำนวนรอบ <span>ไม่บังคับ</span><input name="rounds" type="number" inputmode="numeric" min="1" max="9999" placeholder="เช่น 3"></label>
      <label>เวลาที่ใช้ <span class="chant-only">ไม่บังคับ</span><div class="input-with-unit"><input name="durationMin" type="number" inputmode="numeric" min="1" max="720" placeholder="เช่น 30"><span>นาที</span></div></label>
      <button type="submit">บันทึก</button>
    </form>
    <p class="field-note">บันทึกที่กรอกเองจะมีป้าย “บันทึกย้อนหลัง” ในประวัติ และนับในสถิติเหมือนการจับเวลาจริง ถ้ากรอกผิดให้ลบจากประวัติแล้วเพิ่มใหม่</p>
  `;
}
