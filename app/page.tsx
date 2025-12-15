"use client";

import Spinner from "@/app/components/Spinner";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import InfoTooltip from "@/app/components/InfoToolTip";
import { useFeatureFlags } from "@/app/contexts/FeatureFlagContext";
import dynamic from 'next/dynamic';
import ModelSelector from "@/app/components/ModelSelector";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { models } from "@/app/constants/models";
import { isLightColor } from "@/app/lib/color";

const ClerkAuthComponents = dynamic(
  () => import('@/app/components/auth/ClerkAuthPage'),
  { ssr: false }
);

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

const primaryColors = [
  { name: "Blue", color: "#0F6FFF" },
  { name: "Red", color: "#FF0000" },
  { name: "Green", color: "#00FF00" },
  { name: "Yellow", color: "#FFFF00" },
];

const backgroundColors = [
  { name: "White", color: "#FFFFFF" },
  { name: "Gray", color: "#CCCCCC" },
  { name: "Black", color: "#000000" },
];



export default function Page() {
  const { isEnabled } = useFeatureFlags();
  const isAuthEnabled = isEnabled('AUTH');
  const [userAPIKey, setUserAPIKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("userAPIKey") || "";
    }
    return "";
  });
  const [companyName, setCompanyName] = useState("");
  const [selectedModel, setSelectedModel] = useState("black-forest-labs/FLUX.1.1-pro");
  // const [selectedLayout, setSelectedLayout] = useState(layouts[0].name);
  const [selectedStyle, setSelectedStyle] = useState(logoStyles[0].name);
  const [selectedPrimaryColor, setSelectedPrimaryColor] = useState(
    primaryColors[0].name,
  );
  const [selectedBackgroundColor, setSelectedBackgroundColor] = useState(
    backgroundColors[0].name,
  );
  const [customPrimaryColor, setCustomPrimaryColor] = useState("#0F6FFF");
  const [customBackgroundColor, setCustomBackgroundColor] = useState("#FFFFFF");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const selectedModelInfo = models.find(m => m.modelString === selectedModel);

  // Only use Clerk hooks if auth is enabled
  const authState = isAuthEnabled
    ? { isSignedIn: false, isLoaded: true, user: null }
    : { isSignedIn: true, isLoaded: true, user: null };

  const handleAPIKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setUserAPIKey(newValue);
    localStorage.setItem("userAPIKey", newValue);
  };

  const handlePrimaryColorSelect = (color: string) => {
    setSelectedPrimaryColor(color);
    if (color === "Custom") {
      return;
    }
    const selectedColor = primaryColors.find((c) => c.name === color);
    if (selectedColor) {
      setCustomPrimaryColor(selectedColor.color);
    }
  };

  const handleBackgroundColorSelect = (color: string) => {
    setSelectedBackgroundColor(color);
    if (color === "Custom") {
      return;
    }
    const selectedColor = backgroundColors.find((c) => c.name === color);
    if (selectedColor) {
      setCustomBackgroundColor(selectedColor.color);
    }
  };

  async function generateLogo() {
    if (isAuthEnabled && !authState.isSignedIn) {
      return;
    }

    setIsLoading(true);

    const res = await fetch("/api/generate-logo", {
      method: "POST",
      body: JSON.stringify({
        userAPIKey,
        companyName,
        selectedStyle,
        selectedModel,
        selectedPrimaryColor: selectedPrimaryColor === "Custom" ? customPrimaryColor : primaryColors.find(c => c.name === selectedPrimaryColor)?.color,
        selectedBackgroundColor: selectedBackgroundColor === "Custom" ? customBackgroundColor : backgroundColors.find(c => c.name === selectedBackgroundColor)?.color,
        additionalInfo,
        referenceImage: selectedModelInfo?.requiresReferenceImage ? referenceImage : undefined,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      setGeneratedImage(`data:image/png;base64,${json.b64_json}`);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Get just the base64 data without the data:image prefix
        const base64Data = base64.split(',')[1];
        setReferenceImage(base64Data);
      };
      reader.readAsDataURL(file);
    }
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
            <fieldset className="flex grow flex-col" disabled={isAuthEnabled && !authState.isSignedIn}>
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
                        Primary
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            style={{
                              backgroundColor: selectedPrimaryColor === "Custom" ? customPrimaryColor : primaryColors.find(c => c.name === selectedPrimaryColor)?.color,
                              color: selectedPrimaryColor === "Custom" ?
                                (isLightColor(customPrimaryColor) ? 'black' : 'white') :
                                (isLightColor(primaryColors.find(c => c.name === selectedPrimaryColor)?.color || '') ? 'black' : 'white')
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="size-4 rounded-sm border border-gray-200"
                                style={{
                                  backgroundColor: selectedPrimaryColor === "Custom" ? customPrimaryColor : primaryColors.find(c => c.name === selectedPrimaryColor)?.color
                                }}
                              />
                              {selectedPrimaryColor}
                            </div>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="z-50 w-full bg-[#2C2C2C] p-3" side="right">
                          <div className="mb-2">
                            <input
                              type="color"
                              value={customPrimaryColor}
                              onChange={(e) => {
                                setCustomPrimaryColor(e.target.value);
                                setSelectedPrimaryColor("Custom");
                              }}
                              className="w-full"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {primaryColors.map((color) => (
                              <Button
                                key={color.name}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => handlePrimaryColorSelect(color.name)}
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className="size-4 rounded-sm border border-gray-200"
                                    style={{ backgroundColor: color.color }}
                                  />
                                  {color.name}
                                </div>
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block items-center text-xs font-bold uppercase text-[#6F6F6F]">
                        Background
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            style={{
                              backgroundColor: selectedBackgroundColor === "Custom" ? customBackgroundColor : backgroundColors.find(c => c.name === selectedBackgroundColor)?.color,
                              color: selectedBackgroundColor === "Custom" ?
                                (isLightColor(customBackgroundColor) ? 'black' : 'white') :
                                (isLightColor(backgroundColors.find(c => c.name === selectedBackgroundColor)?.color || '') ? 'black' : 'white')
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="size-4 rounded-sm border border-gray-200"
                                style={{
                                  backgroundColor: selectedBackgroundColor === "Custom" ? customBackgroundColor : backgroundColors.find(c => c.name === selectedBackgroundColor)?.color
                                }}
                              />
                              {selectedBackgroundColor}
                            </div>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="z-50 w-full bg-[#2C2C2C] p-3" side="right">
                          <div className="mb-2">
                            <input
                              type="color"
                              value={customBackgroundColor}
                              onChange={(e) => {
                                setCustomBackgroundColor(e.target.value);
                                setSelectedBackgroundColor("Custom");
                              }}
                              className="w-full"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {backgroundColors.map((color) => (
                              <Button
                                key={color.name}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => handleBackgroundColorSelect(color.name)}
                              >
                                <div className="flex items-center gap-2">
                                  <div
                                    className="size-4 rounded-sm border border-gray-200"
                                    style={{ backgroundColor: color.color }}
                                  />
                                  {color.name}
                                </div>
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
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
                  {/* Model Selection Section */}
                  <div className="mb-6">
                    <label className="mb-2 flex items-center text-xs font-bold uppercase text-[#6F6F6F]">
                      MODEL
                      <InfoTooltip content="Choose the AI model to generate your logo" />
                    </label>
                    <ModelSelector
                      selectedModel={selectedModel}
                      onModelChange={(model) => {
                        setSelectedModel(model);
                        setReferenceImage(null);
                      }}
                    />
                  </div>

                  {selectedModelInfo?.requiresReferenceImage && (
                    <div className="mb-6">
                      <label className="mb-2 flex items-center text-xs font-bold uppercase text-[#6F6F6F]">
                        Reference Image
                        <InfoTooltip content="Upload a reference image for the model to use" />
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          required
                          className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                        />
                        {referenceImage && (
                          <div className="w-12 h-12 rounded overflow-hidden">
                            { /* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`data:image/png;base64,${referenceImage}`}
                              alt="Reference"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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

          {isAuthEnabled && <ClerkAuthComponents />}
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
    </div >
  );
}
