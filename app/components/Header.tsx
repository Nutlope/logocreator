import Image from "next/image";
import Link from "next/link";
import { useFeatureFlags } from "@/app/contexts/FeatureFlagContext";
import dynamic from 'next/dynamic';

// Dynamically import Clerk components to avoid loading them when AUTH is disabled
const ClerkComponents = dynamic(
  () => import('@/app/components/auth/ClerkComponents'),
  { ssr: false }
);

export default function Header({ className }: { className: string }) {
  const { isEnabled } = useFeatureFlags();
  const isAuthEnabled = isEnabled('AUTH');

  return (
    <header className={`relative w-full ${className}`}>
      <div className="flex items-center justify-between bg-[#343434] px-4 py-2 md:mt-4">
        <div className="flex flex-grow justify-start xl:justify-center">
          <Link href="https://togetherai.link/" className="flex items-center">
            <Image
              src="together-ai-logo1.svg"
              alt="together.ai"
              width={400}
              height={120}
              className="w-[220px] md:w-[330px] lg:w-[390px]"
              priority
            />
          </Link>
        </div>
        {isAuthEnabled && <ClerkComponents />}
      </div>
    </header>
  );
}
