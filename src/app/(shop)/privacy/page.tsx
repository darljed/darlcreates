export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-6 py-12 prose-sm">
        <h1 className="text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mt-4 text-muted-foreground">
          Darl Creates respects your privacy and handles personal data in line
          with the Philippine Data Privacy Act of 2012 (RA 10173).
        </p>

        <Section title="What we collect">
          Your name and email (from Google sign-in), shipping address and mobile
          number for delivery, order and payment details (including the GCash
          reference number you submit), and any images you upload to customize a
          product.
        </Section>
        <Section title="How we use it">
          To process and deliver your orders, verify GCash payments, send you
          order updates, and provide customer support. We do not sell your data.
        </Section>
        <Section title="Payments">
          We are not yet BIR-registered. We issue an Order Acknowledgment (a
          non-VAT sales record), not an Official Receipt. GCash payments are
          verified manually against the reference number you provide.
        </Section>
        <Section title="Your rights">
          You may access, correct, or request deletion of your personal data.
          Email{" "}
          <a className="underline" href="mailto:darljedmatundan@gmail.com">
            darljedmatundan@gmail.com
          </a>{" "}
          and we will act on your request.
        </Section>
        <Section title="Retention & security">
          We keep order records for legitimate business and tax purposes and
          protect your data with access controls and encryption in transit.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
