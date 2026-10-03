import { createFileRoute } from "@tanstack/react-router";
import { CreateForm } from "../components/create/CreateForm";
import { HistoryMenu } from "../components/create/HistoryMenu";
import { StatsCounter } from "../components/create/StatsCounter";
import { Shell } from "../components/Shell";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <Shell
      nav={
        <>
          <HistoryMenu />
          <StatsCounter />
        </>
      }
    >
      <p className="mt-1 text-xs text-muted">client-side encrypted pastebin · key lives in the link</p>
      <CreateForm />
      <p className="mt-4 text-xs text-faint">max 1 MiB after compression · text, images, any file</p>
    </Shell>
  );
}
