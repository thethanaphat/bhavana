#!/bin/zsh
set -eu

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ต้องติดตั้ง Node.js และ npm ก่อนเปิดแอป"
  read -r '?กด Enter เพื่อปิดหน้าต่าง...'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "กำลังติดตั้งเครื่องมือที่แอปต้องใช้ครั้งแรก..."
  npm install
fi

echo "กำลังเปิดภาวนาที่ http://127.0.0.1:5173/"
echo "รอหน้าแอปเปิดในเบราว์เซอร์ แล้วเปิด Terminal หน้าต่างนี้ค้างไว้ระหว่างดูแอป"
echo "เมื่อเลิกดู ให้คลิกหน้าต่าง Terminal แล้วกด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์ (จะไม่มีหน้าใหม่เปิดขึ้น)"

(
  for attempt in {1..30}; do
    if curl --silent --fail http://127.0.0.1:5173/ >/dev/null; then
      open http://127.0.0.1:5173/
      exit 0
    fi
    sleep 1
  done
  echo "เปิดแอปไม่สำเร็จ โปรดดูข้อความผิดพลาดใน Terminal"
) &

exec npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
