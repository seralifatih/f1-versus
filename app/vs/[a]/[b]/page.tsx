import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDriversByIds } from '@/lib/f1db/client'
import { score } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
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
  const description =
    scoreA !== null && scoreB !== null
      ? `Under the "${formula.label}" formula, ${da.name} scores ${scoreA.toFixed(1)} and ${db.name} scores ${scoreB.toFixed(1)}. Adjust the weights and see who comes out on top.`
      : `Compare ${da.name} (${da.firstYear}–${da.lastYear}) and ${db.name} (${db.firstYear}–${db.lastYear}) side-by-side under the "${formula.label}" formula.`

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
  if (aId === bId) notFound()

  const { formula, era } = decodeFormula(toUrlSearchParams(await searchParams))
  const drivers = await getDriversByIds([aId, bId], era)
  const a = drivers.find((d) => d.driverId === aId)
  const b = drivers.find((d) => d.driverId === bId)

  // Either driverId not in this era's set → 404. Cleanest URL contract:
  // never silently serve a different era than the user asked for.
  if (!a || !b) notFound()

  return <BattleCard a={a} b={b} initialFormula={formula} initialEra={era} />
}
