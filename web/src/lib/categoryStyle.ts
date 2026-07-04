const CATEGORY_ICONS = [
  'restaurant', 'shopping_cart', 'home', 'directions_car', 'local_hospital',
  'school', 'flight', 'fitness_center', 'pets', 'phone_android',
  'electric_bolt', 'water_drop', 'checkroom', 'movie', 'child_care',
  'savings', 'account_balance', 'work', 'card_giftcard', 'coffee',
];

const CATEGORY_COLORS = [
  '#1E3A8A', '#059669', '#DC2626', '#FBBF24', '#8B5CF6',
  '#2563EB', '#EC4899', '#6B7280', '#0D9488', '#172554',
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
