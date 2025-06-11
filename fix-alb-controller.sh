#!/bin/bash

# Check if node group is ready
echo "Checking if node group is ready..."
STATUS=$(aws eks describe-nodegroup --cluster-name mcp-gateway-eks-cluster --nodegroup-name alb-controller-ng --query 'nodegroup.status' --output text)

if [ "$STATUS" != "ACTIVE" ]; then
  echo "Node group is not active yet. Current status: $STATUS"
  echo "Please wait until the node group is ACTIVE and run this script again."
  exit 1
fi

echo "Node group is active. Proceeding with AWS Load Balancer Controller deployment."

# Patch the AWS Load Balancer Controller deployment to use the new node group
echo "Patching AWS Load Balancer Controller deployment..."
kubectl patch deployment aws-load-balancer-controller -n kube-system --type=json \
  -p='[{"op": "add", "path": "/spec/template/spec/nodeSelector", "value": {"eks.amazonaws.com/nodegroup": "alb-controller-ng"}}]'

# Reinstall the AWS Load Balancer Controller using Helm
echo "Reinstalling AWS Load Balancer Controller using Helm..."
helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=mcp-gateway-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  -n kube-system

# Verify the controller is running properly
echo "Verifying AWS Load Balancer Controller status..."
kubectl get pods -n kube-system | grep aws-load-balancer-controller

echo "Done!"