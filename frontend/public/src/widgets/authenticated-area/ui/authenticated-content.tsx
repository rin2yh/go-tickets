import { SignIn, useAuth, useUser } from "@clerk/react";
import { Card, CardContent } from "@go-tickets/ui/components/card";
import { type AuthenticatedRoute } from "./clerk-island";
import { SignedInContent } from "./signed-in-content";

export function AuthenticatedContent({ route }: { route: AuthenticatedRoute }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (route === null) return null;
  if (isLoaded) {
    if (isSignedIn)
      return (
        <SignedInContent route={route} defaultName={user?.fullName || user?.firstName || ""} />
      );

    return (
      <SignIn
        routing="hash"
        appearance={{ elements: { rootBox: "!w-full", cardBox: "!w-full" } }}
      />
    );
  }

  return (
    <Card>
      <CardContent>
        <p aria-live="polite">ログイン状態を確認しています…</p>
      </CardContent>
    </Card>
  );
}
