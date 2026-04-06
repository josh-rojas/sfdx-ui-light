const { Readable } = require('node:stream');

/**
 * Allowed request headers
 */
const ALLOWED_HEADERS = [
    'Authorization',
    'Content-Type',
    'Salesforceproxy-Endpoint',
    'X-Authorization',
    'X-SFDC-Session',
    'SOAPAction',
    'Sforce-Auto-Assign',
    'Sforce-Call-Options',
    'Sforce-Query-Options',
    'x-sfdc-packageversion-clientPackage',
    'If-Modified-Since',
    'X-User-Agent',
];

// Production Salesforce domains
const SF_PROD_ENDPOINT_REGEXP =
    /^https:\/\/[a-zA-Z0-9.-]+\.(force|salesforce|cloudforce|database)\.com\//;
// Dev/orgfarm/my.salesforce-com.crm.dev style domains (with optional port)
// Also supports login.salesforce-com.<hash>.<region>.crm.dev(:<port>)/...
const SF_DEV_ENDPOINT_REGEXP =
    /^https:\/\/(?:[a-zA-Z0-9-]+\.)?(?:my|login)\.salesforce-com\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+\.crm\.dev(?::\d+)?/;

/**
 * Create middleware to proxy request to Salesforce server
 */
module.exports = function (options = {}) {
    return async (req, res) => {
        if (options.enableCORS) {
            res.set({
                'Access-Control-Allow-Origin': options.allowedOrigin || '*',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE',
                'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(','),
                'Access-Control-Expose-Headers': 'SForce-Limit-Info',
            });
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
        }
        const sfEndpoint = req.headers['salesforceproxy-endpoint'];
        if (!SF_PROD_ENDPOINT_REGEXP.test(sfEndpoint) && !SF_DEV_ENDPOINT_REGEXP.test(sfEndpoint)) {
            return res
                .status(400)
                .send(
                    `Proxying endpoint is not allowed. 'salesforceproxy-endpoint' header must be a valid Salesforce domain: ${sfEndpoint}`
                );
        }

        // Extract allowed headers from request
        const headers = ALLOWED_HEADERS.reduce((acc, header) => {
            const headerLower = header.toLowerCase();
            const value = req.headers[headerLower];
            if (value) {
                const name = headerLower === 'x-authorization' ? 'authorization' : headerLower;
                acc[name] = value;
            }
            return acc;
        }, {});

        // Build request body: re-serialize JSON bodies parsed by express middleware,
        // or collect raw bytes for XML/SOAP and other content types.
        let body;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            const contentType = (req.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json') && req.body !== undefined) {
                body = JSON.stringify(req.body);
            } else {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                if (chunks.length > 0) {
                    body = Buffer.concat(chunks);
                }
            }
        }

        const targetUrl = sfEndpoint || 'https://login.salesforce.com/services/oauth2/token';
        try {
            const response = await fetch(targetUrl, {
                method: req.method,
                headers,
                body,
            });

            res.status(response.status);
            // Forward the Salesforce API usage header when present
            const limitInfo = response.headers.get('sforce-limit-info');
            if (limitInfo) {
                res.set('SForce-Limit-Info', limitInfo);
            }
            if (response.body) {
                Readable.fromWeb(response.body).pipe(res);
            } else {
                res.end();
            }
        } catch (error) {
            res.status(500).send('An error occurred while proxying the request.');
        }
    };
};
