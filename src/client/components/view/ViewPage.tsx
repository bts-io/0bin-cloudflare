import { useEffect, useState } from "react";
import { decryptPaste, deriveReadToken } from "../../../shared/crypto";
import { getMeta, getPaste } from "../../lib/api";
import { findHistory, forgetHistory } from "../../lib/history";
import { isPasteId, parseKey, viewFailure } from "../../lib/view";
import { Button } from "../Button";
import { Shell } from "../Shell";
import { FOCUS, Message, newPasteNav } from "./Message";
import { NotFound } from "./NotFound";
import { type OpenedPaste, PasteView } from "./PasteView";

type State =
  | { name: "loading" }
  | { name: "no-key" }
  | { name: "not-found" }
  | { name: "bad-key" }
  | { name: "failed" }
  | { name: "burn-warning"; ikm: string; readToken: string }
  | { name: "open"; paste: OpenedPaste };

async function openPaste(
  id: string,
  ikm: string,
  tokens: { readToken: string } | { ownerToken: string },
): Promise<State> {
  const read = await getPaste(id, tokens);
  const decrypted = await decryptPaste(ikm, read.ciphertext, read.kind);
  const ownerToken = "ownerToken" in tokens ? tokens.ownerToken : undefined;
  return { name: "open", paste: { ...decrypted, read, ownerToken } };
}

function failed(id: string, err: unknown): State {
  const name = viewFailure(err);
  if (name === "not-found") forgetHistory(id);
  return { name };
}

/**
 * The view page (spec 8.2). The server renders only the loading shell: the key lives in the fragment, which the
 * server never sees, so every step below runs in the browser after hydration.
 */
export function ViewPage({ id }: { id: string }) {
  const [state, setState] = useState<State>({ name: "loading" });
  // Bumped on retry and when the fragment changes in place (a different link pasted into this tab).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onHash = () => setAttempt((n) => n + 1);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setState({ name: "loading" });
    const ikm = parseKey(window.location.hash);
    if (!ikm) return setState({ name: "no-key" });
    if (!isPasteId(id)) return setState({ name: "not-found" });
    let live = true;
    const ownerToken = findHistory(id)?.ownerToken;
    const load = async (): Promise<State> => {
      // The creator peeks with the owner token, which never burns (spec 6.3).
      if (ownerToken) return openPaste(id, ikm, { ownerToken });
      const readToken = await deriveReadToken(ikm);
      const meta = await getMeta(id, readToken);
      // A burn paste is only fetched after an explicit click, so link unfurlers and prefetchers never burn it.
      if (meta.burn) return { name: "burn-warning", ikm, readToken };
      return openPaste(id, ikm, { readToken });
    };
    load()
      .catch((err) => failed(id, err))
      .then((next) => {
        if (live) setState(next);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const reveal = (ikm: string, readToken: string) => {
    setState({ name: "loading" });
    openPaste(id, ikm, { readToken })
      .catch((err) => failed(id, err))
      .then(setState);
  };

  if (state.name === "not-found") return <NotFound />;

  return (
    <Shell nav={newPasteNav}>
      {state.name === "loading" && (
        <Message label="0bin">
          <p className="text-muted">loading paste</p>
        </Message>
      )}
      {state.name === "no-key" && (
        <Message label="no key" role="alert">
          <h1 className="text-ink">this link is missing its key</h1>
          <p className="text-xs text-muted">
            the key is the part after # in the link. ask the sender for the complete link.
          </p>
        </Message>
      )}
      {state.name === "bad-key" && (
        <Message label="cannot decrypt" role="alert">
          <h1 className="text-ink">wrong or damaged key</h1>
          <p className="text-xs text-muted">
            check that the whole link was copied, including the part after #.
          </p>
        </Message>
      )}
      {state.name === "failed" && (
        <Message label="error" role="alert">
          <h1 className="text-ink">could not load this paste</h1>
          <p className="text-xs text-muted">check your connection and try again.</p>
          <Button className={FOCUS} onClick={() => setAttempt((n) => n + 1)}>
            retry
          </Button>
        </Message>
      )}
      {state.name === "burn-warning" && (
        <Message label="burn after reading">
          <h1 className="text-warn">this paste will be destroyed after you open it</h1>
          <p className="text-xs text-muted">
            once revealed it is gone from the server. copy what you need then.
          </p>
          <Button variant="primary" className={FOCUS} onClick={() => reveal(state.ikm, state.readToken)}>
            reveal and destroy
          </Button>
        </Message>
      )}
      {state.name === "open" && <PasteView id={id} paste={state.paste} />}
    </Shell>
  );
}
