#!/bin/bash
# Script to check HTTPS compliance in MCP Gateway Registry

echo "=== MCP Gateway Registry HTTPS Compliance Check ==="

# Check for mixed content in HTML templates
echo "Checking for mixed content in HTML templates..."
MIXED_CONTENT=$(grep -r "http://" --include="*.html" ./registry/templates/ 2>/dev/null)

if [ -n "$MIXED_CONTENT" ]; then
  echo "❌ Mixed content found:"
  echo "$MIXED_CONTENT"
  echo ""
  echo "Fix with: find ./registry/templates -type f -name \"*.html\" -exec sed -i 's|http://|https://|g' {} \;"
else
  echo "✅ No mixed content found in HTML templates"
fi

# Check nginx configuration for HTTPS
echo ""
echo "Checking nginx configuration..."
if grep -q "listen 443 ssl" ./docker/nginx_rev_proxy.conf; then
  echo "✅ HTTPS listener configured in nginx"
else
  echo "❌ HTTPS listener not found in nginx configuration"
fi

# Check for HTTP to HTTPS redirection
if grep -q "return 301 https" ./docker/nginx_rev_proxy.conf; then
  echo "✅ HTTP to HTTPS redirection configured"
else
  echo "⚠️ HTTP to HTTPS redirection not explicitly configured"
fi

echo ""
echo "=== Recommendations ==="
echo "1. Ensure all resource URLs use HTTPS or protocol-relative URLs"
echo "2. Configure HTTP to HTTPS redirection if not already done"
echo "3. Set appropriate security headers (HSTS, CSP, etc.)"