import { useEffect, useRef } from 'react';
import { t, type Lang } from '../../../shared/i18n';
import { formatPct, formatUtc } from '../../../shared/lib/format';
import type { Result } from '../../../sim/types';
import { batterySeries, positionTime } from '../timelineModel';
import styles from './TimelineTable.module.css';

interface Props {
  result: Result;
  initialPct: number;
  position: number;
  windowStart: string;
  startIndex: number;
  lang: Lang;
}

export function TimelineTable({ result, initialPct, position, windowStart, startIndex, lang }: Props) {
  const currentRef = useRef<HTMLTableRowElement>(null);
  const series = batterySeries(result, initialPct);
  const seen = (flag: boolean | undefined) =>
    flag === undefined ? '—' : t(flag ? 'timeline.tableSeen' : 'timeline.tableHidden', lang);

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [position]);

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{t('timeline.tableCaption', lang)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('timeline.tableHour', lang)}</th>
            <th scope="col">{t('timeline.tableTime', lang)}</th>
            <th scope="col">{t('timeline.sun', lang)}</th>
            <th scope="col">{t('timeline.earth', lang)}</th>
            <th scope="col">{t('timeline.tableCharge', lang)}</th>
            <th scope="col">{t('timeline.tableFailure', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((charge, index) => {
            const interval = result.hours[index];
            const failure = result.failure && result.failure.hour === index ? result.failure.reason : null;
            const current = index === position;
            return (
              <tr
                key={index}
                ref={current ? currentRef : undefined}
                className={current ? styles.current : undefined}
                aria-current={current ? 'true' : undefined}
              >
                <th scope="row">{index}</th>
                <td>{formatUtc(positionTime(windowStart, startIndex, index), lang)}</td>
                <td>{seen(interval?.sunlit)}</td>
                <td>{seen(interval?.earthVisible)}</td>
                <td>{formatPct(charge, lang, 1)}</td>
                <td className={failure ? styles.fail : undefined}>
                  {failure ? t(failure === 'earth' ? 'verdict.reasonEarth' : 'verdict.reasonBattery', lang) : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
