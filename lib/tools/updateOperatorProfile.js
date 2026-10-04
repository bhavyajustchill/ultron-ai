import { GEMINI_LIVE_MODEL } from '@/lib/jarvisPersona';
import { postJson } from '@/lib/tools/http';
import { ACCENT_PRESETS, resolveAccent, accentName } from '@/lib/accentTheme';

/**
 * Live tool `update_operator_profile`: Updates identity settings (callsign, codename, voice, wake phrase, role, ...).
 */
export default {
  declaration: {
    name: 'update_operator_profile',
    description: 'Updates the operator\'s identity settings, name to call (callsign), assistant codename, voice preference, role, clearance, behavioral directives, or the HUD accent colour in persistent storage.',
    parameters: {
      type: 'OBJECT',
      properties: {
        callsign: {
          type: 'STRING',
          description: 'The preferred name or callsign to address the operator (e.g. "Bhavya Sir", "Bhavya").',
        },
        assistant_name: {
          type: 'STRING',
          description: 'The configured name of the AI assistant (e.g. "Ultron").',
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
          description: 'Standby wake phrase the operator says to bring Ultron back online (e.g. "Hey Ultron", "Wake up Ultron").',
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
        hud_accent: {
          type: 'STRING',
          description: `HUD accent colour theme: a preset (${ACCENT_PRESETS.map((p) => p.name).join(', ')}), a colour word like "purple", or a hex code like "#FF8800". Applies instantly.`,
        },
      },
    },
  },

  async run(args, ctx) {
    const fields = {
      callsign: 'callsign',
      assistant_name: 'assistantName',
      voice_name: 'voiceName',
      live_model: 'liveModel',
      role: 'role',
      clearance: 'clearance',
      preferences: 'preferences',
      wake_phrase: 'wakePhrase',
    };
    const updates = {};
    for (const [arg, key] of Object.entries(fields)) {
      const value = typeof args[arg] === 'string' ? args[arg].trim() : '';
      if (value) updates[key] = key === 'wakePhrase' ? value.slice(0, 40) : value;
    }
    if (args.hud_accent) {
      const accent = resolveAccent(args.hud_accent);
      if (!accent) {
        return { status: 'UNKNOWN_COLOUR', message: `"${args.hud_accent}" is not a colour Ultron knows. Offer the presets: ${ACCENT_PRESETS.map((p) => p.name).join(', ')}, or a hex code.` };
      }
      updates.accentColor = accent;
    }
    ctx.log(`[SETTINGS] Inscribing profile update to neural core: ${Object.keys(updates).join(', ')}...`);

    let profile = { ...ctx.store.getState().operatorProfile, ...updates };
    try {
      const data = await postJson('/api/memory', { action: 'update_profile', profile: updates });
      if (data.profile) {
        ctx.store.getState().setOperatorProfile(data.profile);
        profile = data.profile;
      }
    } catch (err) {
      console.error('[tools/update_operator_profile] Update error:', err);
    }
    ctx.log(`[SETTINGS] Operative identity synchronized. Address callsign: "${profile.callsign}".`);

    // Voice and persona live in the session setup: re-link (conversation kept) once this reply is spoken
    const needsRelink = ['voiceName', 'callsign', 'assistantName', 'preferences', 'role', 'clearance'].some((key) => key in updates);
    if (needsRelink) ctx.requestRelink();

    return {
      status: 'UPDATED',
      message: `Operative profile synchronized. Configured address name is now "${profile.callsign}".${updates.accentColor ? ` HUD accent is now ${accentName(updates.accentColor)}.` : ''}${needsRelink ? ' Confirm briefly; the link then re-connects with these settings and the conversation carried over.' : ''}`,
      profile,
    };
  },
};
