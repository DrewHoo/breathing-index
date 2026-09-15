import { describe, expect, it } from 'vitest'
import { VARIABLE_LABELS } from '../ui/labels'
import {
  GLOSSARY,
  GLOSSARY_ORDER,
  breathingBullets,
  glossaryHref,
  glossaryKeyFor,
  sourceBullets,
  type GlossaryKey,
} from './glossary'

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
 *
 * Module scope because the page titles and descriptions obey it too, and they
 * are checked in their own block.
 */
const SPEAKS_ABOUT_TODAY = /\b(you|your)\b[^.!?]*\b(today|your day|right now|tonight|this afternoon)\b/i

describe('the entries', () => {
  it('has a name and a breathing paragraph on every entry, and no blank part', () => {
    // Both surfaces render a labelled paragraph per part the entry carries. A
    // part may be left out (Sick has one worth reading); a part that is
    // present and blank is a heading over nothing.
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      expect(entry.name.trim(), `${key}.name`).not.toBe('')
      expect(entry.breathing.trim(), `${key}.breathing`).not.toBe('')
      for (const field of ['what', 'window', 'source'] as const) {
        const part = entry[field]
        if (part !== undefined) expect(part.trim(), `${key}.${field}`).not.toBe('')
      }
    }
  })

  it('names a symbol in English the first time it uses one', () => {
    // Drew's rule: the symbol is fine, the English word rides in parentheses.
    // Checked for the three symbols the copy actually uses.
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      const text = [entry.what, entry.breathing, entry.window, entry.source].filter(Boolean).join(' ')
      const symbols: [string, string][] = [['µm', 'micrometers'], ['µg/m³', 'micrograms'], ['ppm', 'parts per million']]
      for (const [symbol, word] of symbols) {
        if (text.includes(symbol)) expect(text, `${key} uses ${symbol} without ${word}`).toContain(word)
      }
      expect(text, `${key} says "mean" where "average" is the word`).not.toMatch(/\bmean\b/)
      // The table's units, never a chemist's.
      expect(text, `${key} uses ppm or ppb`).not.toMatch(/\bpp[mb]\b/)
      // Nothing specific to one reader or one town.
      expect(text, `${key} names a place or says "here"`).not.toMatch(/Connecticut|Hamden|\bhere\b/)
    }
  })

  it('says how likely, what helps, and how the index measures it', () => {
    // Drew's rules of 2026-09-14: a breathing paragraph carries the odds and
    // the remedy, not just the mechanism, and the window part reads as an
    // answer about the index ("Your Breathing Index uses the average of the
    // last 8 hours ... since ..."), with its reason attached.
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      expect(entry.breathing, `${key} says what helps`).toContain('What helps:')
      if (key !== 'viral') expect(entry.breathing, `${key} says how likely`).toContain('How likely:')
      if (entry.window !== undefined) {
        expect(entry.window, `${key} window starts with the index`).toMatch(/^Your Breathing Index /)
        expect(entry.window, `${key} window gives a reason`).toMatch(/\b(since|because|there isn’t a cumulative)\b/)
      }
    }
  })

  it('draws the breathing part as Evidence / How likely / What helps bullets', () => {
    for (const key of GLOSSARY_ORDER) {
      const bullets = breathingBullets(GLOSSARY[key])
      const leads = bullets.map((b) => b.lead)
      expect(leads[0], `${key} leads with evidence`).toBe('Evidence')
      expect(leads, `${key} says what helps`).toContain('What helps')
      if (key !== 'viral') expect(leads, `${key} says how likely`).toContain('How likely')
      // No bullet is blank, and the split lost no words (case aside: a bullet
      // capitalizes the word after its lead).
      const joined = bullets.map((b) => b.text.toLowerCase()).join(' ')
      for (const word of GLOSSARY[key].breathing.replace(/How likely:|What helps:/g, '').split(/\s+/)) {
        expect(joined, `${key} keeps "${word}"`).toContain(word.toLowerCase())
      }
    }
  })

  it('splits a monitor-or-model source into two bullets and leaves the rest whole', () => {
    expect(sourceBullets(GLOSSARY.pm25)).toHaveLength(2)
    expect(sourceBullets(GLOSSARY.pm25)[0]).toMatch(/^A monitor/)
    expect(sourceBullets(GLOSSARY.pm25)[1]).toMatch(/^Otherwise a model:/)
    // The trailing caveat rides with the model, not as a third bullet.
    expect(sourceBullets(GLOSSARY.o3)[1]).toContain('runs high')
    expect(sourceBullets(GLOSSARY.mold)).toHaveLength(1)
    expect(sourceBullets(GLOSSARY.viral)).toEqual([])
  })

  // Vite resolves the glob at build time, so this is the directory as it is,
  // without Node's fs (the test config has no Node types).
  const PHOTOS_ON_DISK = Object.keys(import.meta.glob('../../public/glossary/img/*.jpg')).map(
    (path) => path.slice(path.lastIndexOf('/') + 1),
  )

  it('has a photograph on disk and a credited caption for every thing in the air', () => {
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      if (key === 'viral') {
        expect(entry.image, 'Sick is not a thing in the air').toBeUndefined()
        continue
      }
      expect(entry.image, `${key} has a photo`).toBeDefined()
      expect(entry.meta, `${key} has a meta line`).toBeDefined()
      expect(PHOTOS_ON_DISK, `${key} photo file`).toContain(entry.image!.src)
      // A credit is a name or an agency plus the license or "public domain".
      expect(entry.image!.caption, `${key} caption carries a license`).toMatch(/public domain|CC BY/)
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
  it('never puts a second person and a "now" in one sentence', () => {
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      const text = [entry.what, entry.breathing, entry.window, entry.source].filter(Boolean).join(' ')
      expect(text, `${key} speaks about the reader's day`).not.toMatch(SPEAKS_ABOUT_TODAY)
    }
  })
})

describe('the page each entry gets', () => {
  /**
   * specs/36-glossary-pages.md: one page per thing in the air, at a URL that
   * reads as the question somebody types. `slug`, `title` and `description`
   * are page metadata rather than entry copy — the part rules do not reach
   * them — but a broken one is a page that ranks for nothing, and only the
   * generator would ever notice.
   */

  // Vite inlines the file at build time, so the sitemap can be read without
  // Node's fs (the test config has no Node types), the same trick the photo
  // check uses on the image directory.
  const SITEMAP = Object.values(
    import.meta.glob('../../public/sitemap.xml', { query: '?raw', import: 'default', eager: true }),
  )[0] as string

  it('has a slug that can be both a directory and a URL', () => {
    for (const key of GLOSSARY_ORDER) {
      expect(GLOSSARY[key].slug, `${key} slug`).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(glossaryHref(key), `${key} href`).toBe(`/glossary/${GLOSSARY[key].slug}/`)
    }
  })

  it('gives every entry a slug of its own', () => {
    const slugs = GLOSSARY_ORDER.map((key) => GLOSSARY[key].slug)
    expect(new Set(slugs).size, slugs.join(' ')).toBe(slugs.length)
  })

  it('keeps the title and the description inside what a search result shows', () => {
    for (const key of GLOSSARY_ORDER) {
      const entry = GLOSSARY[key]
      // The site name the generator appends is part of what gets cut off.
      expect(`${entry.title} — Breathing Index`.length, `${key} title`).toBeLessThanOrEqual(60)
      expect(entry.description.trim(), `${key} description`).not.toBe('')
      expect(entry.description.length, `${key} description`).toBeLessThan(155)
      expect(`${entry.title} ${entry.description}`, `${key} speaks about the reader's day`).not.toMatch(
        SPEAKS_ABOUT_TODAY,
      )
    }
  })

  it('lists every page in the sitemap', () => {
    // The sitemap is written by hand and the slugs are not, so this is the
    // only thing standing between a rename and a URL that 404s in Search
    // Console.
    for (const key of GLOSSARY_ORDER) {
      expect(SITEMAP, `${key} is missing from public/sitemap.xml`).toContain(
        `<loc>https://breathingindex.com${glossaryHref(key)}</loc>`,
      )
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
      ['pm_coarse', 'pm_coarse'],
      ['pm10', 'pm_coarse'],
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
