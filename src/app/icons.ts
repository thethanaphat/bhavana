type IconName = 'lotus' | 'walk' | 'chant' | 'book' | 'chart' | 'settings' | 'arrow' | 'clock' | 'bell' | 'sound' | 'back' | 'close' | 'leaf';

const paths: Record<IconName, string> = {
  lotus: '<path d="M12 3c-3 3.2-4.5 6-4.5 8.5 0 3 1.8 5.2 4.5 6.5 2.7-1.3 4.5-3.5 4.5-6.5C16.5 9 15 6.2 12 3Z"/><path d="M6.8 8C3.8 9.2 2 11.5 2 14c0 3.5 3.4 6 10 6s10-2.5 10-6c0-2.5-1.8-4.8-4.8-6M3 21h18"/>',
  walk: '<circle cx="13" cy="3.8" r="1.8"/><path d="m10.5 8-2.7 4.2 3.6 2.2-2.9 6.1M12.1 8.2l3.4 3.4 3.3.6M12.5 10.7l1.1 4.8 4.5 5"/>',
  chant: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 1V4.5Zm0 0a3 3 0 0 0-3 3V20a2 2 0 0 0 2 2h14M8 9h7M8 12.5h6"/>',
  book: '<path d="M12 6.5C9 4.8 5.5 4.5 2 5v13c3.5-.5 7 .1 10 1.8 3-1.7 6.5-2.3 10-1.8V5c-3.5-.5-7 0-10 1.5Zm0 0v13.3"/>',
  chart: '<path d="M3 21h18M6 17v-5m6 5V7m6 10V4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  bell: '<path d="M5 17h14c-1.5-1.5-2-3-2-5V9a5 5 0 0 0-10 0v3c0 2-.5 3.5-2 5Zm5 3h4"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4Zm13-1a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
  close: '<path d="M5 5 19 19M19 5 5 19"/>',
  leaf: '<path d="M20 4c-9 0-15 3-15 10a6 6 0 0 0 6 6c7 0 10-6 9-16ZM5 20c2-4 6-7 11-10"/>',
};

export function icon(name: IconName, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
