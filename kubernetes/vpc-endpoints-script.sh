#!/bin/bash

# Get VPC ID
VPC_ID="vpc-002d11184d052b5ed"
SUBNET_IDS="subnet-05b991011b46dcebb subnet-0ceffc2d0c013cf1c"
REGION="us-east-1"

# Create security group for VPC endpoints
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
  --group-name eks-vpc-endpoint-sg \
  --description "Security group for EKS VPC endpoints" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

# Allow inbound HTTPS traffic
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 443 \
  --cidr 10.0.0.0/16

# Create VPC endpoints for AWS services needed by the AWS Load Balancer Controller
SERVICES=(
  "ec2"
  "elasticloadbalancing"
  "sts"
  "logs"
)

for SERVICE in "${SERVICES[@]}"; do
  echo "Creating VPC endpoint for $SERVICE..."
  aws ec2 create-vpc-endpoint \
    --vpc-id $VPC_ID \
    --service-name com.amazonaws.$REGION.$SERVICE \
    --vpc-endpoint-type Interface \
    --subnet-ids $SUBNET_IDS \
    --security-group-ids $SECURITY_GROUP_ID \
    --private-dns-enabled
done

echo "VPC endpoints created successfully!"