import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { models } from "@/app/constants/models";

interface ModelSelectorProps {
    selectedModel: string;
    onModelChange: (model: string) => void;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
    return (
        <Select value={selectedModel} onValueChange={onModelChange}>
            <SelectTrigger>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {models.map((model) => (
                    <SelectItem key={model.modelString} value={model.modelString}>
                        {model.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}