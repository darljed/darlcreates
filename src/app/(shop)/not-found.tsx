import { NotFoundView } from "@/components/not-found-view";

export const metadata = { title: "Page not found" };

/** notFound() inside the storefront: the shop layout already supplies the header and footer. */
export default function ShopNotFound() {
  return (
    <main className="flex flex-1 flex-col">
      <NotFoundView
        title="That item isn't available"
        message="It may have been removed or renamed. Have a look at what we're printing right now."
      />
    </main>
  );
}
