export interface Model {
    name: string;
    organization: string;
    modelString: string;
    defaultSteps?: number;
    requiresReferenceImage?: boolean;
}