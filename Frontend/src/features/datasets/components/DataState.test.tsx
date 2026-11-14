import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataState } from './DataState';

function findButton(node: ReactNode): ReactElement<{ onClick?: () => void }> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (element.type === 'button') return element;
  return findButton(element.props?.children);
}

describe('DataState', () => {
  it('shows the loading text and skeletons without a retry button', () => {
    const html = renderToStaticMarkup(<DataState status="loading" />);
    expect(html).toContain('Загружаем данные');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('role="alert"');
  });

  it('shows the error text, the detail and a retry button', () => {
    const html = renderToStaticMarkup(<DataState status="error" message="sites.version: bad" onRetry={() => {}} />);
    expect(html).toContain('Не удалось загрузить данные');
    expect(html).toContain('sites.version: bad');
    expect(html).toContain('Повторить');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Загружаем данные');
  });

  it('omits the detail when there is no message', () => {
    const html = renderToStaticMarkup(<DataState status="error" onRetry={() => {}} />);
    expect(html).not.toContain('<p');
  });

  it('calls onRetry when the button is pressed', () => {
    let calls = 0;
    const tree = DataState({
      status: 'error',
      onRetry: () => {
        calls += 1;
      },
    });
    const button = findButton(tree);
    expect(button).toBeTruthy();
    button!.props.onClick!();
    expect(calls).toBe(1);
  });
});
