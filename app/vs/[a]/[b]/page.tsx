import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAllDriverStats, getDriversByIds } from '@/lib/f1db/client'
import { rank, score } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
import { encodeFormula } from '@/lib/url-state/encode'
import { ogImageUrl, toUrlSearchParams, type NextSearchParams } from '@/lib/url-state/next'
import { BattleCard } from '@/components/battle/BattleCard'

type Params = Promise<{ a: string; b: string }>

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params
  searchParams: NextSearchParams
}): Promise<Metadata> {
  const { a: aId, b: bId } = await params
  const { formula, era } = decodeFormula(toUrlSearchParams(await searchParams))

  // Prefer the requested era for scores. If either driver isn't in that era,
  // fall back to 'all' just for the name lookup so the title still renders.
  const inEra = await getDriversByIds([aId, bId], era)
  let da = inEra.find((d) => d.driverId === aId)
  let db = inEra.find((d) => d.driverId === bId)

  let scoreA: number | null = null
  let scoreB: number | null = null
  if (da && db) {
    scoreA = score(da.metrics, formula.weights)
    scoreB = score(db.metrics, formula.weights)
  } else {
    const fallback = await getDriversByIds([aId, bId], 'all')
    da = fallback.find((d) => d.driverId === aId)
    db = fallback.find((d) => d.driverId === bId)
  }

  if (!da || !db) {
    return { title: 'Driver matchup — f1·versus' }
  }

  const title = `${da.name} vs ${db.name} — F1 GOAT Calculator`
  let description: string
  if (scoreA !== null && scoreB !== null) {
    const aWins = scoreA >= scoreB
    const higher = aWins ? da : db
    const lower = aWins ? db : da
    const higherScore = aWins ? scoreA : scoreB
    const lowerScore = aWins ? scoreB : scoreA
    description = `Compare ${da.name} and ${db.name} across 9 metrics and your custom formula. ${higher.name} scores ${higherScore.toFixed(1)}, ${lower.name} scores ${lowerScore.toFixed(1)}.`
  } else {
    description = `Compare ${da.name} and ${db.name} across 9 metrics and your custom formula.`
  }

  const og = ogImageUrl('battle', formula, era, { a: aId, b: bId })

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  }
}

export default async function VersusPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: NextSearchParams
}) {
  const { a: aId, b: bId } = await params
  const sp = toUrlSearchParams(await searchParams)
  const { formula, era } = decodeFormula(sp)

  if (aId === bId) {
    // Same driver on both sides is nonsensical — bounce to the picker so
    // the user can pick a second driver, preserving the current formula.
    const params = encodeFormula(formula, era).toString()
    redirect(`/vs${params ? `?${params}` : ''}`)
  }

  const [drivers, allDrivers] = await Promise.all([
    getDriversByIds([aId, bId], era),
    getAllDriverStats(era),
  ])
  const a = drivers.find((d) => d.driverId === aId)
  const b = drivers.find((d) => d.driverId === bId)

  // Either driverId not in this era's set → 404. Cleanest URL contract:
  // never silently serve a different era than the user asked for.
  if (!a || !b) notFound()

  // "More matchups": the 3 drivers closest in score to A under the current
  // formula, excluding A and B. Computed server-side so the suggested links
  // line up with whatever formula the URL is carrying.
  const ranked = rank(allDrivers, formula.weights)
  const scoredA = score(a.metrics, formula.weights)
  const related = ranked
    .filter((d) => d.driverId !== aId && d.driverId !== bId)
    .map((d) => ({ driver: d, distance: Math.abs(d.score - scoredA) }))
    .sort((x, y) => x.distance - y.distance)
    .slice(0, 3)
    .map((r) => r.driver)

  return (
    <BattleCard
      a={a}
      b={b}
      initialFormula={formula}
      initialEra={era}
      related={related}
    />
  )
}
