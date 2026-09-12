import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { JARVIS_SYSTEM_INSTRUCTION, GEMINI_LIVE_CONFIG } from '@/lib/jarvisPersona';

const MEMORY_FILE_PATH = path.join(process.cwd(), 'data', 'memories.json');

function readPersistedMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE_PATH)) {
      const raw = fs.readFileSync(MEMORY_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[/api/live-session] Could not read memories.json:', err);
  }
  return {
    profile: {
      callsign: 'Bhavya Sir',
      assistantName: 'Jarvis',
      voiceName: 'Charon',
      clearance: 'Class-9 Operative',
      role: 'Lead Systems Architect',
      preferences:
        'Prefers concise, authoritative tactical briefings, high-speed execution, and dark cyberpunk aesthetics.',
    },
    memories: [],
  };
}

/**
 * Next.js 16 App Router Route Handler: POST /api/live-session
 * Validates credentials and prepares the Gemini 3.1 Live WebSocket session configuration,
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

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    // Dynamic prompt rehydration from persistent knowledge vault
    const memoryData = readPersistedMemory();
    const profile = memoryData.profile || {};
    const memories = memoryData.memories || [];

    const callsign = profile.callsign?.trim() || 'Bhavya Sir';
    const assistantName = profile.assistantName?.trim() || 'Jarvis';
    const clearance = profile.clearance?.trim() || 'Class-9 Operative';
    const role = profile.role?.trim() || 'Lead Systems Architect';
    const preferences = profile.preferences?.trim() || '';
    const voiceName = clientVoiceName || profile.voiceName || 'Charon';
    const selectedModel = 'models/gemini-3.1-flash-live-preview';

    // Synchronize voice back to persistent vault if provided by client
    if (clientVoiceName && profile.voiceName !== clientVoiceName) {
      profile.voiceName = clientVoiceName;
      try {
        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(memoryData, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[/api/live-session] Could not update memories.json with clientVoiceName:', e);
      }
    }

    console.log(`[/api/live-session] Initializing Gemini 3.1 Live session: vocal_core="${voiceName}", operator="${callsign}"`);

    const enableHumor = profile.enableHumor !== false;

    const filteredMemories = memories
      .filter((m) => {
        if (!enableHumor) {
          const text = (m.content || '').toLowerCase();
          if (
            m.id === 'mem-1789153920000-humor' ||
            text.includes('humor') ||
            text.includes('sarcasm') ||
            text.includes('wit')
          ) {
            return false;
          }
        }
        return true;
      })
      .slice(0, 15);

    const memoryBullets = filteredMemories
      .map((m) => `- [${(m.category || 'FACT').toUpperCase()}] ${m.content}`)
      .join('\n');

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
Always acknowledge and act upon this knowledge seamlessly in conversation without needing to call 'recall_memory' first.`;

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
      profile: {
        ...profile,
        voiceName,
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_system_telemetry',
              description:
                'Retrieves real-time host operating system resource metrics, including current CPU percentage, RAM memory usage and limits, active processes, uptime, network throughput, and GPU load.',
              parameters: {
                type: 'OBJECT',
                properties: {},
              },
            },
            {
              name: 'get_weather',
              description:
                'Retrieves exact real-time live meteorological metrics and atmospheric status for any city or operator\'s current location (e.g. current temperature in °C and °F, apparent/feels-like temperature, conditions like Sunny/Rain/Cloudy/Thunderstorm, humidity percentage, wind speed in km/h, precipitation in mm, and daily forecast). Can also launch the interactive Google Weather card on the operator\'s desktop browser if requested.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  city: {
                    type: 'STRING',
                    description:
                      'Target city or location name (e.g. "Delhi", "New York", "Tokyo", "London", "Paris"). Leave blank or set to "current" for the operator\'s local sector.',
                  },
                  open_browser: {
                    type: 'BOOLEAN',
                    description:
                      'Set to true if the operator explicitly asks to see, display, or open the weather dashboard in their browser or on screen.',
                  },
                },
              },
            },
            {
              name: 'web_search',
              description:
                'Searches the live web for breaking news headlines, market data, technical research, flight status, or general facts. For weather and temperatures, use get_weather instead.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  query: {
                    type: 'STRING',
                    description: 'The search query string or topic to look up.',
                  },
                  mode: {
                    type: 'STRING',
                    description: 'Search mode: search (general), news (breaking news), or research (in-depth analysis).',
                    enum: ['search', 'news', 'research'],
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'recall_memory',
              description:
                'Retrieves stored memory facts, Operator profile attributes, mission objectives, and past tactical directives from persistent long-term memory.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  query: {
                    type: 'STRING',
                    description:
                      'Specific topic, keyword, or entity to search for in memory (e.g. "project", "preferences", "clearance"). Leave blank to recall recent memories.',
                  },
                  category: {
                    type: 'STRING',
                    description:
                      'Category filter: all, tactical, preference, mission, or profile.',
                    enum: ['all', 'tactical', 'preference', 'mission', 'profile'],
                  },
                },
              },
            },
            {
              name: 'store_memory',
              description:
                'Saves a new fact, operator preference, project specification, or mission objective into persistent long-term memory so it is remembered across all future conversations.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  content: {
                    type: 'STRING',
                    description:
                      'The concise, declarative memory statement or fact to preserve.',
                  },
                  category: {
                    type: 'STRING',
                    description:
                      'Category: tactical (technical/system), preference (operator habits/settings), or mission (goals/projects).',
                    enum: ['tactical', 'preference', 'mission'],
                  },
                  importance: {
                    type: 'STRING',
                    description:
                      'Importance rating: low, medium, high, or critical.',
                    enum: ['low', 'medium', 'high', 'critical'],
                  },
                },
                required: ['content'],
              },
            },
            {
              name: 'update_operator_profile',
              description:
                'Updates the operator\'s identity settings, name to call (callsign), assistant codename, voice preference, role, clearance, or behavioral directives in persistent storage.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  callsign: {
                    type: 'STRING',
                    description: 'The preferred name or callsign to address the operator (e.g. "Bhavya Sir", "Bhavya").',
                  },
                  assistant_name: {
                    type: 'STRING',
                    description: 'The configured name of the AI assistant (e.g. "Jarvis").',
                  },
                  voice_name: {
                    type: 'STRING',
                    description: 'Gemini 3.1 Live prebuilt male voice name: Charon, Fenrir, Puck, Achird, Algenib, Algieba, Alnilam, Enceladus, Iapetus, Orus, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, or Zubenelgenubi.',
                    enum: [
                      'Charon',
                      'Fenrir',
                      'Puck',
                      'Achird',
                      'Algenib',
                      'Algieba',
                      'Alnilam',
                      'Enceladus',
                      'Iapetus',
                      'Orus',
                      'Rasalgethi',
                      'Sadachbia',
                      'Sadaltager',
                      'Schedar',
                      'Umbriel',
                      'Zubenelgenubi',
                    ],
                  },
                  live_model: {
                    type: 'STRING',
                    description: 'Gemini Live model: models/gemini-3.1-flash-live-preview.',
                    enum: ['models/gemini-3.1-flash-live-preview'],
                  },
                  role: {
                    type: 'STRING',
                    description: 'Operative professional role or title.',
                  },
                  clearance: {
                    type: 'STRING',
                    description: 'Security clearance level.',
                  },
                  preferences: {
                    type: 'STRING',
                    description: 'Directives and behavioral preferences.',
                  },
                },
              },
            },
            {
              name: 'execute_os_action',
              description:
                'Controls host desktop actions across Linux and Windows: adjust system volume (volume_up, volume_down, mute, unmute, set_volume), launch authorized applications (code, terminal, notepad, gedit, text_editor, calculator, explorer/files, taskmgr, spotify, browser), open workspace project folders, open target URLs in browser, minimize all desktop windows, or lock the workstation. When confirming volume actions to the user, always vocalize the percentage as a natural whole number phrase in words (e.g. "seventy-five percent", never "seven five percent").',
              parameters: {
                type: 'OBJECT',
                properties: {
                  action: {
                    type: 'STRING',
                    description:
                      'The desktop action: launch_app, volume_up, volume_down, mute, unmute, set_volume, open_folder, open_url, minimize_all, or lock_screen.',
                    enum: [
                      'launch_app',
                      'volume_up',
                      'volume_down',
                      'mute',
                      'unmute',
                      'set_volume',
                      'open_folder',
                      'open_url',
                      'minimize_all',
                      'lock_screen',
                    ],
                  },
                  target: {
                    type: 'STRING',
                    description:
                      'Target parameter for the action (e.g. app name like "code", "calc", "notepad", "gedit", "text_editor", "terminal"; folder path; URL; or volume percentage 0-100).',
                  },
                },
                required: ['action'],
              },
            },
            {
              name: 'run_cyber_plugin',
              description:
                'Executes a specialized cyber plugin from the Project J.A.R.V.I.S plugin matrix: "system_diagnostic" (deep hardware/network diagnostic), "cyber_crypto" (SHA-256/MD5 hashing or Base64 cipher), "network_ping" (DNS resolution and latency check), or "workspace_navigator" (codebase stats, git branch, file metrics).',
              parameters: {
                type: 'OBJECT',
                properties: {
                  plugin_id: {
                    type: 'STRING',
                    description:
                      'The unique identifier of the plugin: system_diagnostic, cyber_crypto, network_ping, or workspace_navigator.',
                    enum: [
                      'system_diagnostic',
                      'cyber_crypto',
                      'network_ping',
                      'workspace_navigator',
                    ],
                  },
                  args: {
                    type: 'OBJECT',
                    description:
                      'Optional arguments object passed to the plugin (e.g. { host: "github.com" }, { operation: "hash", data: "secret" }, or { include_network: true }).',
                  },
                },
                required: ['plugin_id'],
              },
            },
          ],
        },
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
