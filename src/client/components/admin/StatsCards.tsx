import type { AdminStats } from "../../lib/admin";
import { formatCount } from "../../lib/create";
import { formatBytes } from "../../lib/format";
import { Panel } from "../Panel";

/** The four numbers from /api/admin/stats, one boxed card each. */
export function StatsCards({ stats }: { stats: AdminStats }) {
  const cards: ReadonlyArray<readonly [string, string]> = [
    ["active", formatCount(stats.active)],
    ["burn pending", formatCount(stats.burnPending)],
    ["total size", formatBytes(stats.totalBytes)],
    ["pastes created", formatCount(stats.pastesCreated)],
  ];
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
      {cards.map(([label, value]) => (
        <Panel key={label} label={label} className="px-4 pt-4 pb-3">
          <p className="text-2xl text-ink">{value}</p>
        </Panel>
      ))}
    </div>
  );
}
