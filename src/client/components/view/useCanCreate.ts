import { useEffect, useState } from "react";
import { teamKeyHeaders } from "../../lib/team-key";

/**
 * Whether this browser may create pastes, so the view page only offers "new paste" and "clone" to people who
 * can use them. `/api/stats` sits behind the same gate as create: open lets anyone in, token mode needs the
 * saved team key (401 without it), and when creating is off it is a 404.
 */
export function useCanCreate(): boolean {
  const [canCreate, setCanCreate] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/stats", { headers: teamKeyHeaders() })
      .then((res) => {
        if (live) setCanCreate(res.ok);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return canCreate;
}
