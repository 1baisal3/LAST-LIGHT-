export const ru = {
  'app.title': 'LAST LIGHT',
  'plan.title': 'План миссии',
  'verdict.ok': 'Аппарат выживет',
  'verdict.fail': 'Аппарат не выживет',
  'timeline.title': 'Таймлайн',
  'why.title': 'Почему',
  'scene.title': 'Сцена',
  'demo.badge': 'DEMO DATA',
  'data.loading': 'Загружаем данные',
  'data.error': 'Не удалось загрузить данные',
  'data.retry': 'Повторить',
  'data.errNetwork': 'Нет связи с сервером. Проверьте адрес API.',
  'data.errStatus': 'Сервер ответил ошибкой {status}.',
  'data.errUnknown': 'Неизвестная ошибка.',
} as const;

export type MessageKey = keyof typeof ru;
