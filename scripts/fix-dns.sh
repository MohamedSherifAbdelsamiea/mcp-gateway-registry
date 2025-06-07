#!/bin/bash
# Script to fix DNS resolution for mcp-test.v2n2x.com

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if jq is installed (for JSON processing)
if ! command -v jq &> /dev/null; then
    echo "jq is not installed. It's recommended for JSON processing."
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
fi

echo "=== MCP Gateway Registry DNS Fix ==="

# Get the hosted zone ID for v2n2x.com
echo "Finding hosted zone ID for v2n2x.com..."
ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='v2n2x.com.'].Id" --output text)

if [ -z "$ZONE_ID" ]; then
    echo "Error: Could not find hosted zone for v2n2x.com"
    echo "Please check if the domain exists in your AWS account and you have proper permissions."
    exit 1
fi

echo "Found hosted zone: $ZONE_ID"

# Check if the record already exists
echo "Checking if CNAME record already exists..."
RECORD_EXISTS=$(aws route53 list-resource-record-sets --hosted-zone-id $ZONE_ID --query "ResourceRecordSets[?Name=='mcp-test.v2n2x.com.']" --output text)

# Create or update the CNAME record
echo "Creating/updating CNAME record for mcp-test.v2n2x.com..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "mcp-test.v2n2x.com",
          "Type": "CNAME",
          "TTL": 300,
          "ResourceRecords": [
            {
              "Value": "mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com"
            }
          ]
        }
      }
    ]
  }'

# Check the result
if [ $? -eq 0 ]; then
    echo "DNS record created/updated successfully!"
    echo "Note: DNS changes may take some time to propagate (up to 300 seconds based on TTL)"
    
    echo "Verifying ALB health..."
    aws elbv2 describe-target-health \
      --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39 \
      --query "TargetHealthDescriptions[].TargetHealth.State" \
      --output table
else
    echo "Error: Failed to update DNS record"
    echo "Please check your AWS permissions and try again"
fi

echo ""
echo "=== Next Steps ==="
echo "1. Wait for DNS propagation (may take a few minutes)"
echo "2. Test connectivity: curl -I https://mcp-test.v2n2x.com/login"
echo "3. If still not working, check ALB and target group health"