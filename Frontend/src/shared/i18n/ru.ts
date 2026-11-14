export const ru = {
  'app.title': 'LAST LIGHT',
  'plan.title': 'План миссии',
  'verdict.ok': 'Аппарат выживет',
  'verdict.fail': 'Аппарат не выживет',
  'timeline.title': 'Таймлайн',
  'why.title': 'Почему',
  'scene.title': 'Сцена',
  'demo.badge': 'DEMO DATA',
} as const;

export type MessageKey = keyof typeof ru;
