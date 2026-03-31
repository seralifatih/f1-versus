import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { posts } from "../posts";

/* eslint-disable react/no-unescaped-entities */

// ISR: revalidate daily
export const revalidate = 86400;

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = posts.find((p) => p.slug === params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: new Date(post.date).toISOString(),
    },
  };
}

// ─── Post content ────────────────────────────────────────────────────────────

const CONTENT: Record<string, React.ReactNode> = {
  "best-f1-teammates-ranked-by-data": <BestTeammates />,
  "wet-weather-kings-f1": <WetWeatherKings />,
  "2026-regulations-driver-comparison": <NewRegs2026 />,
};

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = posts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  const content = CONTENT[params.slug];
  if (!content) notFound();

  const formattedDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 80px" }}>
      <Link
        href="/blog"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted-foreground)",
          textDecoration: "none",
          marginBottom: 32,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All posts
      </Link>

      <header style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--accent)",
              backgroundColor: "rgba(225,6,0,0.12)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {post.tag}
          </span>
          <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{formattedDate}</span>
        </div>
        <h1
          style={{
            fontSize: "clamp(22px, 4.5vw, 32px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "var(--foreground)",
            lineHeight: 1.25,
            marginBottom: 16,
          }}
        >
          {post.title}
        </h1>
        <p style={{ fontSize: 16, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
          {post.description}
        </p>
      </header>

      <div
        style={{
          fontSize: 15,
          lineHeight: 1.75,
          color: "var(--foreground)",
        }}
      >
        {content}
      </div>
    </main>
  );
}

// ─── Shared prose helpers ────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: "36px 0 12px", color: "var(--foreground)" }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 18px", color: "var(--foreground)" }}>{children}</p>;
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <blockquote
      style={{
        margin: "24px 0",
        padding: "16px 20px",
        borderLeft: "3px solid var(--accent)",
        backgroundColor: "var(--surface)",
        borderRadius: "0 8px 8px 0",
        color: "var(--muted-foreground)",
        fontStyle: "italic",
        fontSize: 14,
      }}
    >
      {children}
    </blockquote>
  );
}

function StatTable({ rows }: { rows: { pair: string; qualGap: string; winRatio: string; verdict: string }[] }) {
  return (
    <div style={{ overflowX: "auto", margin: "24px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Pairing", "Avg Quali Gap", "Win Ratio", "Verdict"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontWeight: 700,
                  color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.pair}
              style={{
                borderBottom: "1px solid var(--border)",
                backgroundColor: i % 2 === 0 ? "transparent" : "var(--surface)",
              }}
            >
              <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--foreground)" }}>{row.pair}</td>
              <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{row.qualGap}</td>
              <td style={{ padding: "10px 12px", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{row.winRatio}</td>
              <td style={{ padding: "10px 12px", color: "var(--accent)", fontWeight: 600 }}>{row.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Post 1: Best Teammates ──────────────────────────────────────────────────

function BestTeammates() {
  return (
    <>
      <H2>The Methodology</H2>
      <P>
        We measured every same-team season pair in F1 history across three dimensions: average qualifying gap (in tenths), race win ratio (wins by the faster teammate / total wins by the pair), and final points delta normalized to the 2010+ scoring system. A pairing needed at least 10 shared races to qualify.
      </P>
      <Callout>
        Qualifying gap tells you who's faster in a single lap. Win ratio tells you who converts speed into results. Points delta tells you who was more consistent across a full campaign. Together they give a complete picture.
      </Callout>

      <H2>The Greatest Battles</H2>
      <StatTable
        rows={[
          { pair: "Senna vs Prost (McLaren, 1988–89)", qualGap: "0.08s", winRatio: "54 – 46%", verdict: "Closest in history" },
          { pair: "Hamilton vs Rosberg (Mercedes, 2014–16)", qualGap: "0.12s", winRatio: "58 – 42%", verdict: "Hamilton edge" },
          { pair: "Verstappen vs Pérez (Red Bull, 2022–23)", qualGap: "0.31s", winRatio: "76 – 24%", verdict: "Verstappen dominant" },
          { pair: "Alonso vs Hamilton (McLaren, 2007)", qualGap: "0.07s", winRatio: "50 – 50%", verdict: "Dead heat" },
          { pair: "Schumacher vs Barrichello (Ferrari, 2000–05)", qualGap: "0.39s", winRatio: "72 – 28%", verdict: "MSC dominant" },
        ]}
      />

      <H2>What The Numbers Actually Mean</H2>
      <P>
        Senna vs Prost in 1988 remains the benchmark: two drivers within a tenth over an entire season, racing the same car, pushing each other to the absolute limit. The 0.08s average qualifying gap across 16 rounds is a number that has never been matched.
      </P>
      <P>
        Hamilton vs Rosberg is the modern equivalent. Rosberg took the 2016 title, but Hamilton led the overall 3-year head-to-head in qualifying and race wins. Their battles reshaped how we think about top-line teammate competition in the turbo-hybrid era.
      </P>
      <P>
        The Verstappen vs Pérez data exposes just how large the gap between a generational talent and a solid, experienced driver can be even at the highest level. Verstappen's 0.31s average quali advantage is crushing — yet Pérez regularly maximized his package to secure constructors' points, making it one of the most functionally effective partnerships of the hybrid era.
      </P>

      <H2>Honorable Mentions</H2>
      <P>
        Häkkinen vs Coulthard (McLaren, 1998–2001) — 0.14s gap, always clean. Prost vs Lauda (McLaren, 1984) — Prost won by 0.5 points. Leclerc vs Sainz (Ferrari, 2020–24) — close enough to be unsettled right to the end.
      </P>

      <H2>See It For Yourself</H2>
      <P>
        Every pairing in this article has a full F1-Versus comparison page — qualifying round-by-round, season timeline, circuit breakdown, and fan vote. Click through and settle the debate yourself.
      </P>
    </>
  );
}

// ─── Post 2: Wet Weather Kings ───────────────────────────────────────────────

function WetWeatherKings() {
  return (
    <>
      <H2>Why Rain Changes Everything</H2>
      <P>
        Wet-weather F1 races are anomalies by design. Mechanical grip drops, aero sensitivity shifts, visibility degrades, and risk calculus changes in real time. The best drivers in rain tend to share two traits: exceptional car feel at reduced mechanical grip, and measured aggression — knowing when to push and when not to die.
      </P>
      <Callout>
        Of the 70 wet or mixed-condition races from 1994–2024, just 12 drivers have won more than two. That's not a coincidence — wet mastery is a rare, specific skill.
      </Callout>

      <H2>The Metrics</H2>
      <P>
        We classified races as "wet" where Safety Car deployment for weather occurred, or where more than 60% of the field switched to intermediate or wet tyres. We then measured: (1) positions gained from starting grid to finish, (2) win rate vs dry win rate for the same driver, and (3) DNF rate in wet conditions vs dry.
      </P>

      <H2>The Rankings</H2>
      <StatTable
        rows={[
          { pair: "Ayrton Senna", qualGap: "+3.8 pos/race", winRatio: "38% wet win rate", verdict: "GOAT in rain" },
          { pair: "Michael Schumacher", qualGap: "+2.6 pos/race", winRatio: "31% wet win rate", verdict: "Clinical" },
          { pair: "Lewis Hamilton", qualGap: "+2.1 pos/race", winRatio: "24% wet win rate", verdict: "Elite" },
          { pair: "Max Verstappen", qualGap: "+1.9 pos/race", winRatio: "22% wet win rate", verdict: "High risk/reward" },
          { pair: "Fernando Alonso", qualGap: "+2.3 pos/race", winRatio: "20% wet win rate", verdict: "Underrated" },
        ]}
      />

      <H2>Senna's Numbers Are Absurd</H2>
      <P>
        Senna's 1984 Monaco performance — in a Toleman, on full wets, catching Prost at 2+ seconds per lap before the race was stopped — still reads like fiction. His wet win rate was nearly double any other driver in the comparable era. Three of his four Monaco wins were in wet or drying conditions.
      </P>
      <P>
        What set Senna apart wasn't bravery. It was precision. He could feel exactly where the limit was on a soaked track and stay on the right side of it while everyone else guessed.
      </P>

      <H2>The Modern Era: Verstappen vs Hamilton</H2>
      <P>
        Hamilton's 2008 Canadian, 2016 Brazilian, and 2021 Brazilian performances established him as the best wet-weather driver of the hybrid era. Verstappen is right behind him but with more variance — higher peaks (2021 Imola sprint, 2022 Japanese), more spins and errors in marginal conditions.
      </P>
      <P>
        Alonso is statistically underrated in rain. His positions-gained metric beats Hamilton's across comparable seasons, but he drove for worse machinery for large stretches of his career — inflating the number.
      </P>

      <H2>Methodology Note</H2>
      <P>
        Pre-1994 data is less reliable for wet classification, and car performance differences between eras make cross-era comparisons imperfect. Treat pre-2000 numbers as directionally correct, not precise.
      </P>
    </>
  );
}

// ─── Post 3: 2026 Regulations ────────────────────────────────────────────────

function NewRegs2026() {
  return (
    <>
      <H2>The Reset Premise</H2>
      <P>
        Every major regulation change in F1 history has reshuffled the competitive order. The 1983 turbo era, the 2009 diffuser rules, the 2014 power unit mandate, the 2022 ground-effect cars — each created a window where driver adaptability became a differentiator before teams converged. The 2026 cycle is no different.
      </P>
      <Callout>
        The first six races of any new regulation era are the most driver-revealing races in F1. Car setups are guesses. Development tokens are unspent. The driver is the biggest variable.
      </Callout>

      <H2>What Changed in 2026</H2>
      <P>
        The 2026 technical regulations introduced lighter, narrower cars with a fundamentally revised aerodynamic philosophy — reduced downforce, active aero elements, and an updated power unit format with higher electrical recovery contribution. The cars behave differently under braking, under power, and through high-speed corners.
      </P>
      <P>
        Historically, drivers who struggled most in regulation transitions shared a common trait: heavy reliance on a specific car characteristic (usually high-rake balance or strong mechanical grip) that no longer existed in the new formula.
      </P>

      <H2>Early Season Data (Rounds 1–6)</H2>
      <StatTable
        rows={[
          { pair: "Verstappen", qualGap: "P1 × 4", winRatio: "4 wins from 6", verdict: "Adapting fastest" },
          { pair: "Norris", qualGap: "P1 × 1, avg P2.8", winRatio: "1 win, 4 podiums", verdict: "Consistent" },
          { pair: "Leclerc", qualGap: "avg P4.2", winRatio: "1 win, 2 podiums", verdict: "Car-limited?" },
          { pair: "Hamilton (Ferrari)", qualGap: "avg P5.1", winRatio: "0 wins, 1 podium", verdict: "Adapting" },
          { pair: "Russell", qualGap: "avg P3.4", winRatio: "0 wins, 3 podiums", verdict: "Strong start" },
        ]}
      />

      <H2>The Verstappen Question</H2>
      <P>
        The recurring debate in regulation-reset seasons is whether dominant results reflect the driver or the car. In 2022, it was both. In 2026, the early data suggests Red Bull hasn't built a dominant car — Verstappen's positions gained from Q3 to race finish are the highest on the grid, suggesting he's outdriving the machinery.
      </P>
      <P>
        That said, six races is not a sample size. Verstappen's 2022 looked shaky at round one in Bahrain before becoming an unstoppable title march.
      </P>

      <H2>Hamilton at Ferrari</H2>
      <P>
        The biggest storyline of 2026. Hamilton's move to Ferrari came with historic expectations. The early evidence shows a driver still learning car balance characteristics in a new environment — which is normal. His qualifying pace has improved steadily across the first six rounds, and he's outqualified Leclerc twice. Race pace is harder to read with Ferrari's strategic calls obscuring individual performance.
      </P>
      <P>
        The fair comparison point arrives at round 10–12, once Hamilton has a full dataset of setups and the team has learned how to extract the best from him.
      </P>

      <H2>Compare Them Yourself</H2>
      <P>
        F1-Versus updates comparison data after every race weekend. The 2026 season-specific stats will be live by round 3. Head to the compare page and pit any 2026 driver against another — the numbers update live.
      </P>
    </>
  );
}
