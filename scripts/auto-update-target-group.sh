#!/bin/bash
# Script to automatically update ALB target group with new pod IPs

# Target Group ARN
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39"

# Get pod IPs
echo "Getting pod IPs for mcp-gateway-registry-new deployment..."
POD_IPS=$(kubectl get pods -n mcp-gateway -l app=mcp-gateway-registry -o jsonpath='{.items[*].status.podIP}')

if [ -z "$POD_IPS" ]; then
  echo "No pod IPs found for mcp-gateway-registry-new deployment"
  exit 1
fi

# Convert space-separated IPs to array
IPS=($POD_IPS)
echo "Found ${#IPS[@]} pod IPs: ${IPS[@]}"

# Get current targets
echo "Getting current targets..."
CURRENT_TARGETS=$(aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN --query 'TargetHealthDescriptions[?!contains(TargetHealth.State, `draining`)].Target.Id' --output text)
CURRENT_IPS=($CURRENT_TARGETS)
echo "Current targets: ${CURRENT_IPS[@]}"

# Find IPs to add (in POD_IPS but not in CURRENT_TARGETS)
TO_ADD=()
for ip in "${IPS[@]}"; do
  if [[ ! " ${CURRENT_IPS[@]} " =~ " ${ip} " ]]; then
    TO_ADD+=($ip)
  fi
done

# Find IPs to remove (in CURRENT_TARGETS but not in POD_IPS)
TO_REMOVE=()
for ip in "${CURRENT_IPS[@]}"; do
  if [[ ! " ${IPS[@]} " =~ " ${ip} " ]]; then
    TO_REMOVE+=($ip)
  fi
done

# Register new targets
if [ ${#TO_ADD[@]} -gt 0 ]; then
  echo "Registering new targets: ${TO_ADD[@]}"
  for ip in "${TO_ADD[@]}"; do
    aws elbv2 register-targets --target-group-arn $TARGET_GROUP_ARN --targets Id=$ip,Port=7860
  done
else
  echo "No new targets to register"
fi

# Deregister old targets
if [ ${#TO_REMOVE[@]} -gt 0 ]; then
  echo "Deregistering old targets: ${TO_REMOVE[@]}"
  for ip in "${TO_REMOVE[@]}"; do
    aws elbv2 deregister-targets --target-group-arn $TARGET_GROUP_ARN --targets Id=$ip,Port=7860
  done
else
  echo "No old targets to deregister"
fi

# Check target health
echo "Checking target health..."
aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

echo "Target group update complete!"