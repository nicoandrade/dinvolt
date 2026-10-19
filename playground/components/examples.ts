// The gallery embeds the actual public route, without a mock preview wrapper.
export const publicHome = {
  id: "public-home",
  title: "Home page",
  source: "catalog/ui/public-page.tsx",
} as const;

export const examples = [
  {
    id: "settings",
    title: "Settings page",
    group: "Administration",
    source: "catalog/registry/admin-panel/settings/settings-layout.tsx",
    description:
      "Example general and preference forms on separate pages with shared Admin Tabs navigation.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Navigate between General and Preferences, preview a local logo, validate fields and discard changes. Nothing is persisted.",
      },
    ],
  },
  {
    id: "user",
    title: "User detail page",
    group: "Administration",
    source: "catalog/registry/admin-panel/users/user-page.tsx",
    description:
      "User details with a shared page header, compact key fields and an outline edit action.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "View the user's key fields and edit their name and email. Changes stay in this preview tab.",
      },
      {
        id: "missing",
        title: "User not found",
        hint: "A missing or deleted account with a link back to users.",
      },
      {
        id: "network",
        title: "Connection error",
        hint: "Retry without replacing the static fields or navigation.",
      },
      {
        id: "pending",
        title: "Fetching user",
        hint: "Only the user's name and field values wait for data.",
      },
      {
        id: "skeleton",
        title: "Checking access",
        hint: "The back link, edit action and field labels remain visible while access is checked.",
      },
    ],
  },
  {
    id: "users",
    title: "Users page",
    group: "Administration",
    source: "catalog/registry/admin-panel/users/users-page.tsx",
    description:
      "Better Auth users with a shared page header, a creation sheet and server-side table controls.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Create a user in the sheet, search, filter roles and share the table URL. Preview data stays in this tab; Export CSV downloads matching users.",
      },
      { id: "empty", title: "Empty", hint: "The same table without users." },
      {
        id: "export-error",
        title: "Export retry",
        hint: "The first CSV export fails; retry to download without losing the table.",
      },
      {
        id: "network",
        title: "Connection error",
        hint: "A safe error with a retry action.",
      },
      {
        id: "pending",
        title: "Fetching users",
        hint: "The initial table skeleton while the request is pending.",
      },
      {
        id: "skeleton",
        title: "Checking access",
        hint: "Static controls and headers remain visible; only rows and totals wait for authorized data.",
      },
      {
        id: "live",
        title: "Real application",
        hint: "The protected /admin/users route requires a real administrator session.",
      },
    ],
  },
  {
    id: "home",
    title: "Admin home page",
    group: "Administration",
    source: "catalog/registry/admin-panel/home/admin-page.tsx",
    description: "The admin Home with a sidebar-08 inset layout and user menu.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Toggle the sidebar, open the user menu and check mobile navigation.",
      },
      {
        id: "pending",
        title: "Signing out",
        hint: "Open the user menu and sign out to check the pending state.",
      },
      {
        id: "network",
        title: "Sign-out error",
        hint: "Sign out from the user menu to check connection error feedback and retry.",
      },
      {
        id: "skeleton",
        title: "Checking access",
        hint: "Navigation and the Home heading remain visible; only the account and welcome name wait.",
      },
      {
        id: "live",
        title: "Real application",
        hint: "The protected /admin/home route requires a real administrator session.",
      },
    ],
  },
  {
    id: "login",
    title: "Login page",
    group: "Administration",
    source: "catalog/registry/admin-panel/auth/login-page.tsx",
    description:
      "The default admin login, with its original layout, theme and form.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Enter an email and password, then submit to see the credentials error.",
      },
      {
        id: "invalid",
        title: "Validation",
        hint: "Submit empty fields or enter an invalid email to check validation and focus.",
      },
      {
        id: "pending",
        title: "Submitting",
        hint: "Enter an email and password, then submit. The request stays pending until you reset the preview.",
      },
      {
        id: "credentials",
        title: "Incorrect credentials",
        hint: "Submit any email and password to see the authentication error.",
      },
      {
        id: "network",
        title: "Connection error",
        hint: "Submit any email and password to simulate a connection failure.",
      },
      {
        id: "denied",
        title: "Access denied",
        hint: "The same access-denied view shown to a signed-in account without admin access.",
      },
      {
        id: "live",
        title: "Real application",
        hint: "The actual /admin route. Signing in requires the generated app's database configuration and an administrator.",
      },
    ],
  },
  {
    id: "action-button",
    title: "Action button",
    group: "Components",
    source: "catalog/registry/shared/actions/action-button.tsx",
    description:
      "Shared async action feedback with animated text and icon swaps, stable width and reduced motion support.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Try icon-and-text, text-only, icon-only and login actions. Each simulates a short operation.",
      },
      {
        id: "pending",
        title: "In progress",
        hint: "Pending labels and the shared Spinner while repeat activation is disabled.",
      },
    ],
  },
  {
    id: "delete-button",
    title: "Delete button",
    group: "Components",
    source: "catalog/registry/shared/actions/delete-button.tsx",
    description:
      "Two-step destructive action with shared text and icon transitions, animated natural width and outside-click cancellation.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Confirm with a second click. Click outside, move focus away or press Escape to cancel. Double-clicks do not delete.",
      },
      {
        id: "pending",
        title: "In progress",
        hint: "Deletion is pending and repeated activation is disabled.",
      },
      {
        id: "error",
        title: "Failed deletion",
        hint: "Confirm deletion to simulate an error. Retrying requires confirmation again.",
      },
      {
        id: "disabled",
        title: "Disabled",
        hint: "Unavailable actions cannot enter confirmation.",
      },
    ],
  },
  {
    id: "spinner",
    title: "Spinner",
    group: "Components",
    source: "catalog/registry/shared/spinner/spinner.tsx",
    description:
      "Dinvolt's custom SVG spinner, installed in new admin panels with the shadcn/ui Spinner API.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "A filled SVG arc rotating every 500 ms. Respects reduced motion preferences.",
      },
      {
        id: "sizes",
        title: "Sizes",
        hint: "Use className to set the size: size-4, size-6 and size-8.",
      },
      {
        id: "button",
        title: "Button",
        hint: "The same spinner inside a disabled admin button.",
      },
    ],
  },
  {
    id: "form",
    title: "Login form",
    group: "Administration",
    source: "catalog/registry/admin-panel/auth/login-form.tsx",
    description: "The original form in a neutral preview container.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Use Tab, enter values and submit to test the form.",
      },
      {
        id: "pending",
        title: "Submitting",
        hint: "Submit any email and password to hold the form in its pending state.",
      },
      {
        id: "credentials",
        title: "Incorrect credentials",
        hint: "Submit any email and password to see the authentication error.",
      },
      {
        id: "network",
        title: "Connection error",
        hint: "Submit any email and password to simulate a connection failure.",
      },
    ],
  },
  {
    id: "sign-out",
    title: "Sign out",
    group: "Administration",
    source: "catalog/registry/admin-panel/auth/sign-out-button.tsx",
    description:
      "Sign-out action with the shared Spinner, animated pending label and error feedback.",
    scenarios: [
      {
        id: "default",
        title: "Request error",
        hint: "Click Sign out to see its error state. No real session is changed.",
      },
      {
        id: "pending",
        title: "Signing out",
        hint: "Click Sign out to show the Spinner and Signing out… label while the request stays pending.",
      },
      {
        id: "network",
        title: "Connection error",
        hint: "Click Sign out to simulate a connection failure.",
      },
    ],
  },
  {
    id: "error",
    title: "Access error page",
    group: "Administration",
    source: "catalog/registry/admin-panel/shell/admin-error.tsx",
    description: "The actual access-verification error boundary UI.",
    scenarios: [
      {
        id: "default",
        title: "Default",
        hint: "Try again resets this preview.",
      },
    ],
  },
] as const;

// Both areas exercise the same contracts using their own installed components.
export const publicExamples = examples.filter(
  (item) => item.id === "action-button" || item.id === "delete-button"
);
