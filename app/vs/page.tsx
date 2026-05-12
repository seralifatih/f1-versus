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

  // `preselect` is the canonical param (set by the ranking row VS button).
  // `seed` is the legacy name kept so shared URLs from earlier builds still
  // pre-fill the picker.
  const requested = params.get('preselect') ?? params.get('seed')
  const seedDriverId =
    requested && ranked.some((d) => d.driverId === requested) ? requested : null

  return <VersusPicker ranked={ranked} formula={formula} era={era} seedDriverId={seedDriverId} />
}
