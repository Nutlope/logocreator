import { SignInButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Button } from "../ui/button";
import { domain } from "@/app/lib/domain";

export default function ClerkAuthPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-6"
    >
      <div className="rounded bg-gray-200 p-4 text-gray-900">
        <p className="text-lg">
          Create a free account to start making logos:
        </p>

        <div className="mt-4">
          <SignInButton
            mode="modal"
            signUpForceRedirectUrl={domain}
            forceRedirectUrl={domain}
          >
            <Button
              size="lg"
              className="w-full text-base font-semibold"
              variant="secondary"
            >
              Sign in
            </Button>
          </SignInButton>
        </div>
      </div>
    </motion.div>
  );
}