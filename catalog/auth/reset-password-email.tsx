/* eslint-disable shadcn/no-inline-styles, shadcn/no-unknown-classes -- Email clients need inline styles and the responsive classes are defined in this email’s Head, independently of the web stylesheet. */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { EmailHeader } from "@/emails/components/email-header";

// Email-safe colors, independent of the public portal's CSS variables and dark mode.
const colors = {
  background: "#fafafa",
  border: "#e5e5e5",
  button: "#262626",
  buttonText: "#ffffff",
  muted: "#737373",
  surface: "#ffffff",
  text: "#262626",
};

// Matte-inspired layout: https://demo.react.email/preview/02-Matte/password-reset
const ResetPasswordEmail = ({ url }: { url: string }) => (
  <Html lang="en">
    <Head>
      <style>{`
        @media only screen and (max-width: 480px) {
          .email-container { padding-top: 24px !important; }
          .email-content { padding-left: 24px !important; padding-right: 24px !important; }
          .email-heading { font-size: 36px !important; line-height: 40px !important; letter-spacing: -1.4px !important; }
        }
      `}</style>
    </Head>
    <Preview>Reset your password. This link expires in one hour.</Preview>
    <Body
      style={{
        backgroundColor: colors.background,
        color: colors.text,
        fontFamily: "Arial, Helvetica, sans-serif",
        margin: 0,
        padding: 0,
      }}
    >
      <Container
        className="email-container"
        style={{
          margin: "0 auto",
          maxWidth: "640px",
          padding: "64px 16px 24px",
          width: "100%",
        }}
      >
        <Section
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
          }}
        >
          <Section className="email-content" style={{ padding: "56px 40px 0" }}>
            <EmailHeader baseUrl={url} />
            <Heading
              as="h1"
              className="email-heading"
              style={{
                color: colors.text,
                fontSize: "48px",
                fontWeight: 400,
                letterSpacing: "-2px",
                lineHeight: "52px",
                margin: "0 0 20px",
              }}
            >
              Reset your password
            </Heading>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "22px",
                margin: "0 0 36px",
              }}
            >
              We received a request to reset your account password. Use the
              button below to choose a new one.
            </Text>
            <Button
              href={url}
              style={{
                backgroundColor: colors.button,
                borderRadius: 0,
                color: colors.buttonText,
                fontSize: "15px",
                fontWeight: 600,
                lineHeight: "22px",
                padding: "14px 20px",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Change password
            </Button>
          </Section>
          <Section
            className="email-content"
            style={{ padding: "56px 40px 32px" }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: "12px",
                lineHeight: "18px",
                margin: "0 0 12px",
                maxWidth: "360px",
              }}
            >
              This link expires in one hour and can only be used once.
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: "12px",
                lineHeight: "18px",
                margin: 0,
                maxWidth: "360px",
              }}
            >
              If you did not request this change, you can ignore this email.
              Your password will stay the same.
            </Text>
          </Section>
          <Section
            className="email-content"
            style={{
              borderTop: `1px solid ${colors.border}`,
              padding: "32px 40px 40px",
            }}
          >
            <Text
              style={{
                color: colors.muted,
                fontSize: "12px",
                lineHeight: "18px",
                margin: "0 0 12px",
              }}
            >
              If the button does not work, copy and paste this link into your
              browser:
            </Text>
            <Link
              href={url}
              style={{
                color: colors.text,
                fontSize: "12px",
                lineHeight: "20px",
                textDecoration: "underline",
                wordBreak: "break-all",
              }}
            >
              {url}
            </Link>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
);

export { ResetPasswordEmail };
