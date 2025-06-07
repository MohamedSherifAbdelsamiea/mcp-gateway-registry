#!/bin/bash
# Fix mixed content issues in HTML templates

# Update template files to use protocol-relative URLs
find /Users/mdsherif/Dropbox/IoT\ Company\ \(Selective\ Sync\ Conflict\)/AI/Aegix\ AI\ MCP\ Firewall/SW/mcp-gateway-registry/registry/templates -type f -name "*.html" -exec sed -i '' 's|http://mcp-test.v2n2x.com|https://mcp-test.v2n2x.com|g' {} \;

# Alternative: Use protocol-relative URLs
# find /Users/mdsherif/Dropbox/IoT\ Company\ \(Selective\ Sync\ Conflict\)/AI/Aegix\ AI\ MCP\ Firewall/SW/mcp-gateway-registry/registry/templates -type f -name "*.html" -exec sed -i '' 's|http://mcp-test.v2n2x.com|//mcp-test.v2n2x.com|g' {} \;

echo "Fixed mixed content issues in HTML templates"
