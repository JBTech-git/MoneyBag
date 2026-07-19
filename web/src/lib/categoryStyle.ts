const CATEGORY_ICONS = [
  'restaurant', 'shopping_cart', 'home', 'directions_car', 'local_hospital',
  'school', 'flight', 'fitness_center', 'pets', 'phone_android',
  'electric_bolt', 'water_drop', 'checkroom', 'movie', 'child_care',
  'savings', 'account_balance', 'work', 'card_giftcard', 'coffee',
];

const CATEGORY_COLORS = [
  '#0F766E', '#BE123C', '#0369A1', '#B45309', '#7C3AED',
  '#0D9488', '#DB2777', '#475569', '#15803D', '#115E59',
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function categoryStyle(name: string) {
  const h = hashName(name || 'other');
  return {
    icon: CATEGORY_ICONS[h % CATEGORY_ICONS.length],
    color: CATEGORY_COLORS[h % CATEGORY_COLORS.length],
  };
}
