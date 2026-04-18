/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 *
 * GET /.well-known/oauth-protected-resource
 * GET /.well-known/oauth-protected-resource/api/mcp
 *
 * Required by MCP spec — clients use this to discover the authorization server.
 * Optional catch-all handles both the root and path-based variants.
 */

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:2000";

  const metadata = {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:full"],
    bearer_methods_supported: ["header"],
    resource_name: "Tandem GTD MCP Server",
  };

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
