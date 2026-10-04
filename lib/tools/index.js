import getSystemTelemetry from '@/lib/tools/getSystemTelemetry';
import getWeather from '@/lib/tools/getWeather';
import webSearch from '@/lib/tools/webSearch';
import recallMemory from '@/lib/tools/recallMemory';
import storeMemory from '@/lib/tools/storeMemory';
import updateOperatorProfile from '@/lib/tools/updateOperatorProfile';
import executeOsAction from '@/lib/tools/executeOsAction';
import runCyberPlugin from '@/lib/tools/runCyberPlugin';
import fileOperations from '@/lib/tools/fileOperations';
import runTerminalCommand from '@/lib/tools/runTerminalCommand';
import desktopInput from '@/lib/tools/desktopInput';
import enterStandby from '@/lib/tools/enterStandby';
import youtubePlayer from '@/lib/tools/youtubePlayer';
import spotifyControl from '@/lib/tools/spotifyControl';
import view3dModel from '@/lib/tools/view3dModel';
import createProject from '@/lib/tools/createProject';
import createDocument from '@/lib/tools/createDocument';
import organizeFolder from '@/lib/tools/organizeFolder';
import undoLastAction from '@/lib/tools/undoLastAction';
import systemSettings from '@/lib/tools/systemSettings';
import reminders from '@/lib/tools/reminders';
import topicMonitors from '@/lib/tools/topicMonitors';
import audioDevices from '@/lib/tools/audioDevices';
import composeMessage from '@/lib/tools/composeMessage';
import findFlights from '@/lib/tools/findFlights';
import steamGames from '@/lib/tools/steamGames';
import processFile from '@/lib/tools/processFile';
import browserControl from '@/lib/tools/browserControl';
import devAgent from '@/lib/tools/devAgent';

/**
 * Registry of live tools (Phase 8.1). Each module self-describes: `declaration` (sent to Gemini
 * Live by /api/live-session) and `run(args, ctx)` (executed in the browser by useGeminiLive with
 * a context of hook services). Adding a tool means adding a module and listing it here.
 */
export const TOOLS = [
  getSystemTelemetry,
  getWeather,
  webSearch,
  recallMemory,
  storeMemory,
  updateOperatorProfile,
  executeOsAction,
  runCyberPlugin,
  fileOperations,
  runTerminalCommand,
  desktopInput,
  enterStandby,
  youtubePlayer,
  spotifyControl,
  view3dModel,
  createProject,
  createDocument,
  organizeFolder,
  undoLastAction,
  systemSettings,
  reminders,
  topicMonitors,
  audioDevices,
  composeMessage,
  findFlights,
  steamGames,
  processFile,
  browserControl,
  devAgent,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.declaration.name, tool]));

/**
 * Function declarations for the live session; tools are BLOCKING unless a module says otherwise.
 */
export function toolDeclarations() {
  return TOOLS.map(({ declaration, behavior = 'BLOCKING' }) => ({ ...declaration, behavior }));
}
