import { describe, expect, it } from 'vitest';
import { messageOf } from './errors';

describe('messageOf', () => {
  it('describes a network failure', () => {
    expect(messageOf({ status: 'FETCH_ERROR', error: 'TypeError' })).toBe(
      'Нет связи с сервером. Проверьте адрес API.',
    );
  });

  it('describes an http status', () => {
    expect(messageOf({ status: 503, data: null })).toBe('Сервер ответил ошибкой 503.');
  });

  it('passes through the text of a validation error', () => {
    expect(messageOf({ name: 'Error', message: 'hours.length = count' })).toBe('hours.length = count');
    expect(messageOf(new Error('boom'))).toBe('boom');
  });

  it('falls back to a generic text', () => {
    expect(messageOf(undefined)).toBe('Неизвестная ошибка.');
  });
});
