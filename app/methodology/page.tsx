import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology — f1·versus',
  description:
    'How f1·versus scores every F1 driver: the data source, the nine metrics, era adjustment, and what this tool deliberately cannot measure.',
}

export default function MethodologyPage() {
  return (
    <article className="max-w-[720px] mx-auto py-8 space-y-12 leading-[1.65] text-[#d8d8d8]">
      <header className="space-y-4">
        <h1
          className="font-display font-normal tracking-[-0.03em] font-vary-[opsz_144,wght_400] leading-[1.05]"
          style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}
        >
          Methodology
        </h1>
        <p className="text-[17px] text-muted2 leading-[1.6]">
          A ranking is only as honest as the math behind it. This page documents exactly how
          f1·versus turns 75 years of race results into a single score per driver — and, just
          as importantly, what it doesn&rsquo;t try to measure.
        </p>
      </header>

      <Section heading="Where the data comes from">
        <p>
          Every number you see comes from{' '}
          <a
            href="https://github.com/f1db/f1db"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red hover:underline"
          >
            F1DB
          </a>
          , an open-source Formula 1 database compiled and maintained by volunteers. F1DB ships
          a SQLite dump containing every race, qualifying session, championship standing, and
          driver record from 1950 to the current season.
        </p>
        <p>
          We sync the latest F1DB release into Cloudflare D1, run a single aggregation pass per
          driver per era, and serve the pre-computed table to the calculator. No live scraping,
          no API key, no rate limits. When F1DB updates, we re-sync — typically within a week
          of each race weekend.
        </p>
      </Section>

      <Section heading="The nine metrics">
        <p>
          Each driver gets a 0–100 score on nine independent dimensions. The score is
          min-max normalized within the selected era, so &ldquo;100&rdquo; means &ldquo;best
          driver in this era&rdquo; for that one metric — not best of all time. Your formula
          decides how heavily each dimension counts.
        </p>

        <Metric name="Championships">
          Count of season-ending championships won (position 1 in the final standings). The
          purest, most-cited statistic — but also the one most distorted by car quality, so it
          rewards drivers who spent their careers in dominant machinery.
        </Metric>

        <Metric name="Wins">
          Race wins. Counts only main-event Grand Prix results — sprint races are excluded since
          they have a different scoring history and only existed for a handful of recent seasons.
        </Metric>

        <Metric name="Podiums">
          Top-three finishes. A softer measure than wins; rewards consistency in good machinery
          and shows up brightly for drivers who were perpetually second-best to a dominant
          teammate.
        </Metric>

        <Metric name="Poles">
          Pole positions — finishing first in qualifying. The cleanest measure of one-lap pace
          but skewed by qualifying format changes (1950s aggregate timing, 2003 single-lap,
          2006-present knockout) which we do not currently normalize for.
        </Metric>

        <Metric name="Fastest Laps">
          Number of races where the driver set the fastest lap. From 2019 onward this is also
          worth a championship point if you finish in the top ten, which subtly changes
          how teams pursue it.
        </Metric>

        <Metric name="Win Rate">
          Wins divided by races started. A correction for career length: it lets short, dominant
          careers (Fangio, Clark) sit alongside long, prolific ones (Hamilton, Schumacher)
          without being buried by raw totals.
        </Metric>

        <Metric name="Teammate H2H">
          The fairest comparison Formula 1 offers, with the most signal per data point. For every
          race where two teammates both finish with a valid classified position, we compare
          their results and credit the higher finisher. We do this for races and for qualifying
          sessions separately, then average the two rates. A score of 100 means the driver
          beat every teammate in every comparable session — an empirically impossible bar that
          even the all-time greats fall short of.
        </Metric>

        <Metric name="Longevity">
          Career years (last season minus first season, inclusive). Rewards drivers who stayed
          relevant across rule changes, team transitions, and physical decline. Heavily favored
          by the Longevity preset; close to zero in the Peak Performance preset.
        </Metric>

        <Metric name="Peak Dominance">
          The single best three-consecutive-season window of a driver&rsquo;s career, measured
          as the sum of their share of total championship points in those three seasons. A
          driver who took 25% of all points scored across a three-year run gets a high peak
          score. This is the metric that surfaces Vettel 2010–12, Schumacher 2002–04, Hamilton
          2018–20 — eras of true dominance that get diluted in lifetime averages.
        </Metric>
      </Section>

      <Section heading="How era adjustment works">
        <p>
          Choosing &ldquo;Era Adjusted&rdquo; (or any specific era filter) does two things.
          First, the driver pool is restricted to people who actually raced in that era —
          Fangio doesn&rsquo;t appear in the Modern ranking, Verstappen doesn&rsquo;t appear
          in the Golden Era one.
        </p>
        <p>
          Second, and more importantly, the min-max normalization happens{' '}
          <em className="font-vary-[opsz_24,wght_500] not-italic text-white italic">
            within
          </em>{' '}
          the era. A pre-1979 driver&rsquo;s &ldquo;wins&rdquo; score isn&rsquo;t being
          compared to Hamilton&rsquo;s 100+; it&rsquo;s being compared to peers who raced 8–16
          times per season instead of 22+. This is the right correction for season length,
          championship inflation, and the general expansion of the calendar.
        </p>
        <p>
          What it doesn&rsquo;t correct for is era difficulty — grid depth, reliability, the
          number of cars actually capable of winning. We don&rsquo;t have a clean, defensible
          way to quantify that without smuggling in opinion. Reasonable people disagree on
          whether 1955 or 1995 had a deeper field. So we don&rsquo;t pretend.
        </p>
      </Section>

      <Section heading="What we deliberately don't measure">
        <p>
          Formula 1 has a lively folklore of intangibles — race craft, wet-weather skill,
          ability to set up a car, mental fortitude under championship pressure. None of these
          show up here, for a simple reason: there is no neutral dataset for them. Any number
          that claims to measure &ldquo;race craft&rdquo; is really measuring someone&rsquo;s
          opinion of race craft, ratified by a vote or a panel or a podcast.
        </p>
        <p>
          We chose to ship a tool that can show its work. Every metric on this page comes from
          a query you could write yourself against the F1DB SQLite file. If you don&rsquo;t
          like how the score comes out, you can move the sliders and watch the order change in
          real time. That&rsquo;s the wedge.
        </p>
        <p>
          Things you will <em className="italic">not</em> find here, and the reason for each:
        </p>
        <ul className="space-y-2 list-none pl-0">
          <li>
            <strong className="text-white">Wet-weather wins.</strong> The weather flag in F1DB
            is sparse and inconsistent before 1990, and &ldquo;wet&rdquo; is a continuum, not a
            binary.
          </li>
          <li>
            <strong className="text-white">Race craft / overtaking.</strong> Position-change
            data only exists reliably from the late 1990s onward, and even then it conflates
            driver skill with car pace and pit-stop strategy.
          </li>
          <li>
            <strong className="text-white">Car quality adjustment.</strong> We could attempt
            it (regress driver results against teammate results to back out the car), but the
            assumption that teammates have equal equipment is regularly false. We&rsquo;d be
            adding noise dressed up as rigor.
          </li>
          <li>
            <strong className="text-white">Single-race performances.</strong> Monaco 1984.
            Donington 1993. Brazil 2008. These belong in the lore, not in a ranking.
          </li>
        </ul>
      </Section>

      <Section heading="Limitations">
        <p>
          A ranking like this can tell you a few things and cannot tell you many others. To be
          explicit about both:
        </p>
        <p>
          It can tell you who racked up the most wins, championships, pole positions, and
          dominant seasons — and let you weight those against each other. It can show you,
          objectively, that Hamilton has the highest career win total in F1 history, that
          Schumacher and Verstappen have the highest peak-3-year dominance, that Senna has the
          highest pole rate of anyone with 100+ starts.
        </p>
        <p>
          It cannot tell you who was the most talented driver. Talent is not a recorded number.
          The closest we get is the Teammate H2H metric, which holds the car constant — but a
          teammate is themselves a variable. Verstappen&rsquo;s teammate record looks one way
          against Pérez, another against Albon, another against Ricciardo. Choosing how to
          weight that against career totals is the whole point of letting you build your own
          formula.
        </p>
        <p>
          It cannot tell you anything about a driver who hasn&rsquo;t finished their career.
          Active drivers&rsquo; Longevity and Peak Dominance scores are still moving. We freeze
          them at &ldquo;current season&rdquo; for the comparison, which is the most honest
          option but means a 2026 Verstappen will look more dominant than a 2028 Verstappen who
          spent two more years polishing his Peak number in a slower car.
        </p>
        <p>
          And it cannot settle the GOAT debate. It can give you a starting position, a
          quantitative bedrock to argue from. The argument itself is the point.
        </p>
      </Section>
    </article>
  )
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2
        className="font-display font-medium tracking-[-0.02em] font-vary-[opsz_72,wght_500] leading-[1.1] mt-6"
        style={{ fontSize: 'clamp(28px, 3.5vw, 36px)' }}
      >
        {heading}
      </h2>
      <div className="space-y-4 text-[17px]">{children}</div>
    </section>
  )
}

function Metric({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="font-display text-[20px] font-medium tracking-[-0.01em] font-vary-[opsz_48,wght_500] text-white mt-4">
        {name}
      </h3>
      <p className="text-[17px]">{children}</p>
    </div>
  )
}
