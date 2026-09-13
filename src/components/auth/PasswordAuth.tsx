"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { AuthCaptcha } from "@/components/auth/AuthCaptcha";
import { AuthErrorMessage } from "@/components/auth/AuthErrorMessage";
import type { AuthMode } from "@/components/auth/AuthPage";
import { AUTH_LINK_CLASS } from "@/components/auth/authLinkClass";
import { AuthEmailField } from "@/components/auth/AuthEmailField";
import { AuthConfirmationCard } from "@/components/auth/AuthConfirmationCard";
import { PasswordField } from "@/components/auth/PasswordField";
import { useTurnstileCaptcha } from "@/lib/hooks/useTurnstileCaptcha";
import { usePasswordBreachCheck } from "@/lib/hooks/usePasswordBreachCheck";
import { isPasswordTooShort } from "@/lib/auth/password-policy";
import { isSignupDisabledError } from "@/lib/auth/format-auth-error";
import { useTranslation } from "@/lib/i18n/useTranslation";

// Same confirmation copy for every sign-up success — Supabase gives no
// signal to distinguish a new email from an already-registered one.
export function PasswordAuth({
  mode,
  onSwitchToSignIn,
  onForgotPassword,
  onSwitchToMagicLink,
}: {
  mode: AuthMode;
  onSwitchToSignIn: () => void;
  onForgotPassword?: () => void;
  onSwitchToMagicLink?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);
  const { t } = useTranslation();
  const {
    siteKey,
    captchaToken,
    setCaptchaToken,
    turnstileRef,
    handleCaptchaExpire,
    resetCaptcha,
    captchaMissing,
  } = useTurnstileCaptcha();
  const { breached, checkOnBlur, clearBreach } = usePasswordBreachCheck();
  const { signUpWithPassword, signInWithPassword } = useAuth();

  const passwordTooShort = isPasswordTooShort(password);
  const showForgotPassword = mode === "sign-in" && !!onForgotPassword;

  const handlePasswordBlur = () => {
    checkOnBlur(password, mode !== "sign-up" || passwordTooShort);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || passwordTooShort || captchaMissing) return;

    setLoading(true);
    setError(null);

    try {
      const { error: authError } =
        mode === "sign-up"
          ? await signUpWithPassword(email, password, captchaToken ?? undefined)
          : await signInWithPassword(
              email,
              password,
              captchaToken ?? undefined,
            );

      if (authError) {
        const message = authError.message || t("auth.error.authFailedFallback");
        setError(
          isSignupDisabledError(message)
            ? t("auth.error.signupDisabled")
            : message,
        );
      } else if (mode === "sign-up") {
        setSignedUp(true);
      }
    } catch (err) {
      setError(t("auth.error.unexpected"));
      console.error(err);
    } finally {
      resetCaptcha();
      setLoading(false);
    }
  };

  if (signedUp) {
    return (
      <AuthConfirmationCard
        motionKey="signup-confirmation"
        title={t("auth.confirm.checkInbox")}
        description={
          <>
            {t("auth.confirm.signUpNewPrefix")}
            <span className="font-medium text-foreground">{email}</span>
            {t("auth.confirm.signUpNewSuffix")}
          </>
        }
        actionLabel={t("auth.action.signInInstead")}
        onAction={onSwitchToSignIn}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <AuthEmailField
        id="password-auth-email"
        value={email}
        onChange={setEmail}
        disabled={loading}
      />

      <PasswordField
        id="password-auth-password"
        label={t("auth.password.label")}
        labelClassName="text-[13px]"
        value={password}
        onChange={(value) => {
          setPassword(value);
          clearBreach();
        }}
        onBlur={handlePasswordBlur}
        disabled={loading}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        passwordTooShort={passwordTooShort}
        breached={breached}
      >
        {(showForgotPassword || onSwitchToMagicLink) && (
          <div className="flex items-center justify-between gap-4">
            {showForgotPassword && (
              <button
                type="button"
                onClick={onForgotPassword}
                className={AUTH_LINK_CLASS}
              >
                {t("auth.password.forgot")}
              </button>
            )}
            {onSwitchToMagicLink && (
              <button
                type="button"
                onClick={onSwitchToMagicLink}
                className={AUTH_LINK_CLASS}
              >
                {t("auth.password.useMagicLink")}
              </button>
            )}
          </div>
        )}
      </PasswordField>

      <AuthCaptcha
        siteKey={siteKey}
        setCaptchaToken={setCaptchaToken}
        handleCaptchaExpire={handleCaptchaExpire}
        turnstileRef={turnstileRef}
      />

      <AuthErrorMessage error={error} />

      <Button
        type="submit"
        className="w-full h-11 text-base font-medium transition-all"
        disabled={
          loading || !email || !password || passwordTooShort || captchaMissing
        }
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {mode === "sign-up"
              ? t("auth.action.signingUp")
              : t("auth.action.signingIn")}
          </>
        ) : mode === "sign-up" ? (
          t("auth.action.signUp")
        ) : (
          t("auth.action.signIn")
        )}
      </Button>
    </form>
  );
}
