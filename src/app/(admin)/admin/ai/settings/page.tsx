import { AiSettingsForm } from "@/components/ai/ai-settings-form";
import { PageHeader } from "@/components/shell/ui";
import { getAiPrefs, getKeyStatus, IMAGE_MODEL } from "@/lib/ai/settings";

export const metadata = { title: "AI settings · Admin" };
export const instant = false;

export default async function AiSettingsPage() {
  const [openrouter, ollama, prefs] = await Promise.all([getKeyStatus("openrouter"), getKeyStatus("ollama"), getAiPrefs()]);
  return (
    <div className="space-y-3">
      <PageHeader title="AI settings" description="API keys for OpenRouter and Ollama Cloud, and which models write and draw. Keys are encrypted and cannot be read back." />
      <AiSettingsForm status={{ openrouter, ollama }} prefs={prefs} defaultImageModel={IMAGE_MODEL} />
    </div>
  );
}
