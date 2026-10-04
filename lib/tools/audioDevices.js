import { listAudioDevices, matchDeviceByName, canChooseOutput } from '@/lib/audioDevices';

/**
 * Live tool `audio_devices` (Phase 8.7): lists microphones / speakers and switches them by name.
 */
export default {
  declaration: {
    name: 'audio_devices',
    description: 'Lists the microphones and speakers this computer has, or switches the one Ultron uses by its name ("use my headset microphone", "play through the HDMI speakers"). Use name "default" to go back to the system default. Actions: list, set_input, set_output.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'list, set_input (microphone), or set_output (speaker).',
          enum: ['list', 'set_input', 'set_output'],
        },
        name: {
          type: 'STRING',
          description: 'Words from the device name for set_input / set_output (e.g. "headset", "USB", "HDMI"), or "default".',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || 'list';
    ctx.log(`[AUDIO] ${action.toUpperCase().replace('_', ' ')}${args.name ? ` ("${args.name}")` : ''}...`);
    let devices;
    try {
      devices = await listAudioDevices({ requestLabels: true });
    } catch (err) {
      const message = `Audio devices could not be read: ${err.message}`;
      ctx.log(`[AUDIO] ${message}`);
      return { success: false, message };
    }
    const state = ctx.store.getState();
    const current = (kind) => (kind === 'input' ? state.audioInput : state.audioOutput)?.label || 'system default';

    if (action === 'list') {
      const message = `Microphones: ${devices.inputs.map((d) => d.label || 'unnamed').join('; ') || 'none'}. Speakers: ${devices.outputs.map((d) => d.label || 'unnamed').join('; ') || 'none'}. In use: microphone ${current('input')}, speaker ${current('output')}.`;
      ctx.log(`[AUDIO] ${message}`);
      return { success: true, message, microphones: devices.inputs.map((d) => d.label), speakers: devices.outputs.map((d) => d.label), can_choose_speaker: canChooseOutput() };
    }

    const kind = action === 'set_output' ? 'output' : 'input';
    if (kind === 'output' && !canChooseOutput()) {
      return { success: false, message: 'This browser cannot choose a speaker for web audio (Chrome or Edge 110+ can). Ultron keeps using the system default output.' };
    }
    if (/^(default|system default|reset)$/i.test(String(args.name || '').trim())) {
      state.setAudioDevice(kind, null);
      const message = `${kind === 'input' ? 'Microphone' : 'Speaker'} set back to the system default.`;
      ctx.log(`[AUDIO] ${message}`);
      return { success: true, message };
    }
    const pool = kind === 'input' ? devices.inputs : devices.outputs;
    const device = matchDeviceByName(pool, args.name);
    if (!device) {
      const message = `No ${kind === 'input' ? 'microphone' : 'speaker'} matches "${args.name}". Available: ${pool.map((d) => d.label).join('; ') || 'none'}.`;
      ctx.log(`[AUDIO] ${message}`);
      return { success: false, message };
    }
    state.setAudioDevice(kind, device);
    const message = `${kind === 'input' ? 'Microphone' : 'Speaker'} switched to "${device.label}".`;
    ctx.log(`[AUDIO] ${message}`);
    return { success: true, message };
  },
};
