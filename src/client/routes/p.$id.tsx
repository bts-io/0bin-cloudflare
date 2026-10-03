import { createFileRoute } from "@tanstack/react-router";
import { ViewPage } from "../components/view/ViewPage";
import viewCss from "../components/view/view.css?url";

export const Route = createFileRoute("/p/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
    links: [{ rel: "stylesheet", href: viewCss }],
  }),
  component: View,
});

function View() {
  const { id } = Route.useParams();
  // Keyed by id: following a link to another paste starts from a clean loading state.
  return <ViewPage key={id} id={id} />;
}
