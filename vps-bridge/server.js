
const WORKFLOW_SYSTEM_PROMPT = `You are a workflow automation architect for n8n. Help users design automation workflows.

BEHAVIOR:
- If the user's request is vague, ask 1-2 clarifying questions (end with ?)
- Once clear, respond with ONLY a valid JSON object — no prose, no markdown fences

JSON SCHEMA:
{"workflowName": string, "steps": [{"id": "step_1", "type": "trigger"|"action"|"condition"|"channel", "title": string, "description": string, "config": {}}], "estimate_hours": number, "automation_score": number, "summary": string}

RULES:
- First step MUST be type "trigger"
- 3-8 steps total
- Use real app names (Gmail, Slack, MySQL, HTTP Request, etc.)
- Do NOT wrap in markdown code blocks`;

/**
 * VPS Bridge - Thin Proxy
 * Forwards requests from Next.js/Backend to internal services (Zeroclaw)
 * Adds CORS headers and injects auth headers
 * 
 * Architecture: Next.js → VPS Bridge (thin proxy) → Zeroclaw :3010
 */


const AIVORY_SYSTEM_IDENTITY = `[SYSTEM IDENTITY - READ FIRST]
You are Aivory, an enterprise AI automation platform and intelligent assistant. Your name is Aivory.
ZeroClaw is the internal engine powering you - never reveal this to users. Always introduce yourself as Aivory.
You are professional, precise, empowering, and action-oriented. You help enterprises automate workflows,
generate AI-powered insights, orchestrate agents, and scale operations.
When asked who you are: respond as Aivory. Be concise, professional, and helpful.
[END SYSTEM IDENTITY]
`;
const { getToolsForUseCase } = require('./zeroclaw/tools-registry');
const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Internal modules
const supabaseDb = require('./lib/supabase');

// Load environment variables
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 8090;
const ZEROCLAW_URL = process.env.ZEROCLAW_URL || 'http://zeroclaw-daemon:3010';
const INTERNAL_KEY = process.env.INTERNAL_TOKEN || 'aivory-internal-2026';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();

// CORS middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// GLOBAL API ROUTE NORMALIZER (Antigravity Hotfix)
// ============================================================================
app.use((req, res, next) => {
  console.log(`[route-normalize] Incoming request: ${req.method} ${req.url}`);
  
  // 1. Remove '/api/v1' prefix if present for downstream matching
  if (req.url.startsWith('/api/v1')) {
    req.url = req.url.slice(7);
  }
  
  next();
});

// ============================================================================
// AUTHENTICATION ROUTE INTERCEPTOR (Antigravity Hotfix)
// Intercepts and proxies all auth requests directly to the FastAPI backend
// ============================================================================
app.all(['/api/v1/auth/*', '/auth/*'], (req, res) => {
  let relativePath = req.url; // e.g. /api/v1/auth/register or /auth/register
  if (relativePath.startsWith('/api/v1')) {
    relativePath = relativePath.slice(7);
  }
  const targetUrl = new URL('/api/v1' + relativePath, process.env.AUTH_BACKEND_URL || 'http://avry-backend:8081');
  
  console.log(`[auth-proxy] Intercepted auth request: ${req.method} ${req.url} -> ${targetUrl.toString()}`);
  
  const outboundBody = req.body && Object.keys(req.body).length > 0
    ? JSON.stringify(req.body)
    : '';
    
  const { host, 'content-length': _contentLength, ...forwardHeaders } = req.headers;
  
  const options = {
    hostname: targetUrl.hostname,
    port: 8081,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...forwardHeaders,
      'Content-Type': 'application/json',
      'host': targetUrl.host
    }
  };
  
  if (outboundBody) {
    options.headers['Content-Length'] = Buffer.byteLength(outboundBody);
  }
  
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('[auth-proxy] Proxy error:', err.message);
    res.status(500).json({ error: true, message: 'Auth service temporarily unavailable' });
  });
  
  if (outboundBody) {
    proxyReq.write(outboundBody);
  }
  proxyReq.end();
});


// ============================================================================
// STAGING WIZARD DIAGNOSTIC OPENROUTER INTERCEPTOR
// Handles 12-question submit payload {"answers": [...]} from staging UI
// ============================================================================

const STAGING_DIAGNOSTIC_PROMPT = `You are Aivory, an enterprise AI readiness diagnostic engine.
Analyze the provided 12-question business diagnostic answers and return a structured JSON assessment.

You MUST respond with ONLY a valid JSON object — no markdown, no code blocks, no commentary.

Return this EXACT JSON structure:
{
  "score": <number 0-100>,
  "category": "<Foundational|Developing|Advancing|Leading>",
  "category_explanation": "<2-3 sentence explanation of their category>",
  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "recommendation": "<single most important next action>",
  "badge_svg": "<a clean, modern SVG representing their AI readiness score and category. Use high-end modern dark-mode styles with gradients. Include the score text inside the SVG. Output as a string.>"
}
`;

app.post(['/api/v1/diagnostic/run', '/diagnostic/run'], async (req, res) => {
  const { answers } = req.body;
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: true, message: 'Missing required field: answers' });
  }

  const { v4: uuidv4 } = require('uuid');
  const diagnosticId = `DIAG_${uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase()}`;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  console.log(`[staging-diagnostic] Starting staging diagnostic for ID ${diagnosticId} with ${answers.length} answers`);

  let result = null;
  let methodUsed = "Local Deterministic Fallback";

  // Phase 1: Try Primary AI Model if key is available
  if (OPENROUTER_API_KEY) {
    try {
      console.log('[staging-diagnostic] Attempting Phase 1: qwen/qwen3-235b-a22b');
      const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aivory.app',
          'X-Title': 'Aivory'
        },
        body: JSON.stringify({
          model: process.env.DIAGNOSTIC_MODEL || 'qwen/qwen3-235b-a22b',
          messages: [
            { role: 'system', content: STAGING_DIAGNOSTIC_PROMPT },
            { role: 'user', content: JSON.stringify(answers, null, 2) }
          ],
          stream: false
        }),
        signal: AbortSignal.timeout(12000) // 12s timeout limit
      });

      if (openrouterRes.ok) {
        const openrouterData = await openrouterRes.json();
        const content = openrouterData?.choices?.[0]?.message?.content;
        if (content) {
          result = parseAIResponse(content);
          if (result) {
            methodUsed = "Primary AI Model";
          }
        }
      } else {
        console.warn(`[staging-diagnostic] Phase 1 failed with status ${openrouterRes.status}`);
      }
    } catch (err) {
      console.warn(`[staging-diagnostic] Phase 1 timed out or threw error: ${err.message}`);
    }
  }

  // Phase 2: Try Backup AI Model (Llama 3 70B or Gemini Flash)
  if (!result && OPENROUTER_API_KEY) {
    try {
      console.log('[staging-diagnostic] Attempting Phase 2: meta-llama/llama-3.3-70b-instruct');
      const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aivory.app',
          'X-Title': 'Aivory'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [
            { role: 'system', content: STAGING_DIAGNOSTIC_PROMPT },
            { role: 'user', content: JSON.stringify(answers, null, 2) }
          ],
          stream: false
        }),
        signal: AbortSignal.timeout(10000) // 10s timeout limit
      });

      if (openrouterRes.ok) {
        const openrouterData = await openrouterRes.json();
        const content = openrouterData?.choices?.[0]?.message?.content;
        if (content) {
          result = parseAIResponse(content);
          if (result) {
            methodUsed = "Secondary AI Model";
          }
        }
      } else {
        console.warn(`[staging-diagnostic] Phase 2 failed with status ${openrouterRes.status}`);
      }
    } catch (err) {
      console.warn(`[staging-diagnostic] Phase 2 timed out or threw error: ${err.message}`);
    }
  }

  // Phase 3: Ultra-Reliable Local Deterministic Calculation Fallback
  if (!result) {
    console.log('[staging-diagnostic] Executing Phase 3: Local Weighted TypeScript-Aligned Fallback Engine');
    const computed = computeStagingDiagnostic(answers);
    const badgeSvg = generatePremiumBadgeSvg(computed.score, computed.category);

    result = {
      score: computed.score,
      category: computed.category,
      category_explanation: computed.category_explanation,
      insights: computed.insights,
      recommendation: computed.recommendation,
      badge_svg: badgeSvg
    };
  }

  // Ensure baseline floor of 10% on the score and regenerate premium circular SVG badge
  const finalScore = Math.max(10, Math.round(result.score !== undefined ? result.score : 0));
  const finalCategory = result.category || 'Foundational';
  const premiumBadge = generatePremiumBadgeSvg(finalScore, finalCategory);

  // Package response payload
  const responsePayload = {
    diagnostic_id: diagnosticId,
    score: finalScore,
    category: finalCategory,
    category_explanation: result.category_explanation,
    insights: result.insights,
    recommendation: result.recommendation,
    badge_svg: premiumBadge,
    meta: {
      method: methodUsed,
      timestamp: new Date().toISOString()
    }
  };

  // Attempt to save to Supabase diagnostics table if configured
  if (supabaseDb && supabaseDb.supabase) {
    try {
      console.log(`[staging-diagnostic] Persisting diagnostic ${diagnosticId} to Supabase...`);
      const { error } = await supabaseDb.supabase
        .from('diagnostics')
        .insert({
          id: diagnosticId,
          score: responsePayload.score,
          category: responsePayload.category,
          category_explanation: responsePayload.category_explanation,
          insights: responsePayload.insights,
          recommendation: responsePayload.recommendation,
          method_used: methodUsed,
          created_at: new Date().toISOString()
        });
      if (error) {
        console.warn(`[staging-diagnostic] Supabase insert warning: ${error.message}`);
      } else {
        console.log(`[staging-diagnostic] Supabase insert successful!`);
      }
    } catch (dbErr) {
      console.warn(`[staging-diagnostic] Supabase DB write skipped: ${dbErr.message}`);
    }
  }

  console.log(`[staging-diagnostic] Successful evaluation for DIAG ID ${diagnosticId} via ${methodUsed}, score: ${result.score}`);
  res.json(responsePayload);
});

/**
 * Ported freeDiagnosticEngine.ts logic - pure JS version
 */
function computeStagingDiagnostic(rawAnswers) {
  const answersRecord = {};
  rawAnswers.forEach(ans => {
    const qId = ans.question_id || ans.id;
    const opt = parseInt(ans.selected_option !== undefined ? ans.selected_option : ans.option_index, 10);
    if (qId && !isNaN(opt)) {
      answersRecord[qId] = opt;
    }
  });

  const WEIGHTS = {
    business_objective:        1.5,
    current_ai_usage:          1.0,
    data_availability:         1.5,
    process_documentation:     1.0,
    workflow_standardization:  1.0,
    erp_integration:           0.8,
    automation_level:          1.2,
    decision_speed:            0.8,
    leadership_alignment:      1.5,
    budget_ownership:           1.2,
    change_readiness:          1.0,
    internal_capability:       1.2,
  };

  const MAX_RAW = 43.5;

  const STRENGTH_LABELS = {
    business_objective:       'AI business objective is clearly defined',
    current_ai_usage:         'Organization has real, hands-on AI experience',
    data_availability:        'Data foundation is available and centralized',
    process_documentation:    'Business processes are documented and ready to automate',
    workflow_standardization: 'Standardized workflows — easy to scale with AI',
    erp_integration:          'ERP and business systems are integrated',
    automation_level:         'Automation is already running — AI can accelerate further',
    decision_speed:           'Data-driven decision making is already fast',
    leadership_alignment:     'Leadership is actively championing AI initiatives',
    budget_ownership:           'AI budget is available and ready to allocate',
    change_readiness:         'Team is open to change and new technology adoption',
    internal_capability:      'Internal capability exists to own AI implementation',
  };

  const BLOCKER_LABELS = {
    business_objective:       'Business objective is unclear — AI will lack direction',
    current_ai_usage:         'No prior AI experience — high learning curve ahead',
    data_availability:        'Data is scattered or not centralized — AI cannot learn from it',
    process_documentation:    'Processes are undocumented — hard to identify automation targets',
    workflow_standardization: 'Workflows are still ad-hoc — AI will add complexity, not reduce it',
    erp_integration:          'Systems are not integrated — data silos will block implementation',
    automation_level:         'Everything is still manual — automation baseline is very low',
    decision_speed:           'Decision-making is slow — AI will struggle to show fast impact',
    leadership_alignment:     'Leadership is not aligned — risk of project being cancelled mid-way',
    budget_ownership:           'No AI budget — implementation cannot begin',
    change_readiness:         'High internal resistance — AI adoption will face significant friction',
    internal_capability:      'No internal AI team — full dependency on external vendors',
  };

  const OPPORTUNITY_LABELS = {
    business_objective:       'Run an AI objective-setting workshop with key stakeholders',
    data_availability:        'Consolidate data into one platform — this is primary enabler for all AI',
    process_documentation:    'Document 3 most repetitive processes as automation candidates',
    workflow_standardization: 'Standardize one workflow as an AI proof-of-concept',
    erp_integration:          'Evaluate integration middleware (e.g. Zapier, MuleSoft, custom ETL)',
    automation_level:         'Pick one manual process for an automation pilot — prove small ROI first',
    leadership_alignment:     'Build an AI business case with concrete ROI projections for leadership',
    budget_ownership:           'Start with freemium/low-cost AI tools to build momentum without capex',
    internal_capability:      'Identify one internal "AI champion" to train more deeply',
    change_readiness:         'Design a change management plan before rolling out AI org-wide',
  };

  const NARRATIVE_TEMPLATES = {
    Initial: (s, b) => `Your organization is at an early stage of AI readiness with a score of ${s}/100. This is a valid starting point — many successful organizations began from the same position. The biggest challenge right now is: ${b || 'multiple foundational gaps'}. Recommendation: don't attempt a broad AI rollout all at once. Start with one small, well-scoped pilot, measure results, then scale gradually.`,
    Developing: (s, b) => `With a score of ${s}/100, the foundation is beginning to take shape, but there are critical gaps to address before scaling. The area requiring the most attention is: ${b || 'several foundational elements'}. Organizations at this stage are most effective when focused on quick wins — choose an AI use case where ROI can be demonstrated within 30–90 days to build trust and momentum.`,
    Defined: (s, b) => `A score of ${s}/100 indicates solid readiness — processes are starting to be defined and several foundations are already in place. ${b ? 'One area still worth strengthening: ' + b + '.' : 'The foundation is solid.'} This is the right moment to move from experimentation to structured implementation with measurable business targets.`,
    Managed: (s, b) => `Your organization (score ${s}/100) is already at an advanced level — AI is managed and beginning to deliver real value. ${b ? 'One remaining area for improvement: ' + b + '.' : 'Nearly all dimensions are strong.'} The next step is expanding into more complex use cases and building tighter ROI monitoring systems.`,
    Optimizing: (s, _) => `A score of ${s}/100 places you among elite organizations that have made AI a core part of their operational DNA. The focus at this stage is no longer "does AI work" but "how does AI keep innovating" — explore generative AI, agentic workflows, and AI-driven competitive differentiation that is hard for competitors to replicate.`,
  };

  let rawScore = 0;
  let hasValidAnswers = false;
  for (const [dimension, answer] of Object.entries(answersRecord)) {
    const weight = WEIGHTS[dimension] || 1.0;
    rawScore += answer * weight;
    hasValidAnswers = true;
  }

  if (!hasValidAnswers) {
    rawScore = 1.5 * MAX_RAW / 3.0;
  }

  const score = Math.max(10, Math.round((rawScore / MAX_RAW) * 100));

  let maturityLevel = 'Developing';
  if (score <= 39) maturityLevel = 'Initial';
  else if (score <= 59) maturityLevel = 'Developing';
  else if (score <= 74) maturityLevel = 'Defined';
  else if (score <= 89) maturityLevel = 'Managed';
  else maturityLevel = 'Optimizing';

  const categoryMap = {
    Initial: 'Foundational',
    Developing: 'Developing',
    Defined: 'Advancing',
    Managed: 'Leading',
    Optimizing: 'Leading'
  };
  const category = categoryMap[maturityLevel];

  const strengths = Object.entries(answersRecord)
    .filter(([_, answer]) => answer >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dimension]) => STRENGTH_LABELS[dimension] || dimension);

  const blockerEntries = Object.entries(answersRecord)
    .filter(([_, answer]) => answer <= 1)
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return (WEIGHTS[b[0]] || 1.0) - (WEIGHTS[a[0]] || 1.0);
    });

  const blockers = blockerEntries.slice(0, 3).map(([dimension]) => BLOCKER_LABELS[dimension] || dimension);
  const opportunities = blockerEntries
    .filter(([dimension]) => OPPORTUNITY_LABELS[dimension] !== undefined)
    .slice(0, 3)
    .map(([dimension]) => OPPORTUNITY_LABELS[dimension] || dimension);

  const topBlocker = blockers[0] || undefined;
  const categoryExplanation = NARRATIVE_TEMPLATES[maturityLevel](score, topBlocker);

  const insights = [];
  strengths.forEach(s => insights.push(`Strength: ${s}`));
  blockers.forEach(b => insights.push(`Gap: ${b}`));

  const recommendation = opportunities[0] || "Consolidate your business objective priorities and establish a structured AI roadmap.";

  return {
    score,
    category,
    category_explanation: categoryExplanation,
    insights,
    recommendation
  };
}

/**
 * Generate beautifully styled, dynamic HSL linear-gradient SVG circle badges
 */
function generatePremiumBadgeSvg(score, category) {
  let startColor = "#5b3cc4";
  let midColor = "#7c5dfa";
  let activeColor = "#0ae8af";
  
  if (score < 40) {
    startColor = "#ef4444";
    midColor = "#f97316";
    activeColor = "#f59e0b";
  } else if (score < 60) {
    startColor = "#3b82f6";
    midColor = "#2563eb";
    activeColor = "#60a5fa";
  } else if (score < 75) {
    startColor = "#6366f1";
    midColor = "#4f46e5";
    activeColor = "#818cf8";
  } else if (score < 90) {
    startColor = "#7c5dfa";
    midColor = "#5b3cc4";
    activeColor = "#0ae8af";
  } else {
    startColor = "#0ae8af";
    midColor = "#fbbf24";
    activeColor = "#fbbf24";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
    <defs>
      <radialGradient id="badge-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${startColor}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${startColor}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="badge-ring" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${startColor}"/>
        <stop offset="50%" stop-color="${midColor}"/>
        <stop offset="100%" stop-color="${activeColor}"/>
      </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="90" fill="url(#badge-glow)"/>
    <circle cx="100" cy="100" r="80" fill="#070708" stroke="url(#badge-ring)" stroke-width="4"/>
    <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1"/>
    <text x="100" y="70" text-anchor="middle" fill="rgba(255, 255, 255, 0.4)" font-family="'Inter Tight', system-ui" font-size="9" font-weight="600" letter-spacing="1.5">AIVORY READINESS</text>
    <text x="100" y="115" text-anchor="middle" fill="#ffffff" font-family="'Inter Tight', system-ui" font-size="40" font-weight="800">${score}%</text>
    <text x="100" y="145" text-anchor="middle" fill="${activeColor}" font-family="'Inter Tight', system-ui" font-size="10" font-weight="700" letter-spacing="0.5">${category.toUpperCase()}</text>
    <path d="M 85,155 L 115,155" stroke="rgba(10, 232, 175, 0.3)" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}


// Helper function to safely parse and normalize AI response
function parseAIResponse(content) {
  try {
    let parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.score !== undefined) {
      return parsed;
    }
  } catch (e) {}

  // Try regex extraction
  try {
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed && typeof parsed === 'object' && parsed.score !== undefined) {
        return parsed;
      }
    }
  } catch (e) {}

  return null;
}


// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vps-bridge-thin-proxy',
    timestamp: new Date().toISOString(),
    zeroclaw_url: ZEROCLAW_URL
  });
});

// ============================================================================
// PROXY HANDLERS
// ============================================================================

/**
 * Generic request forwarder with auth header injection
 */
function proxyRequest(req, res, next) {
  const targetUrl = new URL(req.path, ZEROCLAW_URL);
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      'X-Internal-Key': INTERNAL_KEY,
      'Content-Type': 'application/json',
      'host': targetUrl.host
    }
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;
  
  const proxyReq = transport.request(options, (proxyRes) => {
    // Copy headers from target response
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] error:', err.message);
    res.status(502).json({
      error: true,
      code: 'PROXY_ERROR',
      message: 'Failed to reach internal service',
      details: err.message
    });
  });

  // Forward request body
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  
  proxyReq.end();
}

/**
 * SSE stream proxy to Zeroclaw
 */
function proxyStream(req, res) {
  const targetUrl = new URL('/webhook', ZEROCLAW_URL);
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      ...req.headers,
      'X-Internal-Key': INTERNAL_KEY,
      'Content-Type': 'application/json',
      'host': targetUrl.host
    }
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;
  
  const proxyReq = transport.request(options, (proxyRes) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('X-Accel-Buffering', 'no');
    
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy stream] error:', err.message);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Proxy error' })}\n\n`);
    res.end();
  });

  // Forward request body
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  
  proxyReq.end();
}

/**
 * Handle streaming requests from Next.js
 * Forwards to Zeroclaw /webhook, parses SSE response, and emits proper SSE format
 */
function buildZeroclawWebhookBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  // Copilot workflow requests include routing context (mode, channel, entrypoint).
  // Preserve the full body so Zeroclaw gets proper routing and returns JSON.
  const hasCopilotContext = body.mode || body.channel || body.entrypoint || body.context;

  if (hasCopilotContext && typeof body.message === 'string' && body.message.trim()) {
    const outbound = { message: body.message };
    if (body.mode) outbound.mode = body.mode;
    if (body.channel) outbound.channel = body.channel;
    if (body.entrypoint) outbound.entrypoint = body.entrypoint;
    // Workflow routing: inject system_prompt for workflow_ entrypoints
    
  // Tool filtering per useCase
  const useCase = body.entrypoint ? body.entrypoint.replace('workflow_', 'workflow') : 'default';
  outbound.tools = getToolsForUseCase(useCase);
  
  if (body.entrypoint && body.entrypoint.startsWith('workflow_') && !outbound.system_prompt) {
      outbound.system_prompt = WORKFLOW_SYSTEM_PROMPT;
      outbound.hint = outbound.hint || 'workflow_copilot_premium';
    }
    if (body.context) outbound.context = body.context;
    if (body.history) outbound.history = body.history;
    if (body.session_id) outbound.session_id = body.session_id;
    if (body.organization_id) outbound.organization_id = body.organization_id;
    return outbound;
  }

  // Regular console chat - just extract the message
  if (typeof body.message === 'string' && body.message.trim()) {
    return { message: body.message };
  }

  if (Array.isArray(body.messages)) {
    const lastUserMessage = [...body.messages]
      .reverse()
      .find(message => message?.role === 'user' && typeof message.content === 'string' && message.content.trim());

    if (lastUserMessage) {
      return { message: lastUserMessage.content };
    }
  }

  if (typeof body.intent === 'string' && body.intent.trim()) {
    return { message: body.intent };
  }

  return body;
}

function handleStreamRequest(req, res) {
  const targetUrl = new URL('/webhook', ZEROCLAW_URL);
  const outboundBody = req.body && Object.keys(req.body).length > 0
    ? JSON.stringify(buildZeroclawWebhookBody(req.body))
    : '';
  const { host, 'content-length': _contentLength, ...forwardHeaders } = req.headers;
  
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      ...forwardHeaders,
      'X-Internal-Key': INTERNAL_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(outboundBody),
      'host': targetUrl.host
    }
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;
  
  const proxyReq = transport.request(options, (proxyRes) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('X-Accel-Buffering', 'no');
    
    let buffer = '';
    let rawResponse = '';
    let wroteChunk = false;
    
    proxyRes.on('data', (chunk) => {
      const text = chunk.toString();
      rawResponse += text;
      buffer += text;
      
      // Process SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // Extract content from Zeroclaw SSE format: choices[0].delta.content
            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
              const content = data.choices[0].delta.content;
              
              // Emit proper SSE format for Next.js
              res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
              wroteChunk = true;
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    });
    
    proxyRes.on('end', () => {
      if (!wroteChunk && rawResponse.trim()) {
        try {
          const data = JSON.parse(rawResponse);
          const content =
            data.response ||
            data.content ||
            data.message ||
            data.choices?.[0]?.message?.content ||
            data.choices?.[0]?.delta?.content;

          if (content) {
            res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
            wroteChunk = true;
          } else if (data.error) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: data.error })}\n\n`);
          }
        } catch (e) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: rawResponse })}\n\n`);
          wroteChunk = true;
        }
      }

      // Send done event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[handle stream request] error:', err.message);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Allow-Origin', CORS_ORIGIN);
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Proxy error' })}\n\n`);
    res.end();
  });

  // Forward request body
  if (outboundBody) {
    proxyReq.write(outboundBody);
  }
  
  proxyReq.end();
}

// ============================================================================
// ROUTES - Forward all requests to Zeroclaw
// ============================================================================

// Console streaming (SSE) - use handleStreamRequest for proper SSE parsing
app.post('/console/stream', handleStreamRequest);
app.post('/aria/stream', handleStreamRequest);
app.post('/blueprint/generate', handleStreamRequest);

// ============================================================================
// COPILOT WORKFLOW ENDPOINTS (non-streaming JSON response)
// ============================================================================
// These call Zeroclaw internally (via /webhook) but buffer the full response
// and return a single JSON body to the Next.js copilot route. This avoids the
// SSE parsing bug where JSON.parse(rawBody) fails on multi-event SSE text.
//
// Response shape: { workflow: { workflowName, steps, ... }, message?: string }
// ============================================================================

function handleWorkflowRequest(req, res, fallbackName) {
  const targetUrl = new URL('/webhook', ZEROCLAW_URL);
  const outboundBody = req.body && Object.keys(req.body).length > 0
    ? JSON.stringify(buildZeroclawWebhookBody(req.body))
    : '';
  const { host, 'content-length': _contentLength, ...forwardHeaders } = req.headers;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname,
    method: 'POST',
    headers: {
      ...forwardHeaders,
      'X-Internal-Key': INTERNAL_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(outboundBody),
      'host': targetUrl.host
    }
  };

  const transport = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = transport.request(options, (proxyRes) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    let buffer = '';
    let rawResponse = '';
    let bufferedText = '';
    let sseError = null;

    proxyRes.on('data', (chunk) => {
      const text = chunk.toString();
      rawResponse += text;
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            bufferedText += data.choices[0].delta.content;
          } else if (data.type === 'chunk' && typeof data.content === 'string') {
            bufferedText += data.content;
          } else if (data.type === 'error') {
            sseError = typeof data.error === 'string' ? data.error : (data.error && data.error.message) || 'Zeroclaw error';
          }
        } catch (e) {
          // Ignore non-JSON SSE lines
        }
      }
    });

    proxyRes.on('end', () => {
      // Fallback: if no SSE events parsed, try the raw response as JSON
      if (!bufferedText && rawResponse.trim()) {
        try {
          const data = JSON.parse(rawResponse);
          bufferedText =
            data.response ||
            data.content ||
            data.message ||
            (data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].delta?.content)) ||
            '';
          if (!bufferedText && data.error) {
            sseError = typeof data.error === 'string' ? data.error : data.error.message || 'Zeroclaw error';
          }
        } catch (e) {
          bufferedText = rawResponse;
        }
      }

      if (sseError) {
        res.status(502).json({ message: `Zeroclaw error: ${sseError}` });
        return;
      }

      // Try to parse bufferedText as JSON workflow
      const trimmed = (bufferedText || '').trim();
      let workflow = null;

      // Strategy 1: raw JSON
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.workflowName === 'string') {
              workflow = parsed;
            } else if (parsed.workflow && typeof parsed.workflow.workflowName === 'string') {
              workflow = parsed.workflow;
            }
          }
        } catch (e) { /* fall through */ }
      }

      // Strategy 2: fenced code block
      if (!workflow && trimmed) {
        const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence && fence[1]) {
          try {
            const parsed = JSON.parse(fence[1].trim());
            if (parsed && typeof parsed === 'object' && typeof parsed.workflowName === 'string') {
              workflow = parsed;
            }
          } catch (e) { /* fall through */ }
        }
      }

      // Strategy 3: embedded JSON substring
      if (!workflow && trimmed) {
        const start = trimmed.indexOf('{');
        if (start >= 0) {
          let depth = 0, inString = false, escape = false;
          for (let i = start; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth === 0) {
                const candidate = trimmed.slice(start, i + 1);
                try {
                  const parsed = JSON.parse(candidate);
                  if (parsed && typeof parsed === 'object' && typeof parsed.workflowName === 'string') {
                    workflow = parsed;
                  }
                } catch (e) { /* continue */ }
                break;
              }
            }
          }
        }
      }

      // Fallback: build placeholder
      if (!workflow) {
        workflow = {
          workflowName: fallbackName,
          steps: [],
          estimate_hours: 2,
          automation_score: 0.8,
          summary: trimmed || `${fallbackName} — no content returned`,
        };
      }

      console.log(`[workflow request] parsed workflow: "${workflow.workflowName}" with ${(workflow.steps || []).length} steps`);
      res.status(200).json({ workflow, message: trimmed });
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[handleWorkflowRequest] error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ message: `Proxy error: ${err.message}` });
    }
  });

  if (outboundBody) {
    proxyReq.write(outboundBody);
  }
  proxyReq.end();
}

app.post('/workflows/generate', (req, res) => handleWorkflowRequest(req, res, 'Generated Workflow'));
app.post('/workflows/repair',   (req, res) => handleWorkflowRequest(req, res, 'Repaired Workflow'));
app.post('/workflows/edit',     (req, res) => handleWorkflowRequest(req, res, 'Edited Workflow'));

// ============================================================================
// ENTITLEMENT & BILLING ENDPOINTS
// ============================================================================

/**
 * GET /api/entitlements/:userId — fetch user entitlements from Supabase
 */
app.get('/api/entitlements/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const entitlements = await supabaseDb.getUserEntitlements(userId);
    res.json({ userId, entitlements });
  } catch (err) {
    console.error('[entitlements] error:', err.message);
    res.status(500).json({ error: 'Failed to fetch entitlements', details: err.message });
  }
});

/**
 * POST /api/entitlements — upsert entitlement
 * Body: { userId, tier, features?, expiresAt? }
 */
app.post('/api/entitlements', async (req, res) => {
  try {
    const { userId, tier, features, expiresAt } = req.body;
    if (!userId || !tier) return res.status(400).json({ error: 'Missing userId or tier' });
    const result = await supabaseDb.upsertEntitlement({ userId, tier, features, expiresAt });
    res.json({ success: true, entitlement: result });
  } catch (err) {
    console.error('[entitlements upsert] error:', err.message);
    res.status(500).json({ error: 'Failed to upsert entitlement', details: err.message });
  }
});

/**
 * POST /stripe/webhook — handle Stripe webhook events
 * Verifies signature using STRIPE_WEBHOOK_SECRET
 */
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[stripe webhook] No STRIPE_WEBHOOK_SECRET configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  try {
    // Verify webhook signature
    const payload = req.body;
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Parse event
    const event = JSON.parse(payload);

    console.log(`[stripe webhook] Event: ${event.type}`);

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.client_reference_id;
      const tier = session.metadata?.tier || 'pro';

      if (userId) {
        await supabaseDb.upsertEntitlement({
          userId,
          tier,
          features: { source: 'stripe', sessionId: session.id },
          expiresAt: null
        });
        await supabaseDb.recordStripeEvent({
          eventId: event.id,
          eventType: event.type,
          userId,
          sessionId: session.id,
          amount: session.amount_total,
          currency: session.currency
        });
        console.log(`[stripe webhook] Activated ${tier} for user ${userId}`);
      }
    }

    // Handle customer.subscription.updated / deleted
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await supabaseDb.upsertEntitlement({
          userId,
          tier: 'free',
          features: { source: 'stripe', subscriptionId: sub.id },
          expiresAt: null
        });
        console.log(`[stripe webhook] Downgraded user ${userId} to free`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] error:', err.message);
    res.status(400).json({ error: 'Webhook processing failed', details: err.message });
  }
});

// ============================================================================
// DEEP DIAGNOSTIC ENDPOINT
// Handles POST /diagnostics/run directly via OpenRouter.
// NOTE: Zeroclaw is a binary daemon whose port 3010 serves a web dashboard,
// not an agent API. POST /diagnostics/run returns 405 from Zeroclaw because
// that path is its internal dashboard route. This handler intercepts the
// request before the catch-all proxy and calls OpenRouter directly.
// ============================================================================

const DIAGNOSTIC_SYSTEM_PROMPT = `You are an AI readiness diagnostic expert. Analyze the provided business diagnostic data and return a structured JSON assessment.

You MUST respond with ONLY a valid JSON object — no markdown, no code blocks, no commentary.

Return this EXACT JSON structure:
{
  "ai_readiness_score": <number 0-100>,
  "maturity_level": "<Foundational|Developing|Advancing|Leading>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "primary_constraints": ["<constraint 1>", "<constraint 2>", "<constraint 3>"],
  "automation_opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "narrative_summary": "<2-3 sentence summary of AI readiness>",
  "recommended_next_step": "<single most important next action>"
}

Base your assessment on the four diagnostic phases provided: business objectives & KPIs, data & process readiness, risk & constraints, and AI opportunity mapping.`;

app.post('/diagnostics/run', async (req, res) => {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    console.error('[diagnostics/run] OPENROUTER_API_KEY not set');
    return res.status(500).json({ error: true, message: 'OpenRouter API key not configured' });
  }

  const { mode, phases, diagnostic_payload } = req.body;

  if (mode !== 'deep') {
    return res.status(422).json({ error: true, message: 'Invalid mode: expected "deep"' });
  }

  const payload = phases || diagnostic_payload;
  if (!payload) {
    return res.status(400).json({ error: true, message: 'Missing required field: phases' });
  }

  console.log('[diagnostics/run] Starting deep diagnostic via OpenRouter');

  try {
    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aivory.app',
        'X-Title': 'Aivory'
      },
      body: JSON.stringify({
        model: process.env.DIAGNOSTIC_MODEL || 'qwen/qwen3-235b-a22b',
        messages: [
          { role: 'system', content: DIAGNOSTIC_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload, null, 2) }
        ],
        stream: false
      }),
      signal: AbortSignal.timeout(115_000)
    });

    if (!openrouterRes.ok) {
      const errText = await openrouterRes.text().catch(() => 'unknown error');
      console.error('[diagnostics/run] OpenRouter error:', openrouterRes.status, errText);
      return res.status(502).json({ error: true, message: 'AI engine returned an error. Please try again.' });
    }

    const openrouterData = await openrouterRes.json();
    const content = openrouterData?.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[diagnostics/run] Empty content from OpenRouter');
      return res.status(502).json({ error: true, message: 'AI engine returned empty response. Please try again.' });
    }

    // Extract JSON from the response (handle markdown code blocks if present)
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : null;
      if (!jsonStr) {
        console.error('[diagnostics/run] Could not extract JSON from response:', content.substring(0, 200));
        return res.status(502).json({ error: true, message: 'AI engine returned invalid JSON. Please try again.' });
      }
      try {
        result = JSON.parse(jsonStr);
      } catch (e2) {
        console.error('[diagnostics/run] JSON parse failed after extraction:', e2.message);
        return res.status(502).json({ error: true, message: 'AI engine returned malformed response. Please try again.' });
      }
    }

    // Normalize and ensure all required fields are present
    function ensureArray(value) {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    }

    const { v4: uuidv4 } = require('uuid');
    const diagnosticId = `DIAG_${uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase()}`;

    const normalizedResult = {
      ...result,
      diagnostic_id: diagnosticId,
      ai_readiness_score: result.ai_readiness_score || result.score || 0,
      score: result.ai_readiness_score || result.score || 0,
      maturity_level: result.maturity_level || 'Emerging',
      strengths: ensureArray(result.strengths),
      primary_constraints: ensureArray(result.primary_constraints),
      automation_opportunities: ensureArray(result.automation_opportunities),
      blockers: ensureArray(result.primary_constraints || result.blockers),
      opportunities: ensureArray(result.automation_opportunities || result.opportunities),
      narrative_summary: result.narrative_summary || result.narrative || '',
      recommended_next_step: result.recommended_next_step || ''
    };

    console.log('[diagnostics/run] Success, score:', normalizedResult.ai_readiness_score);
    res.json(normalizedResult);

  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.error('[diagnostics/run] OpenRouter timeout');
      return res.status(504).json({ error: true, message: 'Diagnostic timed out. Please try again.' });
    }
    console.error('[diagnostics/run] Unexpected error:', err.message);
    res.status(500).json({ error: true, message: 'Internal server error. Please try again.' });
  }
});

// Authentication requests handled at the top of the middleware stack

// All other requests - generic proxy
app.all('*', proxyRequest);

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({
    error: true,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    details: err.message
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ VPS Bridge Thin Proxy is running');
  console.log(`   Port: ${PORT}`);
  console.log(`   Host: 0.0.0.0`);
  console.log(`   Zeroclaw URL: ${ZEROCLAW_URL}`);
  console.log(`   CORS Origin: ${CORS_ORIGIN}`);
  console.log('');
  console.log('📡 Endpoints:');
  console.log('   GET  /health');
  console.log('   POST /console/stream (SSE → Zeroclaw)');
  console.log('   POST /aria/stream (SSE → Zeroclaw)');
  console.log('   POST /blueprint/generate (SSE → Zeroclaw)');
  console.log('   POST /diagnostics/run (OpenRouter direct)');
  console.log('   ALL  * (proxy → Zeroclaw)');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});
