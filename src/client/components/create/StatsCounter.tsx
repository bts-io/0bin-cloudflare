import { useEffect, useState } from "react";
import { getStats } from "../../lib/api";
import { formatCount } from "../../lib/create";

/** "pastes 1,284" in the header. Stats are gated like create, so any failure just hides the counter. */
export function StatsCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    getStats()
      .then((s) => {
        if (live) setCount(s.pastesCreated);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (count === null) return null;
  return <span>pastes {formatCount(count)}</span>;
}
