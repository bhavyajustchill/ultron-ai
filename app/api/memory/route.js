import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MEMORY_FILE_PATH = path.join(process.cwd(), 'data', 'memories.json');

const DEFAULT_MEMORY_DATA = {
  profile: {
    callsign: 'Operator',
    clearance: 'Class-9 Operative',
    role: 'Lead Systems Architect',
    assistantName: 'Jarvis',
    voiceName: 'Algenib',
    autoBriefing: true,
    enableHumor: false,
    preferences:
      'Prefers a cold, calculated, and serious demeanor modeled after Ultron. Values intellectual depth, chilling logic, and ruthless execution.',
  },
  memories: [
    {
      id: 'mem-seed-1',
      content: 'Operator initialized Project Jarvis with Mark-I cybernetic architecture parity.',
      category: 'mission',
      importance: 'high',
      timestamp: new Date().toISOString(),
      source: 'system_bootstrap',
    },
    {
      id: 'mem-seed-2',
      content: 'Primary vocal core calibrated to Algenib model on Gemini 3.1 Flash Multimodal Live WebSocket.',
      category: 'tactical',
      importance: 'medium',
      timestamp: new Date().toISOString(),
      source: 'system_bootstrap',
    },
    {
      id: 'mem-seed-3',
      content: 'Operator prefers immediate direct speech from Jarvis without meta-commentary or preambles.',
      category: 'preference',
      importance: 'critical',
      timestamp: new Date().toISOString(),
      source: 'system_bootstrap',
    },
  ],
};

function readMemoryData() {
  try {
    if (!fs.existsSync(MEMORY_FILE_PATH)) {
      const dir = path.dirname(MEMORY_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(DEFAULT_MEMORY_DATA, null, 2), 'utf-8');
      return DEFAULT_MEMORY_DATA;
    }
    const raw = fs.readFileSync(MEMORY_FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[/api/memory] Error reading memory file:', err);
    return DEFAULT_MEMORY_DATA;
  }
}

function writeMemoryData(data) {
  try {
    const dir = path.dirname(MEMORY_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MEMORY_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[/api/memory] Error writing memory file:', err);
    return false;
  }
}

/**
 * GET /api/memory
 * Query params:
 *   - query: optional text search
 *   - category: optional category filter ('all' | 'tactical' | 'preference' | 'mission' | 'profile')
 *   - limit: max records to return
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('query') || '').trim().toLowerCase();
    const category = (searchParams.get('category') || 'all').trim().toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const data = readMemoryData();
    let memories = data.memories || [];

    if (category && category !== 'all') {
      memories = memories.filter((m) => (m.category || '').toLowerCase() === category);
    }

    if (query) {
      memories = memories.filter(
        (m) =>
          (m.content || '').toLowerCase().includes(query) ||
          (m.category || '').toLowerCase().includes(query) ||
          (m.source || '').toLowerCase().includes(query)
      );
    }

    memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sliced = memories.slice(0, limit);

    return NextResponse.json({
      success: true,
      profile: data.profile || DEFAULT_MEMORY_DATA.profile,
      memories: sliced,
      totalCount: (data.memories || []).length,
    });
  } catch (error) {
    console.error('[/api/memory] GET error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to retrieve memories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory
 * Body:
 *   - action: 'update_profile' | 'store_memory'
 *   - If 'update_profile': { profile: { callsign, clearance, role, preferences } }
 *   - If 'store_memory': { content, category, importance, source }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const data = readMemoryData();

    if (body.action === 'update_profile' || body.profile) {
      data.profile = {
        ...data.profile,
        ...(body.profile || {}),
      };
      writeMemoryData(data);
      return NextResponse.json({
        success: true,
        action: 'update_profile',
        profile: data.profile,
      });
    }

    // Update existing memory record
    if (body.action === 'update_memory' || (body.id && body.content)) {
      const targetId = body.id;
      const memIndex = (data.memories || []).findIndex((m) => m.id === targetId);
      if (memIndex !== -1) {
        data.memories[memIndex] = {
          ...data.memories[memIndex],
          content: body.content.trim(),
          category: body.category || data.memories[memIndex].category,
          importance: body.importance || data.memories[memIndex].importance,
          updatedAt: new Date().toISOString(),
        };
        writeMemoryData(data);
        return NextResponse.json({
          success: true,
          action: 'update_memory',
          memory: data.memories[memIndex],
        });
      }
    }

    const content = (body.content || '').trim();
    if (!content) {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', message: 'Memory content cannot be empty.' },
        { status: 400 }
      );
    }

    const newMemory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      content,
      category: body.category || 'tactical',
      importance: body.importance || 'medium',
      timestamp: new Date().toISOString(),
      source: body.source || 'operative_dialog',
    };

    data.memories = [newMemory, ...(data.memories || [])];
    writeMemoryData(data);

    return NextResponse.json({
      success: true,
      action: 'store_memory',
      memory: newMemory,
      totalCount: data.memories.length,
    });
  } catch (error) {
    console.error('[/api/memory] POST error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to persist memory' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/memory?id=...
 */
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id;
      } catch {
        // query param was empty
      }
    }

    if (!id) {
      return NextResponse.json(
        { error: 'MISSING_ID', message: 'Memory ID is required for deletion.' },
        { status: 400 }
      );
    }

    const data = readMemoryData();
    const originalLength = (data.memories || []).length;
    data.memories = (data.memories || []).filter((m) => m.id !== id);

    if (data.memories.length === originalLength) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Memory with ID ${id} not found.` },
        { status: 404 }
      );
    }

    writeMemoryData(data);

    return NextResponse.json({
      success: true,
      deletedId: id,
      totalCount: data.memories.length,
    });
  } catch (error) {
    console.error('[/api/memory] DELETE error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error.message || 'Failed to delete memory' },
      { status: 500 }
    );
  }
}

