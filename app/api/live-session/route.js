import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  JARVIS_SYSTEM_INSTRUCTION,
  GEMINI_LIVE_CONFIG,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_LABEL,
} from '@/lib/jarvisPersona';
import { getAllowedRoots, displayPath } from '@/lib/fsSandbox';
import { DEFAULT_WAKE_PHRASE } from '@/lib/wakePhrase';

// JARVIS_MEMORY_FILE relocates the vault (used by automated checks)
const MEMORY_FILE_PATH = path.resolve(
  /*turbopackIgnore: true*/ process.env.JARVIS_MEMORY_FILE || path.join(process.cwd(), 'data', 'memories.json')
);

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

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

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
    const selectedModel = GEMINI_LIVE_MODEL;

    // Synchronize voice back to persistent vault if provided by client
    if (clientVoiceName && profile.voiceName !== clientVoiceName) {
      profile.voiceName = clientVoiceName;
      try {
        fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(memoryData, null, 2), 'utf-8');
      } catch (e) {
        console.warn('[/api/live-session] Could not update memories.json with clientVoiceName:', e);
      }
    }

    console.log(`[/api/live-session] Initializing ${GEMINI_LIVE_LABEL} session: vocal_core="${voiceName}", operator="${callsign}"`);

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
Always acknowledge and act upon this knowledge seamlessly in conversation without needing to call 'recall_memory' first.

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
        {
          functionDeclarations: [
            {
              name: 'get_system_telemetry',
              behavior: 'BLOCKING',
              description:
                'Retrieves real-time host operating system resource metrics, including current CPU percentage, RAM memory usage and limits, active processes, uptime, network throughput, and GPU load.',
              parameters: {
                type: 'OBJECT',
                properties: {},
              },
            },
            {
              name: 'get_weather',
              behavior: 'BLOCKING',
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
              behavior: 'BLOCKING',
              description:
                'Runs a web search and shows the results as a dossier in the HUD Intel drawer: use it for news briefings, research the operator wants to read, or when they ask to see sources. For a quick factual answer you can rely on your built-in Google Search instead. For weather, use get_weather.',
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
              behavior: 'BLOCKING',
              description:
                'Retrieves stored memory facts, Operator profile attributes, mission objectives, and past tactical directives from persistent long-term memory. Recall is semantic: describe what you are looking for in natural language (e.g. "what database does the operator prefer") and results come back ranked by relevance.',
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
              behavior: 'BLOCKING',
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
              behavior: 'BLOCKING',
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
                    description: 'Gemini Live prebuilt male voice name: Charon, Fenrir, Puck, Achird, Algenib, Algieba, Alnilam, Enceladus, Iapetus, Orus, Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, or Zubenelgenubi.',
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
                  wake_phrase: {
                    type: 'STRING',
                    description: 'Standby wake phrase the operator says to bring Jarvis back online (e.g. "Hey Jarvis", "Wake up Jarvis").',
                  },
                  live_model: {
                    type: 'STRING',
                    description: `Gemini Live model: ${GEMINI_LIVE_MODEL}.`,
                    enum: [GEMINI_LIVE_MODEL],
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
              behavior: 'BLOCKING',
              description:
                'Controls host desktop actions across Linux and Windows: adjust system volume (volume_up, volume_down, mute, unmute, set_volume), launch applications (launch_app with the app\'s name: on Linux any installed application such as "Firefox", "Files", "Text Editor", "Blender"; if several match, the result lists candidates so ask the operator which one), search installed apps (list_apps with a name or category like "browser"), open workspace project folders, open target URLs in browser, minimize all desktop windows, or lock the workstation. When confirming volume actions to the user, always vocalize the percentage as a natural whole number phrase in words (e.g. "seventy-five percent", never "seven five percent").',
              parameters: {
                type: 'OBJECT',
                properties: {
                  action: {
                    type: 'STRING',
                    description:
                      'The desktop action: launch_app, list_apps, volume_up, volume_down, mute, unmute, set_volume, open_folder, open_url, minimize_all, or lock_screen.',
                    enum: [
                      'launch_app',
                      'list_apps',
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
                      'Target parameter for the action (e.g. an application name like "Firefox", "VS Code", "Calculator", "Terminal"; an app search term for list_apps; folder path; URL; or volume percentage 0-100).',
                  },
                },
                required: ['action'],
              },
            },
            {
              name: 'run_cyber_plugin',
              behavior: 'BLOCKING',
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
            {
              name: 'file_operations',
              behavior: 'BLOCKING',
              description:
                'Creates, reads, edits, and opens files and folders inside the operator\'s allowed workspace folders. Actions: list_directory (folder contents), read_file (text only), create_folder, create_file (fails if the file exists), write_file (replaces the whole file; previous version is backed up), append_file (adds text to the end), replace_in_file (exact find-and-replace; previous version is backed up), open_path (opens a file or folder in its default app, or in the code editor with app "code"). There is no delete action.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  action: {
                    type: 'STRING',
                    description: 'The file action to perform.',
                    enum: [
                      'list_directory',
                      'read_file',
                      'create_folder',
                      'create_file',
                      'write_file',
                      'append_file',
                      'replace_in_file',
                      'open_path',
                    ],
                  },
                  path: {
                    type: 'STRING',
                    description:
                      'Target file or folder path. Use "~" for the home folder (e.g. "~/Desktop/project-notes/todo.md").',
                  },
                  content: {
                    type: 'STRING',
                    description: 'Text content for create_file, write_file, or append_file.',
                  },
                  find: {
                    type: 'STRING',
                    description: 'replace_in_file only: the exact existing text to replace, copied from read_file output.',
                  },
                  replace: {
                    type: 'STRING',
                    description: 'replace_in_file only: the replacement text (empty string removes the found text).',
                  },
                  replace_all: {
                    type: 'BOOLEAN',
                    description: 'replace_in_file only: replace every occurrence instead of requiring exactly one match.',
                  },
                  app: {
                    type: 'STRING',
                    description: 'open_path only: "default" (system default app) or "code" (open in the code editor).',
                    enum: ['default', 'code'],
                  },
                },
                required: ['action', 'path'],
              },
            },
            {
              name: 'enter_standby',
              behavior: 'BLOCKING',
              description:
                'Ends the live voice link and returns Jarvis to standby, where he listens only for the wake phrase. Use when the operator says goodbye, "that\'s all", "go to sleep", or asks you to stand by. After calling it, say a brief farewell.',
              parameters: { type: 'OBJECT', properties: {} },
            },
            {
              name: 'youtube_player',
              behavior: 'BLOCKING',
              description:
                'Controls the built-in YouTube player panel in the HUD: play searches YouTube and starts the best match (the other results become the up-next queue); pause, resume, next, previous, stop, volume (0-100), now_playing.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  action: {
                    type: 'STRING',
                    description: 'Player action.',
                    enum: ['play', 'pause', 'resume', 'next', 'previous', 'stop', 'volume', 'now_playing'],
                  },
                  query: {
                    type: 'STRING',
                    description: 'play only: what to search for (song, video, topic, channel).',
                  },
                  volume: {
                    type: 'NUMBER',
                    description: 'volume only: level from 0 to 100.',
                  },
                },
                required: ['action'],
              },
            },
            {
              name: 'spotify_control',
              behavior: 'BLOCKING',
              description:
                'Controls the Spotify desktop app (launching it if needed): play, pause, toggle, next, previous, now_playing, and play_song to find and play a song, artist, album, or playlist by name.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  action: {
                    type: 'STRING',
                    description: 'Spotify action.',
                    enum: ['play', 'pause', 'toggle', 'next', 'previous', 'now_playing', 'play_song'],
                  },
                  query: {
                    type: 'STRING',
                    description: 'play_song only: what to play, e.g. "Bohemian Rhapsody by Queen".',
                  },
                },
                required: ['action'],
              },
            },
            {
              name: 'view_3d_model',
              behavior: 'BLOCKING',
              description:
                'Opens a 3D model (.glb or .gltf) from the allowed workspace folders in the HUD holo-viewer with orbit controls, auto-framing, animation playback, and mesh / triangle statistics.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  path: {
                    type: 'STRING',
                    description: 'Path to the model, e.g. "~/Downloads/robot.glb".',
                  },
                },
                required: ['path'],
              },
            },
            {
              name: 'create_project',
              behavior: 'BLOCKING',
              description:
                'Scaffolds a new software project as a background job using the operator\'s preferred generators: node-express (Node.js Express API via @bhavyajustchill/init: JavaScript MVC or TypeScript modular), admin-panel (React + Tailwind + shadcn admin template via @bhavyajustchill/init), nextjs (create-next-app), react (Vite, JavaScript), flutter (flutter create). Returns immediately with a job id; a [PROJECT UPDATE] message arrives when it finishes.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  template: {
                    type: 'STRING',
                    description: 'Project template.',
                    enum: ['node-express', 'admin-panel', 'nextjs', 'react', 'flutter'],
                  },
                  name: {
                    type: 'STRING',
                    description: 'Project name (converted to kebab-case, or snake_case for Flutter).',
                  },
                  location: {
                    type: 'STRING',
                    description: 'Parent folder for the project (default "~/dev").',
                  },
                  language: {
                    type: 'STRING',
                    description: 'node-express and nextjs only: js (default) or ts. React projects are always JavaScript.',
                    enum: ['js', 'ts'],
                  },
                  install_dependencies: {
                    type: 'BOOLEAN',
                    description: 'Install dependencies after generating (default true).',
                  },
                },
                required: ['template', 'name'],
              },
            },
            {
              name: 'create_document',
              behavior: 'BLOCKING',
              description:
                'Creates a formatted PDF or Word (DOCX) document inside the allowed workspace folders. Write the content as markdown: "#"/"##"/"###" headings, "-" bullets, "1." numbered items, **bold**, *italic*, `code`, and "---" dividers. Fails if the file exists unless overwrite is true (the old version is backed up).',
              parameters: {
                type: 'OBJECT',
                properties: {
                  path: {
                    type: 'STRING',
                    description: 'Where to save the document, e.g. "~/Documents/reports/weekly-summary.pdf". The extension is added if missing.',
                  },
                  format: {
                    type: 'STRING',
                    description: 'Document format: pdf (default) or docx (Microsoft Word).',
                    enum: ['pdf', 'docx'],
                  },
                  title: {
                    type: 'STRING',
                    description: 'Optional document title shown at the top.',
                  },
                  content: {
                    type: 'STRING',
                    description: 'The full document body in markdown.',
                  },
                  overwrite: {
                    type: 'BOOLEAN',
                    description: 'Replace an existing file at this path (only after the operator agrees).',
                  },
                },
                required: ['path', 'content'],
              },
            },
            {
              name: 'organize_folder',
              behavior: 'BLOCKING',
              description:
                'Sorts the loose top-level files of a folder (e.g. "~/Downloads") into sub-folders by type: Images, Videos, Audio, Documents, Spreadsheets, Presentations, Archives, Code, Installers, Fonts, 3D Models, Others. Sub-folders, hidden files, and unfinished downloads are left alone. ALWAYS run mode "preview" first, tell the operator the plan, and run mode "apply" only after they explicitly confirm. Mode "undo" reverses the most recent organize.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  path: {
                    type: 'STRING',
                    description: 'Folder to organize (e.g. "~/Downloads"). Optional for mode "undo".',
                  },
                  mode: {
                    type: 'STRING',
                    description: 'preview (default, moves nothing), apply (moves files), or undo (reverses the last organize).',
                    enum: ['preview', 'apply', 'undo'],
                  },
                },
              },
            },
          ],
        },
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
