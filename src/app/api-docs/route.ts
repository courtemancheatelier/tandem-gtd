/**
 * GET /api-docs — Serves Scalar API documentation as raw HTML.
 *
 * Uses a route handler instead of a React page to avoid hydration
 * conflicts with the Scalar script tag.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Documentation — Tandem</title>
</head>
<body>
  <script
    id="api-reference"
    data-url="/openapi.json"
    data-configuration='${JSON.stringify({
      theme: "kepler",
      darkMode: true,
      metaData: { title: "Tandem API" },
      authentication: {
        preferredSecurityScheme: "BearerAuth",
        http: { bearer: { token: "" } },
      },
    })}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
