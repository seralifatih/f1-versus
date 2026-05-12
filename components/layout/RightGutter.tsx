'use client'

import { usePathname } from 'next/navigation'
import { ScrollIndicator } from '@/components/ranking/ScrollIndicator'
import {
  APP_VERSION,
  BUILD_DATA_SYNC,
  BUILD_DATA_VERSION,
  SEASON_STATUS,
} from '@/lib/build-info'

// Right gutter content. Static document metadata is shown on every page;
// the live scroll position indicator only renders on the ranking route
// where there's an indexed list to scrub through.
export function RightGutter() {
  const pathname = usePathname() ?? '/'
  const onRanking = pathname === '/'
  return (
    <div className="flex flex-col items-start gap-1 leading-tight">
      <span>{BUILD_DATA_VERSION}</span>
      <span>SYNC {BUILD_DATA_SYNC}</span>
      <span className="text-curb-red mt-2">{SEASON_STATUS}</span>
      <span className="mt-auto pt-6">{APP_VERSION}</span>
      {onRanking && <ScrollIndicator />}
    </div>
  )
}
