# MCP Gateway Registry Security Guidelines

## HTTPS Configuration

### Requirements

1. **HTTPS Only**: All production deployments must use HTTPS exclusively.
2. **No Mixed Content**: All resources (CSS, JS, images) must be served over HTTPS.
3. **HTTP to HTTPS Redirection**: Configure automatic redirection from HTTP to HTTPS.

### Implementation

- Use AWS ACM certificates for ALB HTTPS termination
- Ensure all resource URLs in HTML templates use HTTPS protocol
- Configure proper security headers

## Common Issues

### Mixed Content Warnings

Mixed content occurs when initial HTML is loaded over HTTPS, but other resources (like images or stylesheets) are loaded over HTTP. This causes browsers to block content or show security warnings.

**Prevention:**
- Always use HTTPS URLs or protocol-relative URLs (`//domain.com/resource`)
- Run the following check before deployment:

```bash
# Check for HTTP URLs in HTML templates
grep -r "http://" --include="*.html" ./registry/templates/
```

**Fix:**
```bash
# Replace HTTP with HTTPS in all HTML templates
find ./registry/templates -type f -name "*.html" -exec sed -i 's|http://mcp-test.v2n2x.com|https://mcp-test.v2n2x.com|g' {} \;
```

## SSL/TLS Configuration

- Minimum TLS version: TLS 1.2
- Recommended cipher suites: 
  ```
  ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305
  ```
- Certificate renewal: Set up automatic renewal for SSL certificates