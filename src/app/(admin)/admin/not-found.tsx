import { NotFoundView } from "@/components/not-found-view";

export const metadata = { title: "Not found · Admin" };

export default function AdminNotFound() {
  return (
    <NotFoundView
      title="Nothing here"
      message="That record doesn't exist, or it was deleted."
      primary={{ href: "/admin", label: "Back to the dashboard" }}
      secondary={null}
    />
  );
}
