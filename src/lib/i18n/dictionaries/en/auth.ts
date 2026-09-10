import type { DictionaryValue, TranslationParams } from "../../types";

/**
 * English `auth` module — sign-in / sign-up / password-reset screens
 * (ticket 04). Sentences with embedded content (an email, a link) are
 * split into prefix/suffix pieces so the JSX can interleave the
 * user-specific part.
 */
export const auth = {
  "auth.heading.signIn": "Welcome back",
  "auth.heading.signUp": "Create your account",
  "auth.toggle.toSignUp": "New here? Create an account",
  "auth.toggle.toSignIn": "Already have an account? Sign in",
  "auth.tagline": "Work quietly. Own everything.",
  "auth.loading": "Loading...",
  "auth.error.authFailed": "Authentication failed. Please try again.",
  "auth.error.unexpected": "An unexpected error occurred",
  "auth.error.authFailedFallback": "Authentication failed",
  "auth.error.magicLinkFailed": "Failed to send magic link",
  "auth.error.updatePasswordFailed": "Failed to update password",
  "auth.error.signupDisabled":
    "This app is private. Only authorized users can sign in.",

  "auth.email.label": "Email address",
  "auth.email.placeholder": "name@example.com",
  "auth.password.label": "Password",
  "auth.password.forgot": "Forgot password?",
  "auth.password.useMagicLink": "Email me a link instead",
  "auth.password.usePassword": "Use a password instead",
  "auth.password.new": "New password",
  "auth.password.confirm": "Confirm password",
  // Lowercase variants for the visibility-toggle aria-label
  // ("Show new password") — kept as separate keys so visible labels
  // stay capitalized while the aria phrasing is preserved verbatim.
  "auth.password.newToggle": "new password",
  "auth.password.confirmToggle": "confirm password",
  "auth.password.mismatch": "Passwords do not match.",
  "auth.password.tooShort": (params: TranslationParams) =>
    `Password must be at least ${params.min} characters.`,
  "auth.password.breachWarning":
    "This password has appeared in known data breaches. You can still use it, but choosing a different one is safer.",
  "auth.password.toggleVisibility": "password",
  "auth.password.showLabel": "Show {label}",
  "auth.password.hideLabel": "Hide {label}",

  "auth.action.signUp": "Sign up",
  "auth.action.signIn": "Sign in",
  "auth.action.signingUp": "Signing up...",
  "auth.action.signingIn": "Signing in...",
  "auth.action.continue": "Continue",
  "auth.action.continuing": "Continuing...",
  "auth.action.sendResetLink": "Send reset link",
  "auth.action.sending": "Sending...",
  "auth.action.backToSignIn": "Back to sign in",
  "auth.action.signInInstead": "Sign in instead",
  "auth.action.retryEmail": "Didn't get the email? Try again",
  "auth.action.updatePassword": "Update password",
  "auth.action.updating": "Updating...",
  "auth.action.continueAsGuest": "Continue as guest",
  "auth.action.orContinueWith": "Or continue with",

  "auth.confirm.checkInbox": "Check your inbox",
  "auth.confirm.checkEmail": "Check your email",
  "auth.confirm.signUpNewPrefix": "If ",
  "auth.confirm.signUpNewSuffix":
    " is new, we've sent a link to finish setting up your account. Already have an account? Sign in instead.",
  "auth.confirm.magicLinkPrefix": "We've sent a magic link to ",
  "auth.confirm.magicLinkSuffix": ". Click it to sign in.",
  "auth.confirm.resetAccountPrefix": "If ",
  "auth.confirm.resetAccountSuffix":
    " has an account, we've sent a link to reset the password.",
  "auth.confirm.resetNotRequestedPrefix":
    "Didn't request this? You can ignore the email, or ",
  "auth.confirm.resetNotRequestedSuffix": ".",
  "auth.confirm.contactSupport": "contact support",

  "auth.emailConfirmed.title": "Email confirmed",
  "auth.emailConfirmed.description":
    "Your account is ready. Sign in to continue.",

  "auth.reset.linkExpiredTitle": "Link expired",
  "auth.reset.linkExpiredDescription":
    "This password reset link is invalid or has expired. Request a new one from the sign-in page.",
  "auth.reset.chooseNewPassword": "Choose a new password",
  "auth.reset.updatedTitle": "Password updated",
  "auth.reset.updatedDescription":
    "You can now use your new password to sign in.",

  "auth.legal.agree": "By continuing, you agree to our ",
  "auth.legal.terms": "Terms of Service",
  "auth.legal.and": " and ",
  "auth.legal.privacy": "Privacy Policy",
  "auth.legal.guestNote":
    ". Guest data is stored locally and will be lost if cleared.",
} satisfies Record<string, DictionaryValue>;
