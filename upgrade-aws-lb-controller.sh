#!/bin/bash

# Wait for the node group to be active
echo "Waiting for node group to be active..."
while true; do
  STATUS=$(aws eks describe-nodegroup --cluster-name mcp-gateway-eks-cluster --nodegroup-name alb-controller-ng --query 'nodegroup.status' --output text)
  echo "Current status: $STATUS"
  if [ "$STATUS" == "ACTIVE" ]; then
    break
  fi
  echo "Waiting for node group to be ready..."
  sleep 30
done

# Upgrade the AWS Load Balancer Controller
echo "Upgrading AWS Load Balancer Controller..."
helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=mcp-gateway-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set nodeSelector."eks\\.amazonaws\\.com/nodegroup"=alb-controller-ng \
  -n kube-system

# Wait for the controller to be ready
echo "Waiting for AWS Load Balancer Controller to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/aws-load-balancer-controller -n kube-system

# Check if the webhook configuration exists
echo "Checking webhook configuration..."
kubectl get mutatingwebhookconfiguration aws-load-balancer-webhook || echo "Webhook configuration not found"

# Reinstall the EKS add-ons
echo "Reinstalling EKS add-ons..."
aws eks delete-addon --cluster-name mcp-gateway-eks-cluster --addon-name prometheus-node-exporter
aws eks delete-addon --cluster-name mcp-gateway-eks-cluster --addon-name adot
aws eks delete-addon --cluster-name mcp-gateway-eks-cluster --addon-name amazon-cloudwatch-observability

echo "Waiting for add-ons to be deleted..."
sleep 30

aws eks create-addon --cluster-name mcp-gateway-eks-cluster --addon-name prometheus-node-exporter
aws eks create-addon --cluster-name mcp-gateway-eks-cluster --addon-name adot --service-account-role-arn arn:aws:iam::338293206254:role/eksctl-mcp-gateway-eks-cluster-addon-iamservi-Role1-LdWu6WSJHyBw
aws eks create-addon --cluster-name mcp-gateway-eks-cluster --addon-name amazon-cloudwatch-observability --service-account-role-arn arn:aws:iam::338293206254:role/eksctl-mcp-gateway-eks-cluster-addon-iamservi-Role1-LdWu6WSJHyBw

echo "Process completed!"
