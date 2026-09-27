import { useLingui } from "@lingui/react/macro";
import { AuthLayout, ProfileForm, type ProfileValues } from "@q9labsai/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../../auth/auth-client.js";

export const Route = createFileRoute("/settings/profile")({ component: ProfilePage });

const loadProfileSession = () => authClient.useSession();

function ProfilePage() {
  const { t } = useLingui();
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [user, setUser] = useState({ email: "member@dev.local", name: "Dev Member" });

  useEffect(() => {
    let mounted = true;
    void loadProfileSession()
      .then((result) => {
        if (!mounted) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        if (result.value.status === "anonymous") return;
        const account = result.value.session.account;
        setUser({ email: account.email, name: account.name ?? account.email });
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : "Could not load the profile.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const submit = (input: ProfileValues): void => {
    void saveProfile(input);
  };

  const saveProfile = async (input: ProfileValues): Promise<void> => {
    setSubmitting(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await authClient.updateProfile(input);
      if (result.ok) {
        setUser((current) => ({ ...current, name: input.name }));
        setSaved(true);
      } else {
        setError(result.error.message);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Profile update failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout footer={t({ id: "auth.footer", message: "Authentication is handled by the API." })}>
      <ProfileForm
        key={`${user.email}:${user.name}`}
        user={user}
        onSubmit={submit}
        error={error}
        submitting={submitting}
      />
      {saved ? (
        <output className="mt-4 block text-sm text-muted-foreground">
          {t({ id: "auth.profile.saved", message: "Profile saved." })}
        </output>
      ) : null}
    </AuthLayout>
  );
}
