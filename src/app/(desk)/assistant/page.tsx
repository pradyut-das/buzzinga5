import { AssistantScanner } from "@/components/assistant/assistant-scanner";
import { geminiConfigured } from "@/lib/agent/gemini";
import "@/styles/assistant-scanner.css";

export const dynamic = "force-dynamic";

/**
 * The assistant workspace: the anomaly scanner scene from the homepage brief,
 * bound to the same Gemini Live voice session. The control panel and every
 * overlay panel are hidden — the scanner frame is the microphone and the scene
 * reacts to the live voice level.
 */
export default async function AssistantPage() {
  return <AssistantScanner agentEnabled={geminiConfigured()} />;
}
