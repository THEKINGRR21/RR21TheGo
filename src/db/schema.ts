import { pgTable, uuid, text, date, numeric, integer, boolean, timestamp, customType, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Custom types for citext and tsvector
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

// 1. Users Table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  authSubject: text('auth_subject').unique().notNull(),
  email: citext('email').unique().notNull(),
  displayName: text('display_name'),
  sexAtBirth: text('sex_at_birth', { enum: ['male', 'female'] }),
  birthDate: date('birth_date').notNull(),
  heightCm: numeric('height_cm', { precision: 5, scale: 1 }),
  units: text('units', { enum: ['metric', 'imperial'] }).notNull().default('metric'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 2. Targets Table
export const targets = pgTable('targets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  effectiveFrom: date('effective_from').notNull(),
  kcal: integer('kcal').notNull(),
  proteinG: integer('protein_g').notNull(),
  fatG: integer('fat_g').notNull(),
  carbG: integer('carb_g').notNull(),
  basis: text('basis', { enum: ['estimated', 'calibrated', 'manual'] }).notNull(),
  bmrKcal: integer('bmr_kcal'),
  tdeeKcal: integer('tdee_kcal'),
  formula: text('formula'),
  rationale: text('rationale').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 3. Body Metrics Table
export const bodyMetrics = pgTable('body_metrics', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  measuredOn: date('measured_on').notNull(),
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
  bodyFatPct: numeric('body_fat_pct', { precision: 4, scale: 1 }),
  leanMassKg: numeric('lean_mass_kg', { precision: 5, scale: 2 }),
  source: text('source', { enum: ['manual', 'inbody', 'dexa', 'scale'] }).notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('body_metrics_user_measured_source_idx').on(table.userId, table.measuredOn, table.source)
]);

// 4. Foods Table
export const foods = pgTable('foods', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  source: text('source', { enum: ['usda', 'off', 'user'] }).notNull(),
  sourceId: text('source_id'),
  barcode: text('barcode'),
  name: text('name').notNull(),
  brand: text('brand'),
  kcalPer100g: numeric('kcal_per_100g', { precision: 7, scale: 2 }).notNull(),
  proteinPer100g: numeric('protein_per_100g', { precision: 6, scale: 2 }),
  fatPer100g: numeric('fat_per_100g', { precision: 6, scale: 2 }),
  carbPer100g: numeric('carb_per_100g', { precision: 6, scale: 2 }),
  fiberPer100g: numeric('fiber_per_100g', { precision: 6, scale: 2 }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  searchVector: tsvector('search_vector'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('foods_source_source_id_idx').on(table.source, table.sourceId),
  index('foods_barcode_idx').on(table.barcode).where(sql`barcode is not null`),
  index('foods_search_vector_idx').using('gin', table.searchVector)
]);

// 5. Food Servings Table
export const foodServings = pgTable('food_servings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  foodId: uuid('food_id').notNull().references(() => foods.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  grams: numeric('grams', { precision: 7, scale: 2 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

// 6. Entries Table
export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  foodId: uuid('food_id').notNull().references(() => foods.id),
  loggedFor: date('logged_for').notNull(),
  meal: text('meal', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }),
  grams: numeric('grams', { precision: 7, scale: 2 }).notNull(),
  kcal: numeric('kcal', { precision: 7, scale: 2 }).notNull(),
  proteinG: numeric('protein_g', { precision: 6, scale: 2 }),
  fatG: numeric('fat_g', { precision: 6, scale: 2 }),
  carbG: numeric('carb_g', { precision: 6, scale: 2 }),
  clientId: text('client_id').notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('entries_user_client_idx').on(table.userId, table.clientId),
  index('entries_user_logged_for_idx').on(table.userId, table.loggedFor)
]);
