export const posts = [
  {
    slug: "best-f1-teammates-ranked-by-data",
    title: "The All-Time Best F1 Teammates Ranked by Data",
    date: "2025-07-01",
    description:
      "We pitted every legendary teammate pairing head-to-head â€” qualifying gap, race win ratio, and points delta â€” to settle the greatest intra-team battles in F1 history.",
    tag: "Analysis",
  },
  {
    slug: "wet-weather-kings-f1",
    title: "Wet Weather Kings: Who Really Is the Best in Rain?",
    date: "2025-07-01",
    description:
      "Wet races are where legends are made. We crunched positions-gained, win rates, and DNF avoidance across every rain-affected race since 1950 to crown the true wet-weather king.",
    tag: "Deep Dive",
  },
  {
    slug: "2026-regulations-driver-comparison",
    title: "New Regs, New Era: How 2026 Drivers Compare So Far",
    date: "2025-07-01",
    description:
      "The 2026 regulation reset reshuffled the grid. Here's what the early data says about who's adapting fastest â€” and which driver stats are already pulling ahead.",
    tag: "2026 Season",
  },
] as const;

export type Post = (typeof posts)[number];
