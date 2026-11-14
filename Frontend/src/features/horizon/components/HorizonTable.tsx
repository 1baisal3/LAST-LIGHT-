import type { Lang } from '../../../shared/i18n';
import { t } from '../../../shared/i18n';
import { formatNumber } from '../../../shared/lib/format';
import type { BodiesAt, ProfileNode } from '../horizonModel';
import styles from './HorizonProfile.module.css';

interface Props {
  nodes: readonly ProfileNode[];
  bodies: BodiesAt;
  lang: Lang;
}

export function HorizonTable({ nodes, bodies, lang }: Props) {
  const num = (value: number) => formatNumber(value, lang, 1);
  const state = (visible: boolean) => t(visible ? 'horizon.visible' : 'horizon.hidden', lang);
  return (
    <div className={styles.tables}>
      <table className={styles.table}>
        <caption>{t('horizon.profileCaption', lang)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('horizon.colAz', lang)}</th>
            <th scope="col">{t('horizon.colTerrain', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.az}>
              <td>{num(node.az)}</td>
              <td>{num(node.el)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={styles.table}>
        <caption>{t('horizon.bodiesCaption', lang)}</caption>
        <thead>
          <tr>
            <th scope="col">{t('horizon.colBody', lang)}</th>
            <th scope="col">{t('horizon.colAz', lang)}</th>
            <th scope="col">{t('horizon.colEl', lang)}</th>
            <th scope="col">{t('horizon.colTerrain', lang)}</th>
            <th scope="col">{t('horizon.colState', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {(['sun', 'earth'] as const).map((key) => (
            <tr key={key} className={styles.current}>
              <th scope="row">{t(`horizon.${key}`, lang)}</th>
              <td>{num(bodies[key].az)}</td>
              <td>{num(bodies[key].el)}</td>
              <td>{num(bodies[key].terrainEl)}</td>
              <td>{state(bodies[key].visible)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
