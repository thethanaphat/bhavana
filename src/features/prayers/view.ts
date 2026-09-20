import { prayerAudioUrl } from '../../content/audio';
import { icon } from '../../app/icons';
import { escapeHtml } from '../../app/html';
import { prayers } from '../../content/prayers';
import type { CustomPrayer } from '../../data/models';

export interface PrayerEntry {
  id: string;
  title: string;
  text: string;
  custom: boolean;
  audioFile?: string;
}

export function renderPrayerList(custom: CustomPrayer[]): string {
  return `
    <section class="page-heading"><span class="eyebrow">พื้นที่ของถ้อยคำ</span><h1>บทสวดมนต์</h1><p>เลือกบทที่อยากอ่าน แล้วค่อย ๆ ใช้เวลาอยู่กับคำสวด</p></section>
    <div class="section-heading"><div><span class="eyebrow">บทหลัก</span><h2>เลือกบทสวด</h2></div><span>01 / 03</span></div>
    <div class="prayer-list">${prayers.map((prayer, index) => `
      <a class="prayer-card" href="#/prayers/${prayer.id}">
        <span class="prayer-number">${String(index + 1).padStart(2, '0')}</span>
        <span><strong>${escapeHtml(prayer.title)}</strong><small>อ่านบทสวด · บันทึกการสวด</small></span>
        ${icon('arrow')}
      </a>`).join('')}</div>
    <div class="section-heading prayer-own-heading"><div><span class="eyebrow">พื้นที่ของคุณ</span><h2>บทสวดส่วนตัว</h2></div></div>
    ${custom.length ? `<div class="prayer-list">${custom.map((prayer) => `
      <a class="prayer-card" href="#/prayers/custom/${encodeURIComponent(prayer.id)}">
        <span class="prayer-number custom-number">${icon('book')}</span>
        <span><strong>${escapeHtml(prayer.title)}</strong><small>บทที่คุณเพิ่มเอง</small></span>${icon('arrow')}
      </a>`).join('')}</div>` : '<p class="empty-custom">ยังไม่มีบทสวดส่วนตัว</p>'}
    <a class="add-prayer-link" href="#/prayers/new">เพิ่มบทสวดของฉัน ${icon('arrow')}</a>
  `;
}

function prayerParagraphs(text: string): string {
  return text.trim().split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}

export function renderPrayerDetail(prayer: PrayerEntry | null, textScale: number, audioState: 'checking' | 'available' | 'missing', saved: boolean): string {
  if (!prayer) {
    return `<section class="empty-state">${icon('book')}<h1>ไม่พบบทสวดนี้</h1><a class="text-link" href="#/prayers">กลับไปสารบัญ</a></section>`;
  }
  const audioUrl = prayer.audioFile ? prayerAudioUrl(prayer.audioFile) : '';
  return `
    <a class="back-link" href="#/prayers">${icon('back')} กลับไปสารบัญ</a>
    <section class="prayer-detail-head"><span class="eyebrow">${prayer.custom ? 'บทสวดส่วนตัว' : 'บทสวดมนต์'}</span><h1>${escapeHtml(prayer.title)}</h1><p>อ่านในจังหวะที่สบายใจ</p></section>
    <div class="reader-tools"><span>ขนาดตัวอักษร</span><div><button type="button" data-action="font-decrease" aria-label="ลดขนาดตัวอักษร" ${textScale <= 0.9 ? 'disabled' : ''}>ก−</button><button type="button" data-action="font-increase" aria-label="เพิ่มขนาดตัวอักษร" ${textScale >= 1.4 ? 'disabled' : ''}>ก+</button></div></div>
    <article id="prayer-text" class="prayer-text" style="--text-scale: ${textScale}" aria-label="ข้อความบทสวด">${prayerParagraphs(prayer.text)}</article>
    ${prayer.custom ? `<div class="custom-prayer-actions"><a href="#/prayers/custom/${encodeURIComponent(prayer.id)}/edit">แก้ไขบทสวด</a><button type="button" data-action="delete-prayer" data-id="${escapeHtml(prayer.id)}">ลบบทนี้</button></div>` : `
      <section class="prayer-audio" aria-label="เสียงบทสวด"><div class="section-heading compact"><div><span class="eyebrow">ฟังบทสวด</span><h2>เสียงอ่าน</h2></div>${icon('book')}</div>
      ${audioState === 'available' ? `<audio id="prayer-audio" controls preload="metadata" src="${audioUrl}">เบราว์เซอร์นี้ไม่รองรับเสียง</audio><button type="button" class="audio-restart" data-action="restart-audio">เริ่มฟังใหม่</button><p class="field-note">การฟังเสียงไม่ถูกบันทึกเป็นการสวด</p>` : `<p class="audio-note">${audioState === 'checking' ? 'กำลังตรวจไฟล์เสียง…' : 'ยังไม่มีไฟล์เสียงสำหรับบทนี้ คุณยังอ่านและบันทึกการสวดได้'}</p>`}
      </section>`}
    <section class="chant-panel" aria-labelledby="chant-record-title"><span class="eyebrow">บันทึกตามจริง</span><h2 id="chant-record-title">บันทึกการสวด</h2><p>ถ้าสวดบทนี้แล้ว คุณจะบันทึกจำนวนรอบและเวลาโดยประมาณก็ได้ เว้นว่างได้ทั้งสองช่อง</p>
      ${saved ? '<div class="saved-note" role="status">บันทึกการสวดเรียบร้อยแล้ว</div>' : ''}
      <form id="chant-form" data-prayer-id="${escapeHtml(prayer.id)}" data-custom="${prayer.custom}">
        <label>จำนวนรอบ <span>ไม่บังคับ</span><input name="rounds" type="number" inputmode="numeric" min="1" max="9999" placeholder="เช่น 3"></label>
        <label>เวลาที่สวด <span>ไม่บังคับ</span><div class="input-with-unit"><input name="durationMin" type="number" inputmode="numeric" min="1" max="720" placeholder="เช่น 10"><span>นาที</span></div></label>
        <button type="submit">บันทึกการสวด</button>
      </form>
      <p class="field-note">เวลาที่กรอกเป็นเวลาโดยประมาณ และจะไม่แปลงจำนวนรอบเป็นนาที</p>
    </section>
  `;
}

export function renderCustomPrayerForm(prayer: CustomPrayer | null): string {
  const editing = prayer !== null;
  return `
    <a class="back-link" href="${editing ? `#/prayers/custom/${encodeURIComponent(prayer.id)}` : '#/prayers'}">${icon('back')} กลับไป${editing ? 'บทสวด' : 'สารบัญ'}</a>
    <section class="page-heading"><span class="eyebrow">พื้นที่ของคุณ</span><h1>${editing ? 'แก้ไขบทสวด' : 'เพิ่มบทสวดของฉัน'}</h1><p>ข้อความนี้จะเก็บไว้ในเครื่องของคุณ</p></section>
    <form id="custom-prayer-form" class="custom-prayer-form" data-id="${editing ? escapeHtml(prayer.id) : ''}">
      <label>ชื่อบทสวด<input name="title" type="text" maxlength="100" required value="${editing ? escapeHtml(prayer.title) : ''}" placeholder="ชื่อบทสวด"></label>
      <label>ข้อความบทสวด<textarea name="text" rows="13" maxlength="30000" required placeholder="พิมพ์หรือวางข้อความบทสวดที่นี่">${editing ? escapeHtml(prayer.text) : ''}</textarea></label>
      <button type="submit">${editing ? 'บันทึกการแก้ไข' : 'เพิ่มบทสวด'}</button>
    </form>
  `;
}
