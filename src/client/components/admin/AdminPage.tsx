import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AdminStats,
  adminFailure,
  clearToken,
  deleteAdminPaste,
  getAdminStats,
  loadToken,
  purgeExpired,
  saveToken,
} from "../../lib/admin";
import { Button } from "../Button";
import { Panel } from "../Panel";
import { Shell } from "../Shell";
import { DeleteByRef } from "./DeleteByRef";
import { PasteTable } from "./PasteTable";
import { PurgeButton } from "./PurgeButton";
import { StatsCards } from "./StatsCards";
import { TokenPrompt } from "./TokenPrompt";
import { usePastes } from "./usePastes";

type Phase = "loading" | "ready" | "token" | "forbidden" | "disabled" | "failed";

const BLOCKED: Partial<Record<Phase, string>> = {
  forbidden: "your account is not an admin",
  disabled: "admin is not enabled on this server",
  failed: "could not reach the admin api, try again",
};

/**
 * Admin page (spec 8.3). The server renders only the frame and "loading admin"; the token is read and every
 * call made after mount; a 401 asks for the admin token.
 */
export function AdminPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [status, setStatus] = useState("loading admin");

  // The token the last request went out with, so a 401 can tell "no token yet" from "token rejected".
  const sent = useRef<string | null>(null);

  const fail = useCallback((err: unknown) => {
    const kind = adminFailure(err);
    if (kind === "token") {
      clearToken();
      setRejected(sent.current !== null);
      sent.current = null;
      setToken(null);
      setPhase("token");
      setStatus("admin token required");
    } else if (kind === "failed") {
      setStatus("request failed, try again");
    } else {
      setPhase(kind);
      setStatus(BLOCKED[kind] ?? "");
    }
  }, []);

  const start = useCallback(
    (t: string | null) => {
      sent.current = t;
      setToken(t);
      setPhase("loading");
      setStatus("loading admin");
      getAdminStats(t)
        .then((s) => {
          setStats(s);
          setRejected(false);
          setPhase("ready");
          setStatus("");
        })
        .catch((err) => {
          if (adminFailure(err) !== "failed") return fail(err);
          setPhase("failed");
          setStatus("");
        });
    },
    [fail],
  );

  useEffect(() => start(loadToken()), [start]);

  const pastes = usePastes(token, phase === "ready", fail);

  const refreshStats = () => getAdminStats(token).then(setStats).catch(fail);

  const remove = async (id: string) => {
    try {
      const deleted = await deleteAdminPaste(token, id);
      pastes.remove(id);
      setStatus(deleted ? `deleted ${id}` : `${id} was already gone`);
      await refreshStats();
    } catch (err) {
      fail(err);
    }
  };

  const purge = async () => {
    try {
      const { deleted } = await purgeExpired(token);
      setStatus(`purged ${deleted} expired ${deleted === 1 ? "paste" : "pastes"}`);
      if (pastes.state === "expired") pastes.reload();
      await refreshStats();
      return deleted;
    } catch (err) {
      fail(err);
      return null;
    }
  };

  const signIn = (t: string) => {
    saveToken(t);
    start(t);
  };

  const signOut = () => {
    clearToken();
    sent.current = null;
    setToken(null);
    setStats(null);
    setRejected(false);
    setPhase("token");
    setStatus("signed out");
  };

  const blocked = BLOCKED[phase];

  return (
    <Shell
      nav={
        token && (
          <button type="button" onClick={signOut} className="hover:text-ink">
            sign out
          </button>
        )
      }
    >
      <h1 className="mt-1 text-xs text-muted">admin · pastes, stats and cleanup</h1>
      <p aria-live="polite" className="mt-4 min-h-4 text-xs text-muted">
        {status}
      </p>

      {phase === "token" && <TokenPrompt rejected={rejected} onSubmit={signIn} />}
      {blocked && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <p role="alert" className="text-danger">
            {blocked}
          </p>
          {phase === "failed" && <Button onClick={() => start(token)}>retry</Button>}
        </div>
      )}

      {phase === "ready" && stats && (
        <>
          <StatsCards stats={stats} />
          <Panel label="tools" tone="accent-2" className="mt-8 space-y-4 px-4 pt-5 pb-4">
            <DeleteByRef onDelete={remove} />
            <PurgeButton onPurge={purge} />
          </Panel>
          <PasteTable
            state={pastes.state}
            onStateChange={pastes.setState}
            items={pastes.items}
            hasMore={pastes.hasMore}
            loading={pastes.loading}
            onLoadMore={pastes.loadMore}
            onDelete={remove}
          />
        </>
      )}
    </Shell>
  );
}
