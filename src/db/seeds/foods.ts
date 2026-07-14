export interface SeedFood {
  id: string;
  source: 'usda' | 'off' | 'user';
  sourceId: string;
  barcode?: string;
  name: string;
  brand?: string;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbPer100g: number;
  fiberPer100g: number;
  servings: {
    label: string;
    grams: number;
    isDefault: boolean;
  }[];
}

export const SEED_FOODS: SeedFood[] = [
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567801',
    source: 'usda',
    sourceId: '172186',
    name: 'Chicken Breast (Boneless, Skinless, Cooked)',
    kcalPer100g: 165,
    proteinPer100g: 31.0,
    fatPer100g: 3.6,
    carbPer100g: 0.0,
    fiberPer100g: 0.0,
    servings: [
      { label: '100g', grams: 100, isDefault: true },
      { label: '1 breast (approx 172g)', grams: 172, isDefault: false },
      { label: '1 oz', grams: 28.35, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567802',
    source: 'usda',
    sourceId: '171287',
    name: 'Whole Egg (Cooked)',
    kcalPer100g: 143,
    proteinPer100g: 12.6,
    fatPer100g: 9.5,
    carbPer100g: 0.7,
    fiberPer100g: 0.0,
    servings: [
      { label: '1 large (50g)', grams: 50, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567803',
    source: 'usda',
    sourceId: '173944',
    name: 'Egg Whites (Raw)',
    kcalPer100g: 52,
    proteinPer100g: 10.9,
    fatPer100g: 0.2,
    carbPer100g: 0.7,
    fiberPer100g: 0.0,
    servings: [
      { label: '1 large egg white (33g)', grams: 33, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
      { label: '1 cup (243g)', grams: 243, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567804',
    source: 'usda',
    sourceId: '173903',
    name: 'Oatmeal (Rolled Oats, Raw)',
    kcalPer100g: 379,
    proteinPer100g: 13.2,
    fatPer100g: 6.5,
    carbPer100g: 67.7,
    fiberPer100g: 10.1,
    servings: [
      { label: '1 cup (81g)', grams: 81, isDefault: true },
      { label: '1/2 cup (40g)', grams: 40, isDefault: false },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567805',
    source: 'usda',
    sourceId: '173910',
    name: 'Banana (Raw)',
    kcalPer100g: 89,
    proteinPer100g: 1.1,
    fatPer100g: 0.3,
    carbPer100g: 22.8,
    fiberPer100g: 2.6,
    servings: [
      { label: '1 medium (118g)', grams: 118, isDefault: true },
      { label: '1 large (136g)', grams: 136, isDefault: false },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567806',
    source: 'usda',
    sourceId: '169757',
    name: 'White Rice (Jasmine, Cooked)',
    kcalPer100g: 130,
    proteinPer100g: 2.7,
    fatPer100g: 0.3,
    carbPer100g: 28.2,
    fiberPer100g: 0.4,
    servings: [
      { label: '1 cup (158g)', grams: 158, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567807',
    source: 'usda',
    sourceId: '169707',
    name: 'Brown Rice (Cooked)',
    kcalPer100g: 111,
    proteinPer100g: 2.6,
    fatPer100g: 0.9,
    carbPer100g: 23.0,
    fiberPer100g: 1.8,
    servings: [
      { label: '1 cup (195g)', grams: 195, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567808',
    source: 'usda',
    sourceId: '170567',
    name: 'Whey Protein Powder (Vanilla/Chocolate)',
    brand: 'Standard Gold',
    kcalPer100g: 387,
    proteinPer100g: 77.4,
    fatPer100g: 4.8,
    carbPer100g: 9.7,
    fiberPer100g: 0.0,
    servings: [
      { label: '1 scoop (31g)', grams: 31, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567809',
    source: 'usda',
    sourceId: '170589',
    name: 'Salmon Fillet (Atlantic, Raw)',
    kcalPer100g: 208,
    proteinPer100g: 20.4,
    fatPer100g: 13.4,
    carbPer100g: 0.0,
    fiberPer100g: 0.0,
    servings: [
      { label: '1 fillet (150g)', grams: 150, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567810',
    source: 'usda',
    sourceId: '170570',
    name: 'Almonds (Whole, Raw)',
    kcalPer100g: 579,
    proteinPer100g: 21.2,
    fatPer100g: 49.9,
    carbPer100g: 21.6,
    fiberPer100g: 12.5,
    servings: [
      { label: '1 serving (28g)', grams: 28, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567811',
    source: 'usda',
    sourceId: '171688',
    name: 'Sweet Potato (Raw)',
    kcalPer100g: 86,
    proteinPer100g: 1.6,
    fatPer100g: 0.1,
    carbPer100g: 20.1,
    fiberPer100g: 3.0,
    servings: [
      { label: '1 medium (130g)', grams: 130, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567812',
    source: 'off',
    sourceId: '0041220516104',
    barcode: '0041220516104',
    name: 'H-E-B Creamy Peanut Butter',
    brand: 'H-E-B',
    kcalPer100g: 594,
    proteinPer100g: 25.0,
    fatPer100g: 50.0,
    carbPer100g: 18.8,
    fiberPer100g: 6.2,
    servings: [
      { label: '2 tbsp (32g)', grams: 32, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  },
  {
    id: 'f1e6b8a1-6302-4752-9e8c-a123e4567813',
    source: 'off',
    sourceId: '3017620422003',
    barcode: '3017620422003',
    name: 'Nutella Hazelnut Spread',
    brand: 'Ferrero',
    kcalPer100g: 539,
    proteinPer100g: 6.3,
    fatPer100g: 30.9,
    carbPer100g: 57.5,
    fiberPer100g: 0.0,
    servings: [
      { label: '1 tbsp (15g)', grams: 15, isDefault: true },
      { label: '100g', grams: 100, isDefault: false },
    ],
  }
];
