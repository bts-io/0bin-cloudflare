import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "../components/admin/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "admin · 0bin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});
