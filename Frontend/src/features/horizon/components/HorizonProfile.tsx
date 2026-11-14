import { useMemo, useState, type KeyboardEvent } from 'react';
import { useAppSelector } from '../../../app/store';
import { horizonAt } from '../../../sim/horizon';
import { getLang, t, tf, type Lang } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import {
  bodiesAt,
  elevationRange,
  profileLine,
  profileNodes,
  profileOf,
  stepAzimuth,
  sunPath,
  type BodyAt,
} from '../horizonModel';
import { HorizonChart } from './HorizonChart';
import styles from './HorizonProfile.module.css';
import { HorizonTable } from './HorizonTable';

function bodyLine(name: string, body: BodyAt, lang: Lang): string {
  return tf(
    'horizon.bodyLine',
    {
      body: name,
      az: formatNumber(body.az, lang, 1),
      el: formatNumber(body.el, lang, 1),
      terrain: formatNumber(body.terrainEl, lang, 1),
      state: t(body.visible ? 'horizon.visible' : 'horizon.hidden', lang),
    },
    lang,
  );
}

export function HorizonProfile() {
  const lang = getLang();
  const result = useAppSelector((state) => state.result.result);
  const plan = useAppSelector((state) => state.plan.plan);
  const dataset = useAppSelector((state) => state.dataset.dataset);
  const selectedHour = useAppSelector((state) => state.view.selectedHour);
  const [cursorAz, setCursorAz] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const site = dataset?.sites.sites.find((item) => item.id === plan.siteId) ?? null;
  const profile = useMemo(() => {
    if (!site) return null;
    try {
      return profileOf(site, plan);
    } catch {
      return null;
    }
  }, [site, plan]);
  const line = useMemo(() => (profile ? profileLine(profile) : []), [profile]);
  const path = useMemo(
    () => (site ? sunPath(site, plan.startIndex, plan.durationH) : []),
    [site, plan.startIndex, plan.durationH],
  );

  const title = t('horizon.title', lang);
  const bodies = site && profile ? bodiesAt(site, plan, selectedHour) : null;

  if (!result || !site || !profile || !bodies) {
    return (
      <section className={styles.horizon} aria-label={title}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.muted}>{t('horizon.empty', lang)}</p>
      </section>
    );
  }

  const range = elevationRange([
    ...profile,
    ...path.flat().map((point) => point.el),
    bodies.sun.el,
    bodies.earth.el,
  ]);
  const sunText = bodyLine(t('horizon.sun', lang), bodies.sun, lang);
  const earthText = bodyLine(t('horizon.earth', lang), bodies.earth, lang);
  const cursorText =
    cursorAz === null
      ? null
      : tf(
          'horizon.cursor',
          {
            az: formatNumber(cursorAz, lang),
            terrain: formatNumber(horizonAt(profile, cursorAz), lang, 1),
          },
          lang,
        );

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const next = stepAzimuth(cursorAz ?? 180, event.key);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setCursorAz(next);
  };

  return (
    <section className={styles.horizon} aria-label={title}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={asTable}
          onClick={() => setAsTable((value) => !value)}
        >
          {t(asTable ? 'horizon.showChart' : 'horizon.showTable', lang)}
        </button>
      </div>
      {asTable ? (
        <HorizonTable nodes={profileNodes(profile)} bodies={bodies} lang={lang} />
      ) : (
        <HorizonChart
          line={line}
          path={path}
          bodies={bodies}
          range={range}
          cursorAz={cursorAz}
          labels={{
            aria: `${title}. ${sunText}. ${earthText}`,
            directions: [
              t('horizon.dirN', lang),
              t('horizon.dirE', lang),
              t('horizon.dirS', lang),
              t('horizon.dirW', lang),
            ],
            cursor: cursorText,
          }}
          onCursor={setCursorAz}
          onKey={onKey}
        />
      )}
      <ul className={styles.summary} aria-live="polite">
        <li>{sunText}</li>
        <li>{earthText}</li>
      </ul>
      <p className={styles.muted}>{t('horizon.caption', lang)}</p>
    </section>
  );
}
