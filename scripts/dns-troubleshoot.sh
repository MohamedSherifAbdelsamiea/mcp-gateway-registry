#!/bin/bash
# DNS Troubleshooting Script for MCP Gateway Registry

echo "=== MCP Gateway Registry DNS Troubleshooting ==="
echo "Checking DNS resolution for mcp-test.v2n2x.com..."

# Check if host command is available
if command -v host &> /dev/null; then
    echo "Using host command:"
    host mcp-test.v2n2x.com
    echo ""
fi

# Check if dig command is available
if command -v dig &> /dev/null; then
    echo "Using dig command:"
    dig mcp-test.v2n2x.com
    echo ""
fi

# Check if nslookup command is available
if command -v nslookup &> /dev/null; then
    echo "Using nslookup command:"
    nslookup mcp-test.v2n2x.com
    echo ""
fi

# Check connectivity to ALB
echo "Checking connectivity to ALB..."
ALB_DNS="mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com"
curl -I -s -m 5 http://$ALB_DNS/login
echo ""

# Check Route53 record
echo "Checking Route53 record (requires AWS CLI and permissions)..."
if command -v aws &> /dev/null; then
    # Get the hosted zone ID (this is a simplified example)
    ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='v2n2x.com.'].Id" --output text)
    
    if [ -n "$ZONE_ID" ]; then
        echo "Found hosted zone: $ZONE_ID"
        aws route53 list-resource-record-sets --hosted-zone-id $ZONE_ID --query "ResourceRecordSets[?Name=='mcp-test.v2n2x.com.']"
    else
        echo "Could not find hosted zone for v2n2x.com"
    fi
else
    echo "AWS CLI not available. Skipping Route53 check."
fi

echo ""
echo "=== Connectivity Test ==="
echo "Testing connectivity to mcp-test.v2n2x.com..."
curl -I -s -m 5 https://mcp-test.v2n2x.com/login

echo ""
echo "=== Troubleshooting Recommendations ==="
echo "1. Verify the CNAME record exists in Route53"
echo "2. Check if the ALB is healthy and accepting traffic"
echo "3. Ensure security groups allow traffic on ports 80/443"
echo "4. Verify the target group has healthy targets"
echo "5. Check if the SSL certificate is valid for the domain"