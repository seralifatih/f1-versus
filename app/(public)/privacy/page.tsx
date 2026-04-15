import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How F1-Versus collects and uses data.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: false },
};

export default function PrivacyPage() {
  const lastUpdated = "April 15, 2026";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1
        className="mb-2 text-3xl font-black tracking-tight"
        style={{ letterSpacing: "-0.03em" }}
      >
        Privacy Policy
      </h1>
      <p className="mb-10 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Last updated: {lastUpdated}
      </p>

      <ProseSection title="Who we are">
        F1-Versus is operated by Nokta Studio. We publish head-to-head Formula 1
        driver comparison statistics at{" "}
        <a href="https://f1-versus.com" className="underline hover:text-white">
          f1-versus.com
        </a>
        . Questions? Email{" "}
        <a
          href="mailto:privacy@f1-versus.com"
          className="underline hover:text-white"
        >
          privacy@f1-versus.com
        </a>
        .
      </ProseSection>

      <ProseSection title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Usage data.</strong> We use Cloudflare Web Analytics to
            measure page views and performance. It does not set cookies and does
            not track you across sites.
          </li>
          <li>
            <strong>Votes.</strong> When you cast a vote on a driver comparison,
            we store a one-way cryptographic hash of your IP address together
            with the comparison slug. We never store your raw IP address. The
            hash is used solely to prevent duplicate votes.
          </li>
          <li>
            <strong>Advertising.</strong> If you accept our cookie notice,
            Google AdSense may set cookies and use your data to show personalised
            ads. See{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              Google&apos;s Privacy Policy
            </a>{" "}
            for details.
          </li>
          <li>
            <strong>Embedded widgets.</strong> The embed widget does not set
            cookies. It links back to the full comparison page.
          </li>
        </ul>
      </ProseSection>

      <ProseSection title="Cookies">
        We only load advertising cookies (Google AdSense) after you click
        &quot;Accept&quot; in our cookie banner. Cloudflare Web Analytics is
        cookie-free and runs regardless of your cookie choice.
        <br />
        <br />
        You can withdraw consent at any time by clearing your browser cookies and
        declining when the banner reappears.
      </ProseSection>

      <ProseSection title="Your rights (EEA / UK)">
        Under GDPR and UK GDPR you have the right to access, correct, or delete
        personal data we hold about you, and to object to or restrict processing.
        Because we do not store any directly identifiable personal data (only
        hashed IPs), we cannot identify you from a hashed value alone. If you
        believe we hold data about you, contact{" "}
        <a
          href="mailto:privacy@f1-versus.com"
          className="underline hover:text-white"
        >
          privacy@f1-versus.com
        </a>
        .
      </ProseSection>

      <ProseSection title="Data retention">
        Vote hashes are retained indefinitely to prevent duplicate votes.
        Analytics data is retained for 30 days by Cloudflare. We do not sell or
        share any data with third parties beyond the advertising partner (Google)
        when you have accepted cookies.
      </ProseSection>

      <ProseSection title="Children">
        This site is not directed at children under 13. We do not knowingly
        collect data from children.
      </ProseSection>

      <ProseSection title="Changes">
        We may update this policy. We&apos;ll update the &quot;Last updated&quot;
        date above. Continued use of the site after a change constitutes
        acceptance of the new policy.
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
