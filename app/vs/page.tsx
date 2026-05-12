import { getAllDriverStats } from '@/lib/f1db/client'
import { rank } from '@/lib/scoring/engine'
import { decodeFormula } from '@/lib/url-state/decode'
import { toUrlSearchParams, type NextSearchParams } from '@/lib/url-state/next'
import { VersusPicker } from '@/components/battle/VersusPicker'

export const metadata = {
  title: 'Pick two drivers — f1·versus',
  description: 'Choose any two F1 drivers and compare them side-by-side under your formula.',
}

export default async function VsPickerPage({
  searchParams,
}: {
  searchParams: NextSearchParams
}) {
  const params = toUrlSearchParams(await searchParams)
  const { formula, era } = decodeFormula(params)
  const drivers = await getAllDriverStats(era)
  const ranked = rank(drivers, formula.weights)

  const seed = params.get('seed')
  const seedDriverId = seed && ranked.some((d) => d.driverId === seed) ? seed : null

  return <VersusPicker ranked={ranked} formula={formula} era={era} seedDriverId={seedDriverId} />
}
