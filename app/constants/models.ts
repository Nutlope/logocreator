import { Model } from "@/app/types/models";

export const models: Model[] = [
    {
        name: "Flux.1 [schnell] (free)",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-schnell-Free",
    },
    {
        name: "Flux.1 [schnell] (Turbo)",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-schnell",
        defaultSteps: 4
    },
    {
        name: "Flux.1 Dev",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-dev",
        defaultSteps: 28
    },
    {
        name: "Flux.1 Canny",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-canny",
        defaultSteps: 28,
        requiresReferenceImage: true
    },
    {
        name: "Flux.1 Depth",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-depth",
        defaultSteps: 28,
        requiresReferenceImage: true
    },
    {
        name: "Flux.1 Redux",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-redux",
        defaultSteps: 28,
        requiresReferenceImage: true
    },
    {
        name: "Flux1.1 [pro]",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1.1-pro"
    },
    {
        name: "Flux.1 [pro]",
        organization: "Black Forest Labs",
        modelString: "black-forest-labs/FLUX.1-pro"
    },
    {
        name: "Stable Diffusion XL 1.0",
        organization: "Stability AI",
        modelString: "stabilityai/stable-diffusion-xl-base-1.0"
    }
];