import { Shell } from "../Shell";
import { Message, newPasteNav } from "./Message";

/**
 * The single not-found page (spec 8.4): missing, expired, already burned and wrong token all look the same, and
 * unknown routes reuse it (the root route's notFoundComponent, served with HTTP 404).
 */
export function NotFound() {
  return (
    <Shell nav={newPasteNav}>
      <Message label="not found" role="alert">
        <h1 className="text-ink">this paste does not exist, has expired, or has already been read.</h1>
      </Message>
    </Shell>
  );
}
