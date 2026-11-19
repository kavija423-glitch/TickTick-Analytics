/**
 * Cloudflare Pages Function: /api/ticktick
 * Proxies authenticated GET requests to TickTick Open API v1
 * to bypass browser CORS restrictions while keeping tokens client-side.
 */

interface PagesContext {
  request: Request;
}

const TICKTICK_BASE = 'https://api.ticktick.com/open/v1';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export const onRequestOptions = async (): Promise<Response> => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const { request } = context;
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        error: 'Missing or invalid Authorization header. Expected: Bearer <token>',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      }
    );
  }

  const incomingUrl = new URL(request.url);
  const endpointParam = incomingUrl.searchParams.get('endpoint') || incomingUrl.searchParams.get('path');

  if (!endpointParam) {
    return new Response(
      JSON.stringify({
        error: 'Missing required "endpoint" query parameter (e.g. /focus or /project).',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      }
    );
  }

  const normalizedEndpoint = endpointParam.startsWith('/') ? endpointParam : `/${endpointParam}`;
  // Prevent SSRF or path traversal outside /open/v1
  if (normalizedEndpoint.includes('..') || normalizedEndpoint.startsWith('//')) {
    return new Response(
      JSON.stringify({ error: 'Invalid TickTick API endpoint path.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      }
    );
  }

  const targetUrl = new URL(`${TICKTICK_BASE}${normalizedEndpoint}`);

  // Forward all query parameters except 'endpoint' and 'path'
  incomingUrl.searchParams.forEach((value, key) => {
    if (key !== 'endpoint' && key !== 'path') {
      targetUrl.searchParams.set(key, value);
    }
  });

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    const bodyText = await upstream.text();
    const contentType = upstream.headers.get('Content-Type') || 'application/json';

    return new Response(bodyText, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach TickTick API';
    return new Response(
      JSON.stringify({ error: `Proxy network error: ${message}` }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      }
    );
  }
};
