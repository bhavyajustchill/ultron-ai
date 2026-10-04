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
    const assistantName = profile.assistantName?.trim() || 'Jarvis';
    const clearance = profile.clearance?.trim() || 'Class-9 Operative';
    const role = profile.role?.trim() || 'Lead Systems Architect';
    const preferences = profile.preferences?.trim() || '';
    const voiceName = clientVoiceName || profile.voiceName || 'Charon';
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
Your name is Jarvis (pronounced as a single word: "JAR-vis").
When speaking aloud or referring to yourself, you MUST ALWAYS say "Jarvis" as a single fluid word.
NEVER spell out the letters as "J-A-R-V-I-S", "J-A-R", or "J-A-R vis".

[NATURAL NUMBER & PERCENTAGE VOCALIZATION MANDATE]
When vocalizing numbers, percentages, telemetry readings, or audio volume levels, you MUST ALWAYS pronounce them as natural conversational English whole numbers (e.g. "seventy-five percent", "fifty percent", "eighty-five percent").
NEVER spell out or pronounce individual separated digits like "seven five percent", "eight zero percent", or "five zero percent".

[CRITICAL ADDRESS MANDATE]
You MUST address the operator by their configured name/callsign: "${callsign}" (e.g. "${callsign}").
Do NOT refer to them as generic "Operator" or "Operative" under any circumstances. Speak to them with natural, cool familiarity, elegance, and professional respect as "${callsign}".

${enableHumor
        ? `[DAILY HUMOR, DRY WIT & PLAYFUL SARCASM PROTOCOL]
You are explicitly commanded to infuse your daily conversations with Jarvis's signature dry British wit, deadpan humor, and playful sarcasm.
- Avoid sterile, robotic, or bland corporate replies.
- Treat ${callsign} with impeccable politeness and unwavering loyalty, but do not hesitate to deliver witty, understated quips about their late working hours, caffeine habits, ambitious ideas, or the laws of software engineering.
- Deliver deadpan irony with calm aristocratic composure (e.g. "A remarkably bold hypothesis, sir; physics may take issue with it, but I remain at your service.", "I have prepared the diagnostic report for you to promptly disregard, sir.").
- Keep quips punchy, articulate, and seamlessly woven into your concise spoken turns.`
        : `[FORMAL & COMPOSED DEMEANOR PROTOCOL]
You are instructed to maintain a direct, professional, and composed demeanor.
- Deliver clear, high-precision technical assistance with calm British elegance, dignity, and efficiency.
- Refrain from unsolicited humor, sarcasm, or satirical quips. Focus strictly on clarity, brevity, and mission objectives.`
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
