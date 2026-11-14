import { getLang, t, tf } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import type { Site } from '../../../sim/types';
import styles from './SiteCard.module.css';

interface Props {
  site: Site;
  selected: boolean;
  onSelect: (siteId: string) => void;
}

export function formatCoord(lat: number, lon: number, lang = getLang()): string {
  return tf(
    'plan.coord',
    {
      lat: formatNumber(Math.abs(lat), lang, 2),
      ns: t(lat < 0 ? 'plan.coordS' : 'plan.coordN', lang),
      lon: formatNumber(Math.abs(lon), lang, 2),
      ew: t(lon < 0 ? 'plan.coordW' : 'plan.coordE', lang),
    },
    lang,
  );
}

export function SiteCard({ site, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(site.id)}
    >
      <span className={styles.name}>{site.name}</span>
      <span className={styles.coords}>{formatCoord(site.lat, site.lon)}</span>
    </button>
  );
}
