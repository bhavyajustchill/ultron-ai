/**
 * Live tool `view_3d_model`: Opens a glTF / GLB model in the HUD holo-viewer.
 */
export default {
  declaration: {
    name: 'view_3d_model',
    description: 'Opens a 3D model (.glb or .gltf) from the allowed workspace folders in the HUD holo-viewer with orbit controls, auto-framing, animation playback, and mesh / triangle statistics.',
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

  async run(args, ctx) {
    const modelPath = (args.path || '').trim();
    let output;
    try {
      const res = await fetch(ctx.media.modelFileUrl(modelPath), { method: 'HEAD' });
      if (res.ok) {
        ctx.media.openModelViewer(modelPath);
        output = { status: 'OPENED', path: modelPath, message: 'The model is displayed in the HUD holo-viewer.' };
      } else {
        const reasons = { 403: 'outside the allowed folders', 404: 'not found', 415: 'not a .glb or .gltf model' };
        output = { status: 'FAILED', message: `Cannot open "${modelPath}": ${reasons[res.status] || `error ${res.status}`}.` };
      }
    } catch (err) {
      output = { status: 'FAILED', message: err.message };
    }
    ctx.log(`[MEDIA] 3D viewer: ${output.message}`);
    return output;
  },
};
