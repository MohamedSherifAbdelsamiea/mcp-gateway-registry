#!/bin/bash

# Get the security group ID
SG_ID=$(aws eks describe-cluster --name mcp-gateway-eks-cluster --query "cluster.resourcesVpcConfig.securityGroupIds[0]" --output text)
echo "Security group ID: $SG_ID"

# Add rule for port 10250 (kubelet)
echo "Adding rule for port 10250 (kubelet)..."
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 10250 \
  --cidr 0.0.0.0/0

# Add rule for port 53 (DNS)
echo "Adding rule for port 53 (DNS)..."
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 53 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol udp \
  --port 53 \
  --cidr 0.0.0.0/0

# Create a new node group
echo "Creating new node group..."
aws eks create-nodegroup \
  --cluster-name mcp-gateway-eks-cluster \
  --nodegroup-name mcp-gateway-nodes-v3 \
  --node-role arn:aws:iam::338293206254:role/EksNodeRole \
  --subnets subnet-031f6710f7f128203 subnet-022d1464b76cef18b \
  --instance-types t3.medium \
  --scaling-config minSize=2,maxSize=4,desiredSize=2

echo "Node group creation initiated. Check status with:"
echo "aws eks describe-nodegroup --cluster-name mcp-gateway-eks-cluster --nodegroup-name mcp-gateway-nodes-v3 --query 'nodegroup.status'"