import type { Metadata } from 'next'
import { getAllDriverStats } from '@/lib/f1db/client'
import { rank } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
import { ogImageUrl, toUrlSearchParams, type NextSearchParams } from '@/lib/url-state/next'
import { RankingView } from '@/components/ranking/RankingView'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: NextSearchParams
}): Promise<Metadata> {
  const { formula, era } = decodeFormula(toUrlSearchParams(await searchParams))
  const og = ogImageUrl('ranking', formula, era)
  const title = `${formula.label} — F1 GOAT Calculator`
  const description = `${formula.blurb || 'Your formula, your ranking.'} See the all-time F1 ranking under this formula.`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: NextSearchParams
}) {
  const { formula, era, isCustom } = decodeFormula(toUrlSearchParams(await searchParams))
  const drivers = await getAllDriverStats(era)
  const initialRanked = rank(drivers, formula.weights)

  return (
    <RankingView
      initialRanked={initialRanked}
      initialFormula={formula}
      initialEra={era}
      isCustom={isCustom}
    />
  )
}
