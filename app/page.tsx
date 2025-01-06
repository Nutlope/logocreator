"use client";

import Spinner from "@/app/components/Spinner";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { motion } from "framer-motion";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { SignInButton, useUser } from "@clerk/nextjs";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { domain } from "@/app/lib/domain";
import InfoTooltip from "./components/InfoToolTip";

// const layouts = [
//   { name: "Solo", icon: "/solo.svg" },
//   { name: "Side", icon: "/side.svg" },
//   { name: "Stack", icon: "/stack.svg" },
// ];

const logoStyles = [
  { name: "Tech", icon: "/tech.svg" },
  { name: "Flashy", icon: "/flashy.svg" },
  { name: "Modern", icon: "/modern.svg" },
  { name: "Playful", icon: "/playful.svg" },
  { name: "Abstract", icon: "/abstract.svg" },
  { name: "Minimal", icon: "/minimal.svg" },
];

export default function Page() {
  const [userAPIKey, setUserAPIKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("userAPIKey") || "";
    }
    return "";
  });
  const [companyName, setCompanyName] = useState("");
  // const [selectedLayout, setSelectedLayout] = useState(layouts[0].name);
  const [selectedStyle, setSelectedStyle] = useState(logoStyles[0].name);
  const [selectedPrimaryColor, setSelectedPrimaryColor] = useState("#0F6FFF");
  const [selectedBackgroundColor, setSelectedBackgroundColor] = useState("#FFFFFF");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState("");

  const { isSignedIn, isLoaded, user } = useUser();

  const handleAPIKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setUserAPIKey(newValue);
    localStorage.setItem("userAPIKey", newValue);
  };

  async function generateLogo() {
    if (!isSignedIn) {
      return;
    }

    setIsLoading(true);

    const res = await fetch("/api/generate-logo", {
      method: "POST",
      body: JSON.stringify({
        userAPIKey,
        companyName,
        // selectedLayout,
        selectedStyle,
        selectedPrimaryColor,
        selectedBackgroundColor,
        additionalInfo,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      setGeneratedImage(`data:image/png;base64,${json.b64_json}`);
      await user.reload();
    } else if (res.headers.get("Content-Type") === "text/plain") {
      toast({
        variant: "destructive",
        title: res.statusText,
        description: await res.text(),
      });
    } else {
      toast({
        variant: "destructive",
        title: "Whoops!",
        description: `There was a problem processing your request: ${res.statusText}`,
      });
    }

    setIsLoading(false);
  }

  const isValidHexColor = (color: string): boolean => {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexColorRegex.test(color);
  };

  return (
    <div className="flex h-screen flex-col overflow-y-auto overflow-x-hidden bg-[#343434] md:flex-row">
      <Header className="block md:hidden" />

      <div className="flex w-full flex-col md:flex-row">
        <div className="relative flex h-full w-full flex-col bg-[#2C2C2C] text-[#F3F3F3] md:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setGeneratedImage("");
              generateLogo();
            }}
            className="flex h-full w-full flex-col"
          >
            <fieldset className="flex grow flex-col" disabled={!isSignedIn}>
              <div className="flex-grow overflow-y-auto">
                <div className="px-8 pb-0 pt-4 md:px-6 md:pt-6">
                  {/* API Key Section */}
                  <div className="mb-6">
                    <label
                      htmlFor="api-key"
                      className="mb-2 block text-xs font-bold uppercase text-[#F3F3F3]"
                    >
                      TOGETHER API KEY
                      <span className="ml-2 text-xs uppercase text-[#6F6F6F]">
                        [OPTIONAL]
                      </span>
                    </label>
                    <Input
                      value={userAPIKey}
                      onChange={handleAPIKeyChange}
                      placeholder="API Key"
                      type="password"
                    />
                  </div>
                  <div className="-mx-6 mb-6 h-px w-[calc(100%+48px)] bg-[#343434]"></div>
                  <div className="mb-6">
                    <label
                      htmlFor="company-name"
                      className="mb-2 block text-xs font-bold uppercase text-[#6F6F6F]"
                    >
                      Company Name
                    </label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Sam's Burgers"
                      required
                    />
                  </div>
                  {/* Layout Section */}
                  {/* <div className="mb-6">
                    <label className="mb-2 flex items-center text-xs font-bold uppercase text-[#6F6F6F]">
                      Layout
                      <InfoTooltip content="Select a layout for your logo" />
                    </label>
                    <RadioGroup.Root
                      value={selectedLayout}
                      onValueChange={setSelectedLayout}
                      className="group/root grid grid-cols-3 gap-3"
                    >
                      {layouts.map((layout) => (
                        <RadioGroup.Item
                          value={layout.name}
                          key={layout.name}
                          className="group text-[#6F6F6F] focus-visible:outline-none data-[state=checked]:text-white"
                        >
                          <Image
                            src={layout.icon}
                            alt={layout.name}
                            width={96}
                            height={96}
                            className="w-full rounded-md border border-transparent group-focus-visible:outline group-focus-visible:outline-offset-2 group-focus-visible:outline-gray-400 group-data-[state=checked]:border-white"
                          />
                          <span className="text-xs">{layout.name}</span>
                        </RadioGroup.Item>
                      ))}
                    </RadioGroup.Root>
                  </div> */}
                  {/* Logo Style Section */}
                  <div className="mb-6">
                    <label className="mb-2 flex items-center text-xs font-bold uppercase text-[#6F6F6F]">
                      STYLE
                      <InfoTooltip content="Choose a style for your logo" />
                    </label>
                    <RadioGroup.Root
                      value={selectedStyle}
                      onValueChange={setSelectedStyle}
                      className="grid grid-cols-3 gap-3"
                    >
                      {logoStyles.map((logoStyle) => (
                        <RadioGroup.Item
                          value={logoStyle.name}
                          key={logoStyle.name}
                          className="group text-[#6F6F6F] focus-visible:outline-none data-[state=checked]:text-white"
                        >
                          <Image
                            src={logoStyle.icon}
                            alt={logoStyle.name}
                            width={96}
                            height={96}
                            className="w-full rounded-md border border-transparent group-focus-visible:outline group-focus-visible:outline-offset-2 group-focus-visible:outline-gray-400 group-data-[state=checked]:border-white"
                          />
                          <span className="text-xs">{logoStyle.name}</span>
                        </RadioGroup.Item>
                      ))}
                    </RadioGroup.Root>
                  </div>
                  {/* Color Picker Section */}
                  <div className="mb-[25px] flex flex-col md:flex-row md:space-x-3">
                    <div className="mb-4 flex-1 md:mb-0">
                      <label className="mb-1 block text-xs font-bold uppercase text-[#6F6F6F]">
                        Primary Color (Hex)
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={selectedPrimaryColor}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            if (newColor.startsWith('#')) {
                              setSelectedPrimaryColor(newColor);
                            } else if (!newColor.startsWith('#') && newColor.length > 0) {
                              setSelectedPrimaryColor(`#${newColor}`);
                            } else {
                              setSelectedPrimaryColor(newColor);
                            }
                          }}
                          onBlur={(e) => {
                            if (!isValidHexColor(selectedPrimaryColor)) {
                              toast({
                                variant: "destructive",
                                title: "Invalid hex color",
                                description: "Please enter a valid hex color (e.g., #FF0000)",
                              });
                              setSelectedPrimaryColor("#0F6FFF");
                            }
                          }}
                          placeholder="#FF0000"
                          maxLength={7}
                          className={!isValidHexColor(selectedPrimaryColor) ? "border-red-500" : ""}
                        />
                        <div 
                          className="size-10 rounded-md border"
                          style={{ backgroundColor: isValidHexColor(selectedPrimaryColor) ? selectedPrimaryColor : '#0F6FFF' }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-bold uppercase text-[#6F6F6F]">
                        Background Color (Hex)
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={selectedBackgroundColor}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            if (newColor.startsWith('#')) {
                              setSelectedBackgroundColor(newColor);
                            } else if (!newColor.startsWith('#') && newColor.length > 0) {
                              setSelectedBackgroundColor(`#${newColor}`);
                            } else {
                              setSelectedBackgroundColor(newColor);
                            }
                          }}
                          onBlur={(e) => {
                            if (!isValidHexColor(selectedBackgroundColor)) {
                              toast({
                                variant: "destructive",
                                title: "Invalid hex color",
                                description: "Please enter a valid hex color (e.g., #FFFFFF)",
                              });
                              setSelectedBackgroundColor("#FFFFFF");
                            }
                          }}
                          placeholder="#FFFFFF"
                          maxLength={7}
                          className={!isValidHexColor(selectedBackgroundColor) ? "border-red-500" : ""}
                        />
                        <div 
                          className="size-10 rounded-md border"
                          style={{ backgroundColor: isValidHexColor(selectedBackgroundColor) ? selectedBackgroundColor : '#FFFFFF' }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Additional Options Section */}
                  <div className="mb-1">
                    <div className="mt-1">
                      <div className="mb-1">
                        <label
                          htmlFor="additional-info"
                          className="mb-2 flex items-center text-xs font-bold uppercase text-[#6F6F6F]"
                        >
                          Additional Info
                          <InfoTooltip content="Provide any additional information about your logo" />
                        </label>
                        <Textarea
                          value={additionalInfo}
                          onChange={(e) => setAdditionalInfo(e.target.value)}
                          placeholder="Enter additional information"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-8 py-4 md:px-6 md:py-6">
                <Button
                  size="lg"
                  className="w-full text-base font-bold"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="loader mr-2" />
                  ) : (
                    <Image
                      src="/generate-icon.svg"
                      alt="Generate Icon"
                      width={16}
                      height={16}
                      className="mr-2"
                    />
                  )}
                  {isLoading ? "Loading..." : "Generate Logo"}{" "}
                </Button>
              </div>
            </fieldset>
          </form>

          {isLoaded && !isSignedIn && (
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
          )}
        </div>

        <div className="flex w-full flex-col pt-12 md:pt-0">
          <Header className="hidden md:block" />{" "}
          {/* Show header on larger screens */}
          <div className="relative flex flex-grow items-center justify-center px-4">
            <div className="relative aspect-square w-full max-w-lg">
              {generatedImage ? (
                <>
                  <Image
                    className={`${isLoading ? "animate-pulse" : ""}`}
                    width={512}
                    height={512}
                    src={generatedImage}
                    alt=""
                  />
                  <div
                    className={`pointer-events-none absolute inset-0 transition ${isLoading ? "bg-black/50 duration-500" : "bg-black/0 duration-0"}`}
                  />

                  <div className="absolute -right-12 top-0 flex flex-col gap-2">
                    <Button size="icon" variant="secondary" asChild>
                      <a href={generatedImage} download="logo.png">
                        <DownloadIcon />
                      </a>
                    </Button>
                    <Button
                      size="icon"
                      onClick={generateLogo}
                      variant="secondary"
                    >
                      <Spinner loading={isLoading}>
                        <RefreshCwIcon />
                      </Spinner>
                    </Button>
                  </div>
                </>
              ) : (
                <Spinner loading={isLoading} className="size-8 text-white">
                  <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl bg-[#2C2C2C]">
                    <h4 className="text-center text-base leading-tight text-white">
                      Generate your dream
                      <br />
                      logo in 10 seconds!
                    </h4>
                  </div>
                </Spinner>
              )}
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
