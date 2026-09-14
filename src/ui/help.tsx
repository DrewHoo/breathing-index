import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { GLOSSARY, GLOSSARY_PARTS, type GlossaryKey } from '../content/glossary'
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
 * "Full glossary →" is a plain anchor, not a router link: `/glossary` is a
 * document served off disk like /privacy, and a `<Link>` would ask the router
 * for a route that does not exist.
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
          <h2 className="help-title">{entry.name}</h2>
          <button type="button" className="help-close" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {GLOSSARY_PARTS.map(([field, label]) => (
          <p key={field} className="help-part">
            <span className="help-label">{label}</span>
            {entry[field]}
          </p>
        ))}
        <p className="help-disclaimer">{DISCLAIMER}</p>
        <a className="help-full" href={`/glossary#${entryKey}`}>
          Full glossary →
        </a>
      </div>
    </dialog>
  )
}
