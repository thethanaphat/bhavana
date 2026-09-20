# เสียงบทสวด

วางไฟล์เสียงตามชื่อใน `content/prayers/catalog.json` ฟิลด์ `audioFile` เช่น `itipiso.m4a`

แอปตรวจว่ามีไฟล์จริงไหมด้วย HEAD request ถ้าไม่มีก็ซ่อนตัวเล่นเสียงไปเฉย ๆ ไม่ขึ้น error

ข้อจำกัดของ Cloudflare Pages: **ไฟล์เดียวต้องไม่เกิน 25 MiB** ถ้าไฟล์ใหญ่กว่านั้นหรือมีไฟล์เยอะขึ้นมาก
ให้ย้ายไป object storage แล้วใส่ URL เต็มลงใน `audioFile` ได้เลย `prayerAudioUrl()` รองรับทั้งสองแบบ

ไฟล์ในโฟลเดอร์นี้ **ไม่ถูก precache** โดย service worker ตั้งใจให้โหลดตอนกดเล่นเท่านั้น
