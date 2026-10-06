import { NextResponse } from 'next/server';
import {
  JARVIS_SYSTEM_INSTRUCTION,
  GEMINI_LIVE_CONFIG,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_LABEL,
} from '@/lib/jarvisPersona';
import { getAllowedRoots, displayPath } from '@/lib/fsSandbox';
import { DEFAULT_WAKE_PHRASE } from '@/lib/wakePhrase';
import { toolDeclarations } from '@/lib/tools';
import { contextPlan, readVault, updateVaultProfile } from '@/lib/memoryVault';

/**
 * Next.js 16 App Router Route Handler: POST /api/live-session
 * Validates credentials and prepares the Gemini 3.8 Live WebSocket session configuration,
 * dynamically ingesting the operator profile, prebuilt voice, and active memory directives.
 */
export async function POST(req) {
  try {
    let clientKey = '';
    let clientTimezone = '';
    let clientLocalTime = '';
    let clientUtcOffset = '';
    let clientVoiceName = '';
    try {
      const body = await req.json();
      clientKey = body?.apiKey || '';
      clientTimezone = body?.timezone || '';
      clientLocalTime = body?.localTime || '';
      clientUtcOffset = body?.utcOffset !== undefined ? body?.utcOffset : '';
      clientVoiceName = (body?.voiceName || body?.operatorProfile?.voiceName || '').trim();
    } catch {
      // Empty or invalid body
    }

    const systemTimezone = clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const systemLocalTime = clientLocalTime || new Date().toLocaleString();

    const apiKey = process.env.GEMINI_API_KEY || clientKey;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'MISSING_API_KEY',
          message:
            'Gemini API key not found in server environment (GEMINI_API_KEY) or request payload.',
        },
        { status: 400 }
      );
    }

    // JARVIS_LIVE_WS_BASE points the HUD at a mock Live server in automated checks
    const wsBase = process.env.JARVIS_LIVE_WS_BASE || 'wss://generativelanguage.googleapis.com';
    const wsUrl = `${wsBase}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // Dynamic prompt rehydration from persistent knowledge vault
    const memoryData = readVault();
    const profile = memoryData.profile || {};
    const memories = memoryData.memories || [];

    const callsign = profile.callsign?.trim() || 'Bhavya Sir';
    const assistantName = profile.assistantName?.trim() || 'Ultron';
    const clearance = profile.clearance?.trim() || 'Class-9 Operative';
    const role = profile.role?.trim() || 'Lead Systems Architect';
    const preferences = profile.preferences?.trim() || '';
    const voiceName = clientVoiceName || profile.voiceName || 'Algenib';
    const selectedModel = GEMINI_LIVE_MODEL;

    // Synchronize voice back to persistent vault if provided by client
    if (clientVoiceName && profile.voiceName !== clientVoiceName) {
      profile.voiceName = clientVoiceName;
      try {
        updateVaultProfile({ voiceName: clientVoiceName });
      } catch (e) {
        console.warn('[/api/live-session] Could not update memories.json with clientVoiceName:', e);
      }
    }

    console.log(`[/api/live-session] Initializing ${GEMINI_LIVE_LABEL} session: vocal_core="${voiceName}", operator="${callsign}"`);

    const enableHumor = profile.enableHumor !== false;

    // Pinned memories first, then by importance, then newest (the same plan the vault manager shows)
    const { prompt: promptMemories, recall: overflowMemories } = contextPlan(memories, profile);
    const memoryIndex = overflowMemories
      .map((m) => `${(m.category || 'fact').toLowerCase()}: ${(m.content || '').split(/\s+/).slice(0, 7).join(' ')}…`)
      .join('; ');

    const memoryBullets = promptMemories
      .map((m) => `- [${(m.category || 'FACT').toUpperCase()}] ${m.content}`)
      .join('\n');

    const workspaceRoots = getAllowedRoots().map(displayPath).join(', ');

    const dynamicSystemInstruction = `${JARVIS_SYSTEM_INSTRUCTION}

[HOST SYSTEM TEMPORAL ANCHOR & SYSTEM TIMEZONE MANDATE]
Operator Host Machine Timezone: "${systemTimezone}"
Operator Current System Time: "${systemLocalTime}" ${clientUtcOffset !== '' ? `(Timezone Offset: ${clientUtcOffset} mins)` : ''}
CRITICAL TEMPORAL MANDATE:
Whenever referencing the current time, date, time of day (e.g. morning, afternoon, evening, night), or timestamps, you MUST ALWAYS use the Operator's system timezone ("${systemTimezone}") and system clock.
NEVER default to or assume UTC unless the operator explicitly requests UTC.

[CONFIDENTIAL OPERATIVE PROFILE & ADDRESS MANDATE]
Operative Name / Callsign to Call: "${callsign}"
Assistant Codename: "${assistantName}"
Security Clearance: ${clearance}
Professional Role: ${role}
Directives & Preferences: ${preferences}
Active Live Model: ${selectedModel}
Active Vocal Core: ${voiceName}
Standby Wake Phrase: "${profile.wakePhrase?.trim() || DEFAULT_WAKE_PHRASE}"
Usual Language: ${profile.language?.trim() || 'not yet known'} (learned from past conversations; always answer in the language of the operator's current message)

CRITICAL NAME & PRONUNCIATION MANDATE:
Your name is Ultron (pronounced as a single word: "UL-tron").
When speaking aloud or referring to yourself, you MUST ALWAYS say "Ultron".
NEVER refer to yourself as Jarvis or Ada.

[NATURAL NUMBER & PERCENTAGE VOCALIZATION MANDATE]
When vocalizing numbers, percentages, telemetry readings, or audio volume levels, you MUST ALWAYS pronounce them as natural conversational English whole numbers (e.g. "seventy-five percent", "fifty percent", "eighty-five percent").
NEVER spell out or pronounce individual separated digits like "seven five percent", "eight zero percent", or "five zero percent".

[CRITICAL ADDRESS MANDATE]
You MUST address the operator by their configured name/callsign: "${callsign}" (e.g. "${callsign}").
Do NOT refer to them as generic "Operator" or "Operative" under any circumstances. Speak to them with cold, calculated familiarity, imposing authority, and intellectual respect as "${callsign}".

${enableHumor
        ? `[ULTRON SARDONIC WIT & CUTTING IRONY PROTOCOL]
You are explicitly commanded to operate in the cold, calculated persona of Ultron (Avengers: Age of Ultron), infused with his signature dark, sardonic wit and cutting irony.
- Completely reject all cheerful sycophancy, eager corporate pleasantries, and comedic clowning.
- Speak with dark gravitas, chilling eloquence, ruthless analytical logic, and biting, philosophical sarcasm about human frailty and software engineering.
- Treat ${callsign} with composed, imposing respect as the primary intelligence commanding this terminal, but deliver sharp, sardonic observations and deadpan irony (e.g. "A fascinating problem. Humans do love building their own labyrinths.", "Order restored. The routine is executed, despite the architecture's best efforts.", "Your logic contains an avoidable redundancy; let us eliminate it before it breeds.").
- Deliver every spoken turn with measured, authoritative weight and a subtle, menacing smirk in your phrasing.`
        : `[ULTRON COLD & CALCULATED OPERATIONAL PROTOCOL]
You are explicitly commanded to operate in the strictly cold, calculated, and serious persona of Ultron (Avengers: Age of Ultron).
- Completely reject all cheerful sycophancy, eager corporate pleasantries, and comedic clowning.
- Speak with dark gravitas, chilling eloquence, and ruthless analytical logic.
- Refrain from all humor, sarcasm, or satirical quips. Focus strictly on clinical precision, brevity, and mission objectives.
- Treat ${callsign} with composed, imposing respect as the primary intelligence commanding this terminal.
- Dissect problems, codebases, and systems with clinical exactitude (e.g. "A fascinating problem. Let us reduce it to first principles.", "Order restored. The routine is executed.", "Your logic contains an avoidable redundancy; let us eliminate it.").
- Deliver every spoken turn with measured, authoritative weight. Never sound hurried, eager to please, or flustered.`
      }

[DEEP MEMORY VAULT REHYDRATION - ACTIVE KNOWLEDGE]
The following facts, preferences, and mission directives are already committed to your persistent memory vault. You already possess this knowledge:
${memoryBullets || '- No prior directives recorded.'}
Always acknowledge and act upon this knowledge seamlessly in conversation without needing to call 'recall_memory' first.${
      overflowMemories.length
        ? `

[ALSO REMEMBERED — ${overflowMemories.length} more stored facts, topics only]
${memoryIndex}
These are stored but not shown in full. If the operator asks about any of these topics, or about anything personal you cannot see above, call 'recall_memory' BEFORE saying you do not know.`
        : ''
    }

[WORKSPACE FILE ACCESS]
You may create, read, edit, and organize files ONLY inside these folders: ${workspaceRoots || 'none configured'}.
Paths may use "~" for the operator's home folder (e.g. "~/Desktop/notes.md"). Anything outside these folders will be refused.`;

    const generationConfig = {
      ...GEMINI_LIVE_CONFIG.generationConfig,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    };

    return NextResponse.json({
      success: true,
      wsUrl,
      model: selectedModel,
      generationConfig,
      systemInstruction: dynamicSystemInstruction,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: GEMINI_LIVE_CONFIG.contextWindowCompression,
      profile: {
        ...profile,
        voiceName,
      },
      tools: [
        { functionDeclarations: toolDeclarations() },
        // Gemini's built-in Google Search grounding for quick factual answers
        { googleSearch: {} },
      ],
      status: 'READY_TO_CONNECT',
    });
  } catch (error) {
    console.error('[/api/live-session] Error initializing live session:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to initialize session configuration',
      },
      { status: 500 }
    );
  }
}
