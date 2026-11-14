import { LegalBody } from "@/components/legal-body";
import { getLegal } from "@/lib/site-content";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const doc = await getLegal("privacy");
  return pageMetadata({ title: doc.title, description: "How we collect, use and protect your personal data under the Philippine Data Privacy Act (RA 10173).", path: "/privacy" });
}

/** Text is owner-editable in Admin → Legal pages. */
export default async function PrivacyPage() {
  const doc = await getLegal("privacy");
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-extrabold">{doc.title}</h1>
        {doc.effective && <p className="mt-1 text-sm text-muted-foreground">{doc.effective}</p>}
        <div className="mt-6">
          <LegalBody body={doc.body} />
        </div>
      </div>
    </main>
  );
}
