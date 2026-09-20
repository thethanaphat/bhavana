export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    return entities[character];
  });
}

// ดาวน์โหลดผ่าน blob URL เพราะแอปไม่มีเซิร์ฟเวอร์ให้ยิงไฟล์กลับมา
// iOS Safari จะเปิดแผ่น "บันทึกลง Files" ให้เอง
export function downloadJson(value: unknown, fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
