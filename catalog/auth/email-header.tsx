/* eslint-disable shadcn/no-inline-styles -- Email clients need inline styles independently of the web stylesheet. */
import { Img, Section } from "@react-email/components";

// This public PNG is generated from @/components/logo-iso by createIconImage.
// Use it instead of inline SVG so all email templates share the application's logo.
const EmailHeader = ({ baseUrl }: { baseUrl: string }) => (
  <Section style={{ paddingBottom: "40px" }}>
    <Img
      alt="Application logo"
      height={48}
      src={new URL("/icons/apple-light.png", baseUrl).href}
      style={{ border: 0, display: "block" }}
      width={48}
    />
  </Section>
);

export { EmailHeader };
