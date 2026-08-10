import { createFileRoute, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { track } from '../ui/analytics'

export const Route = createFileRoute('/about')({ component: About })

/**
 * The address, stored backwards and assembled only when someone taps the row.
 * Harvesters grep bundles and DOM for anything shaped like an address; this
 * way neither ever contains one. The visible hint spells it out for humans.
 */
const ADDRESS_REVERSED = 'moc.liamg@revoohwerd'
const emailMe = () => {
  window.location.href = `mailto:${[...ADDRESS_REVERSED].reverse().join('')}`
}

function About() {
  const navigate = useNavigate()
  const router = useRouter()
  const canGoBack = useCanGoBack()

  useEffect(() => {
    track('About seen')
  }, [])

  // Arrived from Settings (or the intro): back returns there. Arrived by a
  // shared link with no app history behind it: back has nowhere to go, so
  // land on Today rather than dumping the visitor out of the site.
  const close = () => {
    if (canGoBack) router.history.back()
    else void navigate({ to: '/' })
  }

  return (
    <main className="intro">
      <h1 className="wordmark">Breathing Index 🫁</h1>
      <div className="intro-headline">Made by an asthmatic, for asthmatics.</div>
      <p className="intro-body">
        Hi — I&rsquo;m Drew, and I hate having asthma. I started getting asthma attacks as an adult.
        At first I found monitoring the AQI to be helpful, but I quickly realized that it kinda gaslights you. Some days
        I see a yellow "moderate" rating in the 70s and I'm fine, and some days I can barely make it home from a walk
        around the block when it's in the 60s. This app is designed to disambiguate the various measurements that AQI represents so that you
        can build your own index based on the thing that matters most: BREATHING, not generic "air quality".
      </p>
      <p className="intro-body">
        Breathing Index runs entirely on free public data, and exists only in your browser;
        there is no server to which the information you log can be sent. 
        That will eventually change, so that you can opt-in to having your breathing logs
        stored & encrypted on a server; this will enable you to access & update your breathing log across devices
        and it'll also make it possible to access more, paid air quality data, like pollen counts (hopefully just in
        time for ragweed season 🙃).
      </p>
      <p className="intro-body">
        That said, a free, local (no server), and genuinely useful version of this app will exist for as long as people are using it;
        it's the tool that I wish I had when I first started having trouble breathing, and I think everyone who needs it
        should have access to it.
      </p>
      <p className="intro-body">
        Fuck asthma. Breathe easy.
      </p>
      <div className="row-card">
        <a
          className="settings-row"
          href="https://drewhoover.com"
          target="_blank"
          rel="noreferrer"
        >
          <span className="settings-row-label accent">drewhoover.com</span>
          <span className="settings-row-hint">my personal website</span>
        </a>
        <a
          className="settings-row"
          href="https://github.com/DrewHoo/breathing-index"
          target="_blank"
          rel="noreferrer"
        >
          <span className="settings-row-label accent">Source on GitHub</span>
          <span className="settings-row-hint">DrewHoo/breathing-index</span>
        </a>
        <button type="button" className="settings-row" onClick={emailMe}>
          <span className="settings-row-label accent">Email me</span>
          <span className="settings-row-hint">drewhoover · gmail</span>
        </button>
      </div>
      <p className="intro-privacy">
        HMU with bug reports, feature ideas, or just &ldquo;thanks dude&rdquo;.
      </p>
      <div className="intro-cta-block">
        <button type="button" className="intro-cta" onClick={close}>
          Done
        </button>
      </div>
    </main>
  )
}
