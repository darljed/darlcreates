/**
 * Renders owner-written legal text. Only React elements, never HTML; links were validated by the parser.
 */
import { CmsLink } from "@/components/cms";
import { parseLegalBody, type Inline } from "@/lib/site-content-schema";

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.href ? (
          <CmsLink key={i} href={p.href} className="font-medium text-primary underline">
            {p.text}
          </CmsLink>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Renders owner-written legal text. Only React elements, never HTML; links were validated by the parser. */
export function LegalBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed text-muted-foreground">
      {parseLegalBody(body).map((b, i) =>
        b.type === "h2" ? (
          <h2 key={i} className="!mt-6 text-lg font-bold text-foreground">
            {b.text}
          </h2>
        ) : b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Inlines parts={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Inlines parts={b.parts} />
          </p>
        ),
      )}
    </div>
  );
}
