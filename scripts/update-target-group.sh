#!/bin/bash
# Script to update ALB target group with new pod IPs

# Target Group ARN
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39"

# Get pod IPs
echo "Getting pod IPs for mcp-gateway-registry-new deployment..."
POD_IPS=$(kubectl get pods -n mcp-gateway -l app=mcp-gateway-registry-new -o jsonpath='{.items[*].status.podIP}')

if [ -z "$POD_IPS" ]; then
  echo "No pod IPs found for mcp-gateway-registry-new deployment"
  exit 1
fi

# Convert space-separated IPs to array
IPS=($POD_IPS)
echo "Found ${#IPS[@]} pod IPs: ${IPS[@]}"

# Deregister all current targets
echo "Deregistering existing targets..."
CURRENT_TARGETS=$(aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --query 'TargetHealthDescriptions[].Target.Id' --output text)
if [ -n "$CURRENT_TARGETS" ]; then
  for TARGET in $CURRENT_TARGETS; do
    echo "Deregistering target $TARGET..."
    aws elbv2 deregister-targets --target-group-arn $TARGET_GROUP_ARN --targets Id=$TARGET,Port=7860
  done
fi

# Register new targets
echo "Registering new targets..."
for IP in "${IPS[@]}"; do
  echo "Registering pod IP: $IP"
  aws elbv2 register-targets --target-group-arn $TARGET_GROUP_ARN --targets Id=$IP,Port=7860
done

# Check target health
echo "Checking target health..."
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

echo "Target group update complete!"