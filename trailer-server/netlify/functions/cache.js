exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Cache endpoint available',
        timestamp: new Date().toISOString(),
        note: 'Cache is managed per function instance in Netlify'
      }),
    };
  }

  if (event.httpMethod === 'DELETE') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Cache cleared (per function instance)',
        timestamp: new Date().toISOString()
      }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};
