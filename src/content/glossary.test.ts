import { describe, expect, it } from 'vitest'
import { VARIABLE_LABELS } from '../ui/labels'
import { GLOSSARY, GLOSSARY_ORDER, glossaryKeyFor, type GlossaryKey } from './glossary'

describe('the entries', () => {
  it('has all five parts on every entry, none of them blank', () => {
    // The page renders five labelled paragraphs per section and the sheet
    // renders the same five. A blank one is a heading over nothing.
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      for (const field of ['name', 'what', 'breathing', 'window', 'source', 'verdicts'] as const) {
        expect(entry[field].trim(), `${key}.${field}`).not.toBe('')
      }
    }
  })

  it('orders every entry exactly once', () => {
    // GLOSSARY_ORDER is what the generator walks, so an entry missing from it
    // exists in the module and on no surface at all.
    expect([...GLOSSARY_ORDER].sort()).toEqual((Object.keys(GLOSSARY) as GlossaryKey[]).sort())
    expect(new Set(GLOSSARY_ORDER).size).toBe(GLOSSARY_ORDER.length)
  })
})

describe('what the text may not say', () => {
  /**
   * The rule from specs/30-glossary.md §5: the glossary explains a mechanism
   * at the population level and never speaks about the reader's own day. The
   * home screen refuses to name a cause for today; a glossary that said "this
   * is why you feel bad right now" would undo that from the side door.
   *
   * A regex cannot check a rule like this, so this is a tripwire and not a
   * proof: it catches the phrasing that actually tempts a writer — a second
   * person and a *now* in the same sentence. Prose that reads as advice about
   * today without tripping it is still a bug; this just makes the obvious
   * version loud.
   */
  const SPEAKS_ABOUT_TODAY = /\b(you|your)\b[^.!?]*\b(today|your day|right now|tonight|this afternoon)\b/i

  it('never puts a second person and a "now" in one sentence', () => {
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      const text = [entry.what, entry.breathing, entry.window, entry.source, entry.verdicts].join(' ')
      expect(text, `${key} speaks about the reader's day`).not.toMatch(SPEAKS_ABOUT_TODAY)
    }
  })
})

describe('glossaryKeyFor', () => {
  it('resolves every variable that still has a live row', () => {
    // Listed by hand rather than derived: the point of the test is that a
    // variable the app shows somewhere has somewhere to send a reader, and a
    // list derived from the same table the function reads would agree with
    // itself no matter what broke.
    const live: [string, GlossaryKey][] = [
      ['pm25', 'pm25'],
      ['o3', 'o3'],
      ['so2', 'so2'],
      ['pm10', 'pm10'],
      ['smoke', 'smoke'],
      ['mold', 'mold'],
      ['mold_alternaria', 'mold'],
      ['mold_cladosporium', 'mold'],
      ['dry_spore_index', 'dry_spore_index'],
      ['pollen_graminales', 'pollen_grass'],
      ['pollen_oak', 'pollen_tree'],
      ['pollen_ragweed', 'pollen_weed'],
      ['dry_air', 'dewpoint'],
      ['humid_heat', 'dewpoint'],
      ['viral', 'viral'],
    ]
    for (const [variable, key] of live) {
      expect(VARIABLE_LABELS[variable], `${variable} has no label`).toBeDefined()
      expect(glossaryKeyFor(variable), variable).toBe(key)
    }
  })

  it('has nothing to say about a retired variable', () => {
    // These keep their labels so an old diary entry renders as words, but
    // nothing in the air produces them any more. A `?` on one would promise an
    // explanation of a measurement the app stopped taking.
    for (const retired of [
      'no2',
      'co',
      'heat_stress',
      'cold_dry_stress',
      'humidity',
      'grass_pollen',
      'birch_pollen',
      'ragweed_pollen',
    ]) {
      expect(VARIABLE_LABELS[retired], `${retired} has no label`).toBeDefined()
      expect(glossaryKeyFor(retired), retired).toBeUndefined()
    }
  })
})
