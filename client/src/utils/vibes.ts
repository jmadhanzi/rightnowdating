import type { Vibe } from '@rightnow/shared';

export const VIBES: Record<Vibe, { emoji: string; label: string }> = {
  coffee: { emoji: '☕', label: 'Coffee' },
  drinks: { emoji: '🍺', label: 'Drinks' },
  walk: { emoji: '🚶', label: 'Walk' },
  food: { emoji: '🍕', label: 'Food' },
  explore: { emoji: '🌆', label: 'Explore' },
  late: { emoji: '🔥', label: 'Late' },
  spicy: { emoji: '🌶️', label: 'Spicy' },
};
