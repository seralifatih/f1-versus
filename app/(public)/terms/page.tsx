import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms and conditions for using F1-Versus.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: false },
};

export default function TermsPage() {
  const lastUpdated = "April 15, 2026";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1
        className="mb-2 text-3xl font-black tracking-tight"
        style={{ letterSpacing: "-0.03em" }}
      >
        Terms of Use
      </h1>
      <p className="mb-10 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Last updated: {lastUpdated}
      </p>

      <ProseSection title="Acceptance">
        By accessing f1-versus.com you agree to these terms. If you do not agree,
        please do not use the site.
      </ProseSection>

      <ProseSection title="What this site is">
        F1-Versus is a fan statistics site. It publishes publicly available Formula
        1 race data in a structured, comparative format. All F1 data is sourced
        from the{" "}
        <a
          href="https://api.jolpi.ca/ergast/f1/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-white"
        >
          Jolpica/Ergast API
        </a>
        . F1-Versus is not affiliated with, endorsed by, or sponsored by Formula
        One Management, the FIA, or any F1 team or driver.
      </ProseSection>

      <ProseSection title="Intellectual property">
        The site design, code, and written analysis on F1-Versus are © Nokta
        Studio. F1 race statistics are factual data and are not subject to
        copyright. Driver and team names are trademarks of their respective
        owners; use here is purely for identification in a statistical context
        (nominative fair use).
      </ProseSection>

      <ProseSection title="Embed widget">
        You may embed the F1-Versus comparison widget on your own website or blog
        using the provided{" "}
        <code className="rounded px-1 py-0.5 text-xs" style={{ backgroundColor: "#1a1a1a" }}>
          &lt;iframe&gt;
        </code>{" "}
        code. You must not remove or obscure the F1-Versus watermark or the link
        back to the full comparison page. You may not scrape, mirror, or
        redistribute site content in bulk.
      </ProseSection>

      <ProseSection title="Accuracy">
        Statistics are computed from public race data and are provided for
        entertainment and informational purposes. We make no guarantee of
        accuracy. Discrepancies may exist between F1-Versus figures and official
        records due to data source limitations, era normalisations, or computation
        choices.
      </ProseSection>

      <ProseSection title="Voting">
        Community votes are informal polls with no official meaning. One vote per
        IP address per comparison is enforced by a one-way hash. Votes cannot be
        deleted by users.
      </ProseSection>

      <ProseSection title="Advertising">
        The site is supported by Google AdSense advertising. Ads are subject to
        Google&apos;s advertising policies. We are not responsible for the content
        of third-party ads.
      </ProseSection>

      <ProseSection title="Disclaimer of warranties">
        The site is provided &quot;as is&quot; without warranties of any kind.
        Nokta Studio is not liable for any damages arising from your use of the
        site.
      </ProseSection>

      <ProseSection title="Governing law">
        These terms are governed by the laws of Turkey. Disputes shall be resolved
        in the courts of Istanbul.
      </ProseSection>

      <ProseSection title="Contact">
        For legal enquiries:{" "}
        <a
          href="mailto:legal@f1-versus.com"
          className="underline hover:text-white"
        >
          legal@f1-versus.com
        </a>
      </ProseSection>
    </div>
  );
}

function ProseSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2
        className="mb-3 text-lg font-bold"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </h2>
      <div
        className="text-sm leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {children}
      </div>
    </section>
  );
}
