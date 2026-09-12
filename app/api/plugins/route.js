import { NextResponse } from 'next/server';
import { getAllPlugins, executePlugin } from '@/lib/pluginRegistry';

/**
 * GET /api/plugins
 * Returns list of registered Cyber Plugins and schemas.
 */
export async function GET() {
  try {
    const plugins = getAllPlugins();
    return NextResponse.json({
      success: true,
      count: plugins.length,
      plugins,
    });
  } catch (error) {
    console.error('[/api/plugins] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to list plugins' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/plugins
 * Payload: { pluginId: string, args?: object }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { pluginId, args } = body;

    if (!pluginId) {
      return NextResponse.json(
        { error: 'MISSING_PLUGIN_ID', message: 'pluginId parameter is required.' },
        { status: 400 }
      );
    }

    const executionResult = await executePlugin(pluginId, args || {});
    return NextResponse.json(executionResult, {
      status: executionResult.success ? 200 : 500,
    });
  } catch (error) {
    console.error('[/api/plugins] POST error:', error);
    return NextResponse.json(
      { error: 'EXECUTION_FAILED', message: error.message || 'Failed to execute plugin' },
      { status: 500 }
    );
  }
}

