import { defineConfig } from 'vite';

export default defineConfig({
  // ใช้เส้นทางแบบสัมพัทธ์ เพื่อให้ build ชุดเดียวใช้ได้ทั้งที่รากโดเมนและใต้ subpath
  // GitHub Pages เสิร์ฟ project site ที่ username.github.io/<repo>/ ซึ่งถ้าใช้ path แบบ
  // absolute ไฟล์ assets จะหาไม่เจอทั้งหมด  ค่านี้ยังทำงานถูกถ้าย้ายไปโฮสต์ที่รากภายหลัง
  base: './',
});
