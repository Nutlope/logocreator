import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { domain } from "@/app/lib/domain";

export default function ClerkComponents() {
  const { user } = useUser();

  return (
    <div className="absolute right-8 flex items-center space-x-2 md:top-20 lg:top-8">
      <SignedOut>
        <SignInButton
          mode="modal"
          signUpForceRedirectUrl={domain}
          forceRedirectUrl={domain}
        />
      </SignedOut>
      <SignedIn>
        {user?.unsafeMetadata.remaining === "BYOK" ? (
          <p>Your API key</p>
        ) : (
          <p>Credits: {`${user?.unsafeMetadata.remaining ?? 3}`}</p>
        )}
        <UserButton />
      </SignedIn>
    </div>
  );
}