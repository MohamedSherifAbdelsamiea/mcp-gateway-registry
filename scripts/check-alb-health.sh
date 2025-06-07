#!/bin/bash
# Script to check ALB and target group health

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

echo "=== MCP Gateway ALB Health Check ==="

# ALB Target Group ARN
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39"

# Check target health
echo "Checking target health..."
aws elbv2 describe-target-health \
  --target-group-arn $TARGET_GROUP_ARN \
  --output table

# Get ALB info
echo ""
echo "Checking ALB status..."
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?DNSName=='mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com'].LoadBalancerArn" \
  --output text)

if [ -n "$ALB_ARN" ]; then
    aws elbv2 describe-load-balancers \
      --load-balancer-arns $ALB_ARN \
      --query "LoadBalancers[0].State" \
      --output table
    
    echo ""
    echo "Checking ALB listeners..."
    aws elbv2 describe-listeners \
      --load-balancer-arn $ALB_ARN \
      --query "Listeners[].{Port:Port,Protocol:Protocol,DefaultActions:DefaultActions[0].Type}" \
      --output table
else
    echo "Could not find ALB with DNS name: mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com"
fi

# Check security groups
echo ""
echo "Checking security group rules..."
SG_ID="sg-087c93faf3acbcf13"
aws ec2 describe-security-groups \
  --group-ids $SG_ID \
  --query "SecurityGroups[0].IpPermissions[?ToPort==\`443\` || ToPort==\`80\`]" \
  --output table

echo ""
echo "=== Connectivity Test ==="
echo "Testing connectivity to ALB..."
curl -I -s -m 5 http://mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com/login

echo ""
echo "=== Troubleshooting Recommendations ==="
echo "1. If targets are unhealthy, check the pod logs and events"
echo "2. If security group is missing rules, add inbound rules for ports 80/443"
echo "3. If ALB is not active, check AWS console for more details"
echo "4. Verify the target group health check settings are correct"