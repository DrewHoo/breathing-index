/**
 * The plant catalog: every species the Google Pollen API reports, each with
 * the exposure variable it becomes, the display name its row speaks, and the
 * type row it files under. Plants — not types — are the engine's variables,
 * because "allergic to oak, indifferent to juniper" is a real and common shape
 * of the disease, and a type-level number makes those two the same forever.
 * (The pair matters: specificity runs at the plant-family level, and close
 * cousins cross-react — most birch-allergic people react to oak too, and
 * birch vs alder is the same sensitization measured twice. Oak vs juniper is
 * a distinction the immune system actually makes.)
 * A code Google adds later and this table does not know is skipped entirely:
 * the engine may only reason about numbers the app can show and name.
 */

export type PollenTypeKey = 'tree' | 'grass' | 'weed'

export interface PollenPlant {
  variable: string
  name: string
  type: PollenTypeKey
}

/** Google plant code -> catalog entry. The API's documented species set. */
export const POLLEN_PLANTS: Record<string, PollenPlant> = {
  ALDER: { variable: 'pollen_alder', name: 'Alder', type: 'tree' },
  ASH: { variable: 'pollen_ash', name: 'Ash', type: 'tree' },
  BIRCH: { variable: 'pollen_birch', name: 'Birch', type: 'tree' },
  COTTONWOOD: { variable: 'pollen_cottonwood', name: 'Cottonwood', type: 'tree' },
  ELM: { variable: 'pollen_elm', name: 'Elm', type: 'tree' },
  HAZEL: { variable: 'pollen_hazel', name: 'Hazel', type: 'tree' },
  JAPANESE_CEDAR: { variable: 'pollen_japanese_cedar', name: 'Japanese cedar', type: 'tree' },
  JAPANESE_CYPRESS: { variable: 'pollen_japanese_cypress', name: 'Japanese cypress', type: 'tree' },
  JUNIPER: { variable: 'pollen_juniper', name: 'Juniper', type: 'tree' },
  MAPLE: { variable: 'pollen_maple', name: 'Maple', type: 'tree' },
  OAK: { variable: 'pollen_oak', name: 'Oak', type: 'tree' },
  OLIVE: { variable: 'pollen_olive', name: 'Olive', type: 'tree' },
  PINE: { variable: 'pollen_pine', name: 'Pine', type: 'tree' },
  CYPRESS_PINE: { variable: 'pollen_cypress_pine', name: 'Cypress pine', type: 'tree' },
  GRAMINALES: { variable: 'pollen_graminales', name: 'Grasses', type: 'grass' },
  RAGWEED: { variable: 'pollen_ragweed', name: 'Ragweed', type: 'weed' },
  MUGWORT: { variable: 'pollen_mugwort', name: 'Mugwort', type: 'weed' },
}

/** variable -> catalog entry, for everything keyed by exposure variable. */
export const PLANT_BY_VARIABLE: Record<string, PollenPlant> = Object.fromEntries(
  Object.values(POLLEN_PLANTS).map((p) => [p.variable, p]),
)

export const POLLEN_PLANT_VARIABLES: readonly string[] = Object.values(POLLEN_PLANTS).map(
  (p) => p.variable,
)

/** Every pollen variable, either generation, for "is this pollen" checks. */
export const isPollenVariable = (variable: string): boolean =>
  variable.startsWith('pollen_') || variable.endsWith('_pollen')
