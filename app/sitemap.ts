import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config'
import { getAllDriverStats } from '@/lib/f1db/client'
import { rank } from '@/lib/scoring/engine'
import { getPreset, DEFAULT_PRESET_ID, PRESETS } from '@/lib/scoring/presets'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    {
      url: `${SITE_URL}/methodology`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    { url: `${SITE_URL}/vs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  // Top-20 under the default preset becomes the seed for versus-pair URLs.
  // C(20, 2) = 190 unique pairs, well under the 50k sitemap limit.
  let pairPages: MetadataRoute.Sitemap = []
  try {
    const drivers = await getAllDriverStats('all')
    const defaultPreset = getPreset(DEFAULT_PRESET_ID) ?? PRESETS[0]
    if (defaultPreset) {
      const top20 = rank(drivers, defaultPreset.weights).slice(0, 20)
      for (let i = 0; i < top20.length; i++) {
        for (let j = i + 1; j < top20.length; j++) {
          const a = top20[i]
          const b = top20[j]
          if (!a || !b) continue
          pairPages.push({
            url: `${SITE_URL}/vs/${a.driverId}/${b.driverId}`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.5,
          })
        }
      }
    }
  } catch (err) {
    // D1 unreachable during build? Ship the static portion of the sitemap
    // rather than failing the entire route. Pair URLs will appear next
    // time the sitemap is re-generated.
    console.error('sitemap pair generation failed', err)
    pairPages = []
  }

  return [...staticPages, ...pairPages]
}
