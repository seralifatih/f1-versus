/**
 * POST /api/compare
 *
 * Computes a filtered comparison on demand.
 * Used when users toggle context filters (wet, street, season) on the
 * compare page. The default (unfiltered) comparison is pre-computed and
 * served statically — this route handles the filtered variants.
 *
 * Body: { driverARef: string, driverBRef: string, filters: ComparisonFilters }
 * Returns: ComparisonResult JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/client";
import { computeComparison } from "@/lib/comparison/compute";
import type { ComparisonFilters } from "@/lib/data/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { driverARef, driverBRef, filters } = body as {
    driverARef: string;
    driverBRef: string;
    filters: ComparisonFilters;
  };

  if (!driverARef || !driverBRef) {
    return NextResponse.json({ error: "Missing driver refs" }, { status: 400 });
  }

  // Validate filter values
  if (filters.season !== undefined && (typeof filters.season !== "number" || filters.season < 1950)) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }
  if (filters.circuitType !== undefined && !["street", "permanent"].includes(filters.circuitType)) {
    return NextResponse.json({ error: "Invalid circuit type" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const [{ data: dA }, { data: dB }] = await Promise.all([
    supabase.from("drivers").select("id").eq("driver_ref", driverARef).single(),
    supabase.from("drivers").select("id").eq("driver_ref", driverBRef).single(),
  ]);

  if (!dA || !dB) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  try {
    const result = await computeComparison(dA.id, dB.id, filters);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Computation failed" }, { status: 500 });
  }
}
