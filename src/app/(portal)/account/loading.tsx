import { PageHeader } from "@/components/shell/ui";
import { AccountSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <PageHeader title="My account" />
      <AccountSkeleton />
    </>
  );
}
