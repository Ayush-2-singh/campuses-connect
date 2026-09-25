import { redirect } from 'next/navigation'

/**
 * The root route now opens directly into the product (spec §2): no
 * marketing/intro wall before the real Home experience. The old landing
 * page stays available at /about — reachable from the footer/help — so the
 * "What is CampusConnect?" explanation isn't lost, it's just not the gate.
 */
export default function RootPage() {
  redirect('/feed')
}
