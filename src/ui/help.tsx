import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  GLOSSARY,
  GLOSSARY_PARTS,
  breathingBullets,
  glossaryHref,
  sourceBullets,
  type GlossaryEntry,
  type GlossaryKey,
  type GlossaryPart,
} from '../content/glossary'
import { DISCLAIMER } from './labels'

/**
 * The `?` on a row and the sheet it opens (specs/30-glossary.md §3).
 *
 * The app names eleven things in the air and, until this, explained none of
 * them. The two surfaces that now do are one text: the sheet renders
 * `src/content/glossary.ts` directly and `/glossary` is generated from the
 * same module, so a reader who taps the `?` and a reader who lands on the page
 * from a search get the same words.
 *
 * A native `<dialog>` rather than a popover or a component: it brings the
 * modal behaviour this needs — Escape, a backdrop, focus trapping, the top
 * layer — without a dependency, and the only thing left to write is where it
 * sits on the screen.
 */

/**
 * The one sheet a route mounts, and the buttons that open it. A hook because
 * the two halves have to share the open key and there is exactly one sheet per
 * screen: a dialog per row would be eleven modals in the DOM to show one.
 *
 * Returns the button as a call rather than a component so a caller writes
 * `{help('pm25', row.name)}` inside a row it is already building, and cannot
 * forget to mount the sheet — the sheet is the other half of the same return.
 */
export function useGlossaryHelp(): {
  help: (key: GlossaryKey, name?: string) => ReactElement
  sheet: ReactElement
} {
  const [openKey, setOpenKey] = useState<GlossaryKey | null>(null)
  const help = useCallback(
    (key: GlossaryKey, name?: string) => (
      <HelpButton glossaryKey={key} name={name} onOpen={setOpenKey} />
    ),
    [],
  )
  return {
    help,
    sheet: <HelpSheet entryKey={openKey} onClose={() => setOpenKey(null)} />,
  }
}

/**
 * A faint circled question mark in the sub-label register: it sits beside a
 * name that already has a number and a verdict competing for the row, and the
 * one thing it must not do is read as the row's point.
 *
 * The 44 px target (specs/11-ui-polish.md) is bought with padding and handed
 * back with margin, so the thing a thumb can hit is 44 px and the thing the
 * layout sees is the 14 px mark. Sizing the mark itself to 44 px would put a
 * dinner plate next to "Fine particles".
 *
 * The accessible name is the *row's* name where the caller has one, not the
 * entry's: two rows can share an entry — "Dry air" and "Humid heat" are both
 * the dew point — and two buttons in one panel both announcing "About Dew
 * point" would be a screen reader reading the same control twice.
 */
function HelpButton({
  glossaryKey,
  name,
  onOpen,
}: {
  glossaryKey: GlossaryKey
  /** the name the `?` sits beside; the entry's own when the caller has none */
  name?: string
  onOpen: (key: GlossaryKey) => void
}) {
  return (
    <button
      type="button"
      className="help"
      aria-label={`About ${name ?? GLOSSARY[glossaryKey].name}`}
      onClick={() => onOpen(glossaryKey)}
    >
      ?
    </button>
  )
}

/**
 * The entry, as a bottom sheet on a phone and a centred dialog on anything
 * wider. Every way out — the Close button, Escape, a tap on the backdrop —
 * goes through the element's own `close()`, so there is one path and the
 * parent's state is cleared by the `close` event rather than by three
 * handlers that have to agree with each other.
 *
 * "Full glossary →" is a plain anchor, not a router link: the glossary is a
 * set of documents served off disk like /privacy, and a `<Link>` would ask the
 * router for a route that does not exist. It lands on the entry's own page
 * rather than an anchor on one long one (specs/36-glossary-pages.md), and the
 * word stays true because that page carries the rail to the other eleven.
 */
function HelpSheet({
  entryKey,
  onClose,
}: {
  entryKey: GlossaryKey | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (entryKey && el && !el.open) el.showModal()
  }, [entryKey])

  if (!entryKey) return null
  const entry = GLOSSARY[entryKey]
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a modal dialog closes on Escape natively; this click handler is only the backdrop-dismiss test
    <dialog
      className="help-sheet"
      ref={ref}
      onClose={onClose}
      // A modal dialog's backdrop is painted by the dialog element itself, so
      // a click that lands outside the content targets the dialog. The inner
      // div covers every pixel of the dialog's own box, which is what makes
      // that test exact rather than a guess at coordinates.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="help-body">
        <div className="help-head">
          <div className="help-heading">
            <h2 className="help-title">{entry.name}</h2>
            {entry.meta && <p className="help-meta">{entry.meta}</p>}
          </div>
          <button type="button" className="help-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {entry.image && (
          <figure className="help-figure">
            <img
              src={`/glossary/img/${entry.image.src}`}
              alt={entry.image.alt}
              width={720}
              height={480}
              loading="lazy"
            />
            <figcaption>{entry.image.caption}</figcaption>
          </figure>
        )}
        {GLOSSARY_PARTS.map(([field, label]) => {
          // A part the entry leaves out is skipped, not labelled over nothing:
          // Sick has one sentence worth reading, so it has one part.
          if (entry[field] === undefined) return null
          return (
            <div key={field} className="help-part">
              <span className="help-label">{label}</span>
              <PartBody entry={entry} field={field} />
            </div>
          )
        })}
        <p className="help-disclaimer">{DISCLAIMER}</p>
        <a className="help-full" href={glossaryHref(entryKey)}>
          Full glossary →
        </a>
      </div>
    </dialog>
  )
}

/**
 * What a reference line is allowed to call itself. A row whose diary has no
 * easy level yet draws the top of the EPA's "Good" band instead, and the word
 * is the EPA's, not the app's: the `?` beside it opens this sheet so nobody
 * reads Good as good-for-you. One sheet per screen, like the glossary's.
 */
export interface GoodReference {
  /** the row's name, lowercased into the sentence ("fine particles") */
  name: string
  /** the ceiling in display units */
  value: number
  unit: string
  /** the span the number covers, spelled out ("24 hours") */
  span: string
}

export function useGoodHelp(): {
  goodHelp: (reference: GoodReference) => ReactElement
  goodSheet: ReactElement
} {
  const [open, setOpen] = useState<GoodReference | null>(null)
  const goodHelp = useCallback(
    (reference: GoodReference) => (
      <button
        type="button"
        className="help"
        aria-label="About the EPA’s Good level"
        onClick={() => setOpen(reference)}
      >
        ?
      </button>
    ),
    [],
  )
  return {
    goodHelp,
    goodSheet: <GoodSheet reference={open} onClose={() => setOpen(null)} />,
  }
}

function GoodSheet({
  reference,
  onClose,
}: {
  reference: GoodReference | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (reference && el && !el.open) el.showModal()
  }, [reference])

  if (!reference) return null
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a modal dialog closes on Escape natively; this click handler is only the backdrop-dismiss test
    <dialog
      className="help-sheet"
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="help-body">
        <div className="help-head">
          <div className="help-heading">
            <h2 className="help-title">“Good” is the EPA’s word</h2>
          </div>
          <button type="button" className="help-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        <p className="help-part">
          The top of the EPA’s Good band for {reference.name}, {reference.value} {reference.unit}{' '}
          over {reference.span}. It is set for the general population, not for lungs that react,
          so a day under it can still be a bad one for you.
        </p>
        <p className="help-part">
          Once your diary has an easy day with {reference.name}, your own level replaces it.
        </p>
        <p className="help-disclaimer">{DISCLAIMER}</p>
      </div>
    </dialog>
  )
}

/**
 * The waterline's own sheet, the same shape as Good's: the word "Easy" is the
 * diary's, and the `?` beside it says so — what the dashes mark, where the
 * number comes from, and what span it covers. One sheet per screen.
 */
export interface EasyReference {
  /** the pollutant's name, lowercased into the sentence ("fine particles") */
  name: string
  /** the logged easy level in display units */
  value: number
  unit: string
  /** the span the number covers, spelled out ("8 hours"); unset when the
   * figure is the hour or the day itself rather than a trailing average */
  span?: string
}

export function useEasyHelp(): {
  easyHelp: (reference: EasyReference) => ReactElement
  easySheet: ReactElement
} {
  const [open, setOpen] = useState<EasyReference | null>(null)
  const easyHelp = useCallback(
    (reference: EasyReference) => (
      <button
        type="button"
        className="help"
        aria-label="About your Easy level"
        onClick={() => setOpen(reference)}
      >
        ?
      </button>
    ),
    [],
  )
  return {
    easyHelp,
    easySheet: <EasySheet reference={open} onClose={() => setOpen(null)} />,
  }
}

function EasySheet({
  reference,
  onClose,
}: {
  reference: EasyReference | null
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (reference && el && !el.open) el.showModal()
  }, [reference])

  if (!reference) return null
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a modal dialog closes on Escape natively; this click handler is only the backdrop-dismiss test
    <dialog
      className="help-sheet"
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close()
      }}
    >
      <div className="help-body">
        <div className="help-head">
          <div className="help-heading">
            <h2 className="help-title">“Easy” is your diary’s word</h2>
          </div>
          <button type="button" className="help-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        <p className="help-part">
          You’ve logged Easy breathing — a 1 — with {reference.name} at this level:{' '}
          {reference.value} {reference.unit}
          {reference.span ? `, as a trailing average over ${reference.span}` : ''}. The dashes
          mark it on the graph.
        </p>
        <p className="help-part">
          It comes from your diary alone, and it moves as you log.
        </p>
        <p className="help-disclaimer">{DISCLAIMER}</p>
      </div>
    </dialog>
  )
}

/**
 * A part's body, in the same shape the generated page draws it: breathing as
 * the Evidence / How likely / What helps bullets, the source as a Monitor
 * bullet and a Model bullet where both apply, everything else a paragraph.
 */
function PartBody({ entry, field }: { entry: GlossaryEntry; field: GlossaryPart }) {
  if (field === 'breathing') {
    return (
      <ul className="help-list">
        {breathingBullets(entry).map(({ lead, text }) => (
          <li key={lead}>
            <strong>{lead}.</strong> {text}
          </li>
        ))}
      </ul>
    )
  }
  if (field === 'source') {
    const bullets = sourceBullets(entry)
    if (bullets.length > 1) {
      return (
        <ul className="help-list">
          {bullets.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )
    }
    return <p>{bullets[0]}</p>
  }
  return <p>{entry[field]}</p>
}
