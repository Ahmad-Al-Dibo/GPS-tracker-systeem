// Home — landing page (light theme)
import Link from 'next/link'

export default function HomePage () {
  return (
    <main className='min-h-screen bg-gradient-to-br from-slate-50 to-slate-100'>
      {/* Header */}
      <header className='sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8'>
          <Link href='/' className='flex items-center gap-3'>
            <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl text-white shadow-sm'>
              📍
            </span>
            <div>
              <span className='block text-base font-bold text-slate-900'>
                GPS Manager
              </span>
              <span className='block text-xs text-slate-500'>
                Smart Fleet Management
              </span>
            </div>
          </Link>

          <nav className='hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex'>
            <a href='#features' className='hover:text-blue-600'>
              Functionaliteiten
            </a>
            <a href='#how-it-works' className='hover:text-blue-600'>
              Hoe het werkt
            </a>
            <a href='#benefits' className='hover:text-blue-600'>
              Voordelen
            </a>
          </nav>

          <Link
            href='/login'
            className='rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700'
          >
            Inloggen →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className='relative overflow-hidden'>
        <div className='mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28'>
          <div>
            <span className='inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700'>
              <span className='h-2 w-2 animate-pulse rounded-full bg-green-500' />
              Slimmer beheer van uw wagenpark
            </span>

            <h1 className='mt-6 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl'>
              Uw volledige wagenpark.
              <span className='block text-blue-600'>Altijd in beeld.</span>
            </h1>

            <p className='mt-6 max-w-xl text-lg leading-8 text-slate-600'>
              Beheer en monitor uw voertuigen vanuit één centraal platform. Volg
              locaties live, analyseer voertuigbewegingen, configureer
              automatische meldingen en behoud volledige controle over uw
              wagenpark.
            </p>

            <div className='mt-9 flex flex-col gap-4 sm:flex-row'>
              <Link
                href='/login'
                className='rounded-xl bg-blue-600 px-8 py-4 text-center font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700'
              >
                Naar het dashboard →
              </Link>
              <a
                href='#features'
                className='rounded-xl border border-slate-300 bg-white px-8 py-4 text-center font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600'
              >
                Ontdek de mogelijkheden
              </a>
            </div>

            <div className='mt-10 flex flex-wrap gap-x-8 gap-y-4 text-sm text-slate-500'>
              <span className='flex items-center gap-2'>
                <span className='text-green-600'>✓</span> Centraal
                voertuigbeheer
              </span>
              <span className='flex items-center gap-2'>
                <span className='text-green-600'>✓</span> Realtime monitoring
              </span>
              <span className='flex items-center gap-2'>
                <span className='text-green-600'>✓</span> Automatische alerts
              </span>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className='relative'>
            <div className='absolute -inset-5 rounded-3xl bg-blue-200/30 blur-3xl' />

            <div className='relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl'>
              <div className='flex items-center justify-between border-b border-slate-100 px-5 py-4'>
                <div>
                  <p className='font-bold text-slate-900'>Fleet Overview</p>
                  <p className='text-xs text-slate-500'>Voertuigoverzicht</p>
                </div>
                <span className='rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700'>
                  ● Systeem actief
                </span>
              </div>

              <div className='grid grid-cols-3 gap-3 p-5'>
                <div className='rounded-xl bg-blue-50 p-3'>
                  <p className='text-xs text-slate-500'>Voertuigen</p>
                  <p className='mt-1 text-2xl font-bold text-slate-900'>24</p>
                </div>
                <div className='rounded-xl bg-green-50 p-3'>
                  <p className='text-xs text-slate-500'>Online</p>
                  <p className='mt-1 text-2xl font-bold text-green-700'>21</p>
                </div>
                <div className='rounded-xl bg-orange-50 p-3'>
                  <p className='text-xs text-slate-500'>Meldingen</p>
                  <p className='mt-1 text-2xl font-bold text-orange-600'>03</p>
                </div>
              </div>

              <div className='relative mx-5 mb-5 flex h-64 items-center justify-center overflow-hidden rounded-xl bg-slate-100'>
                <div
                  className='absolute inset-0 opacity-50'
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, #cbd5e1 1px, transparent 1px), linear-gradient(#cbd5e1 1px, transparent 1px)',
                    backgroundSize: '35px 35px'
                  }}
                />
                <div className='absolute left-0 top-1/3 h-2 w-full rotate-[-12deg] bg-white shadow' />
                <div className='absolute left-1/4 top-0 h-full w-2 rotate-[20deg] bg-white shadow' />
                <div className='absolute right-1/4 top-0 h-full w-2 rotate-[-25deg] bg-white shadow' />

                <div className='relative z-10 flex flex-col items-center'>
                  <span className='flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-xl text-white shadow-lg'>
                    🚚
                  </span>
                  <span className='mt-2 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow'>
                    Voertuig #001
                  </span>
                </div>

                <span className='absolute left-1/4 top-1/4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-green-500 text-sm text-white shadow'>
                  🚐
                </span>
                <span className='absolute bottom-1/4 right-1/4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-sm text-white shadow'>
                  🚗
                </span>

                <span className='absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-1 text-xs text-slate-600 shadow'>
                  Kaartvoorbeeld
                </span>
              </div>

              <div className='space-y-3 px-5 pb-5'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='font-semibold text-slate-700'>
                    Recente activiteit
                  </span>
                  <span className='text-xs text-slate-400'>Voorbeelddata</span>
                </div>
                <div className='flex items-center justify-between rounded-lg bg-slate-50 p-3'>
                  <div className='flex items-center gap-3'>
                    <span className='h-2.5 w-2.5 rounded-full bg-green-500' />
                    <span className='text-sm text-slate-700'>
                      Voertuig #001 · Online
                    </span>
                  </div>
                  <span className='text-xs text-slate-400'>Actief</span>
                </div>
                <div className='flex items-center justify-between rounded-lg bg-slate-50 p-3'>
                  <div className='flex items-center gap-3'>
                    <span className='h-2.5 w-2.5 rounded-full bg-orange-500' />
                    <span className='text-sm text-slate-700'>
                      Voertuig #014 · Alert
                    </span>
                  </div>
                  <span className='text-xs text-slate-400'>Controleer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id='features'
        className='border-y border-slate-200 bg-white py-20'
      >
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <span className='text-sm font-bold uppercase tracking-wider text-blue-600'>
              Functionaliteiten
            </span>
            <h2 className='mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl'>
              Alles wat u nodig heeft voor efficiënt vlootbeheer
            </h2>
            <p className='mt-4 text-slate-600'>
              Eén platform voor voertuigtracking, configuratie, monitoring en
              inzicht in uw wagenpark.
            </p>
          </div>

          <div className='mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
            {[
              {
                icon: '📍',
                title: 'Live GPS-tracking',
                description:
                  'Bekijk de actuele voertuiglocaties op een interactieve kaart en volg voertuigbewegingen vanuit één overzicht.'
              },
              {
                icon: '⚙️',
                title: 'Configureerbare regels',
                description:
                  'Stel eigen voorwaarden in voor voertuiggedrag, locaties, snelheid en andere relevante gebeurtenissen.'
              },
              {
                icon: '🔔',
                title: 'Automatische meldingen',
                description:
                  'Ontvang meldingen wanneer ingestelde voorwaarden worden geactiveerd of afwijkende situaties optreden.'
              },
              {
                icon: '🗺️',
                title: 'Interactieve kaart',
                description:
                  'Bekijk voertuigen, locaties en relevante geografische informatie op een centrale kaart.'
              },
              {
                icon: '📊',
                title: 'Rapportages en inzichten',
                description:
                  'Analyseer voertuigactiviteiten en historische gegevens om beter onderbouwde beslissingen te nemen.'
              },
              {
                icon: '🚘',
                title: 'Voertuigbeheer',
                description:
                  'Beheer uw voertuigen en bijbehorende informatie vanuit een centrale en overzichtelijke omgeving.'
              }
            ].map(feature => (
              <div
                key={feature.title}
                className='rounded-2xl border border-slate-200 bg-slate-50 p-7 transition hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-lg'
              >
                <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-2xl'>
                  {feature.icon}
                </div>
                <h3 className='mt-5 text-lg font-bold text-slate-900'>
                  {feature.title}
                </h3>
                <p className='mt-3 text-sm leading-7 text-slate-600'>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id='how-it-works' className='py-20'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='grid items-center gap-12 lg:grid-cols-2'>
            <div>
              <span className='text-sm font-bold uppercase tracking-wider text-blue-600'>
                Hoe het werkt
              </span>
              <h2 className='mt-3 text-3xl font-bold text-slate-900 sm:text-4xl'>
                Van voertuigdata naar direct inzicht
              </h2>
              <p className='mt-5 leading-8 text-slate-600'>
                GPS Manager brengt voertuiggegevens samen in één overzichtelijk
                platform. Zo kunt u sneller reageren op gebeurtenissen en houdt
                u grip op uw volledige wagenpark.
              </p>

              <div className='mt-8 space-y-7'>
                {[
                  {
                    number: '01',
                    title: 'Voertuigen verbinden',
                    description:
                      'Verbind uw GPS-apparaten en koppel de voertuigen aan uw beheeromgeving.'
                  },
                  {
                    number: '02',
                    title: 'Monitoren en configureren',
                    description:
                      'Bekijk locaties en stel regels en meldingen in op basis van uw bedrijfsbehoeften.'
                  },
                  {
                    number: '03',
                    title: 'Analyseren en optimaliseren',
                    description:
                      'Gebruik historische gegevens en rapportages om activiteiten inzichtelijk te maken.'
                  }
                ].map(step => (
                  <div key={step.number} className='flex gap-5'>
                    <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-bold text-white'>
                      {step.number}
                    </div>
                    <div>
                      <h3 className='font-bold text-slate-900'>{step.title}</h3>
                      <p className='mt-2 text-sm leading-6 text-slate-600'>
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className='rounded-3xl border border-slate-200 bg-white p-8 shadow-xl'>
              <h3 className='text-xl font-bold text-slate-900'>
                Een centraal overzicht
              </h3>
              <p className='mt-2 text-sm text-slate-500'>
                Alle belangrijke onderdelen van uw wagenparkbeheer bij elkaar.
              </p>

              <div className='mt-8 space-y-4'>
                {[
                  {
                    label: 'GPS-apparaten',
                    value: 'Locatiegegevens',
                    icon: '📡'
                  },
                  {
                    label: 'Tracking',
                    value: 'Voertuigbewegingen',
                    icon: '📍'
                  },
                  {
                    label: 'Regelengine',
                    value: 'Voorwaarden en acties',
                    icon: '⚙️'
                  },
                  {
                    label: 'Notificaties',
                    value: 'Automatische alerts',
                    icon: '🔔'
                  },
                  {
                    label: 'Rapportages',
                    value: 'Historische inzichten',
                    icon: '📊'
                  }
                ].map((item, index) => (
                  <div
                    key={item.label}
                    className='flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4'
                  >
                    <div className='flex items-center gap-4'>
                      <span className='text-xl'>{item.icon}</span>
                      <div>
                        <p className='text-sm font-bold text-slate-900'>
                          {item.label}
                        </p>
                        <p className='text-xs text-slate-500'>{item.value}</p>
                      </div>
                    </div>
                    <span className='text-blue-600'>✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id='benefits' className='bg-slate-900 py-20 text-white'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='grid gap-12 lg:grid-cols-2 lg:items-center'>
            <div>
              <span className='text-sm font-bold uppercase tracking-wider text-blue-400'>
                Waarom GPS Manager?
              </span>
              <h2 className='mt-3 text-3xl font-bold sm:text-4xl'>
                Meer controle. Meer overzicht. Betere beslissingen.
              </h2>
              <p className='mt-5 leading-8 text-slate-300'>
                Een goed beheerd wagenpark begint met betrouwbare informatie.
                GPS Manager helpt u voertuigactiviteiten centraal te beheren,
                relevante gebeurtenissen te signaleren en operationele processen
                inzichtelijk te maken.
              </p>
            </div>

            <div className='grid gap-5 sm:grid-cols-2'>
              {[
                {
                  title: 'Centraal beheer',
                  description: 'Alle voertuiggegevens op één plek.'
                },
                {
                  title: 'Sneller reageren',
                  description:
                    'Signaleer relevante gebeurtenissen met meldingen.'
                },
                {
                  title: 'Meer inzicht',
                  description:
                    'Gebruik actuele en historische voertuiggegevens.'
                },
                {
                  title: 'Flexibele configuratie',
                  description: 'Stem regels af op uw eigen bedrijfsprocessen.'
                }
              ].map(benefit => (
                <div
                  key={benefit.title}
                  className='rounded-xl border border-slate-700 bg-slate-800 p-6'
                >
                  <span className='text-xl text-blue-400'>✓</span>
                  <h3 className='mt-4 font-bold'>{benefit.title}</h3>
                  <p className='mt-2 text-sm leading-6 text-slate-400'>
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className='bg-blue-600 px-4 py-20 text-center text-white sm:px-6'>
        <div className='mx-auto max-w-3xl'>
          <h2 className='text-3xl font-bold sm:text-4xl'>
            Klaar om uw wagenpark slimmer te beheren?
          </h2>
          <p className='mx-auto mt-5 max-w-2xl leading-7 text-blue-100'>
            Krijg toegang tot uw centrale GPS-beheeromgeving en houd uw
            voertuigen en activiteiten overzichtelijk bij.
          </p>
          <Link
            href='/login'
            className='mt-9 inline-block rounded-xl bg-white px-9 py-4 font-bold text-blue-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50'
          >
            Ga naar het dashboard →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-slate-200 bg-white'>
        <div className='mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8'>
          <div className='flex items-center gap-3'>
            <span className='flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white'>
              📍
            </span>
            <div>
              <p className='font-bold text-slate-900'>GPS Manager</p>
              <p className='text-xs text-slate-500'>Smart Fleet Management</p>
            </div>
          </div>

          <p className='text-sm text-slate-500'>
            © {new Date().getFullYear()} GPS Manager. Alle rechten voorbehouden.
          </p>

          <Link
            href='/login'
            className='text-sm font-semibold text-blue-600 hover:text-blue-700'
          >
            Inloggen →
          </Link>
        </div>
      </footer>
    </main>
  )
}
