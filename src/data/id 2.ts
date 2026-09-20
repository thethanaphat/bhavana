// crypto.randomUUID ใช้ได้เฉพาะใน secure context (HTTPS หรือ localhost) เท่านั้น
// ตอนทดสอบจาก iPhone ผ่าน http://<ip ในวง LAN> มันจะหายไปทั้งฟังก์ชัน ทำให้การสร้าง session
// throw ตั้งแต่บรรทัดแรกและหน้าจอค้างที่ 00:00 โดยไม่มีข้อความบอกสาเหตุ
//
// id เหล่านี้เป็นเลขอ้างอิงของ record ในเครื่องตัวเอง ไม่ใช่โทเคนความปลอดภัย
// จึงสร้างเองจาก getRandomValues ได้ (ฟังก์ชันนี้มีอยู่นอก secure context ด้วย)
export function newId(): string {
  const api: Crypto | undefined = globalThis.crypto;
  if (typeof api?.randomUUID === 'function') return api.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof api?.getRandomValues === 'function') {
    api.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // เวอร์ชัน 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant ตาม RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
