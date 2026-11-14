import { getLang, tf, t } from '../i18n';


interface HttpLikeError {
  status: number | string;
  error?: string;
}

function isHttpLike(value: unknown): value is HttpLikeError {
  return typeof value === 'object' && value !== null && 'status' in value;
}

export function messageOf(error: unknown): string {
  const lang = getLang();
  if (isHttpLike(error)) {
    if (typeof error.status === 'number') {
      return tf('data.errStatus', { status: error.status }, lang);
    }
    if (error.status === 'FETCH_ERROR') return t('data.errNetwork', lang);
    if (error.status === 'PARSING_ERROR' && error.error) return error.error;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return t('data.errUnknown', lang);
}
