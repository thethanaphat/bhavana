import catalog from '../../content/prayers/catalog.json';
import itipisoText from '../../content/prayers/itipiso.txt?raw';
import bahungText from '../../content/prayers/bahung.txt?raw';
import millionaireText from '../../content/prayers/millionaire-chant.txt?raw';

const texts: Record<string, string> = {
  itipiso: itipisoText,
  bahung: bahungText,
  'millionaire-chant': millionaireText,
};

export interface Prayer {
  id: string;
  title: string;
  order: number;
  audioFile: string;
  text: string;
}

export const prayers: Prayer[] = [...catalog].sort((a, b) => a.order - b.order).map((prayer) => ({
  ...prayer,
  text: texts[prayer.id] ?? '',
}));

export function findPrayer(id: string): Prayer | undefined {
  return prayers.find((prayer) => prayer.id === id);
}
