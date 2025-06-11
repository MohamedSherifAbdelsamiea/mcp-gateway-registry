#!/bin/bash

# Get the current EKS cluster name
CLUSTER_NAME=$(kubectl config view --minify -o jsonpath='{.clusters[0].name}' | cut -d'/' -f2)
echo "Cluster name: $CLUSTER_NAME"

# Check CloudWatch logs for EKS cluster
echo "Checking CloudWatch logs for EKS cluster..."
aws logs describe-log-streams --log-group-name "/aws/eks/$CLUSTER_NAME/cluster" --query "logStreams[*].logStreamName" | grep -i mcp-gateway

# Get the latest pod name
POD_NAME=$(kubectl get pods -n mcp-gateway -l app=mcp-gateway-registry | grep Running | head -1 | awk '{print $1}')
echo "Latest running pod: $POD_NAME"

# Get pod details
echo "Getting pod details..."
kubectl describe pod $POD_NAME -n mcp-gateway

# Create a script to check logs in AWS Console
echo ""
echo "===== INSTRUCTIONS TO VIEW LOGS ====="
echo "Since we can't directly access Fargate pod logs via kubectl, follow these steps:"
echo ""
echo "1. Open the AWS Console and navigate to CloudWatch"
echo "2. Go to Log groups"
echo "3. Look for the following log groups:"
echo "   - /aws/eks/$CLUSTER_NAME/cluster"
echo "   - /aws/eks/mcp-gateway-pods"
echo "   - /aws/fargate/eks/$CLUSTER_NAME"
echo "   - /aws/containerinsights/$CLUSTER_NAME/application"
echo ""
echo "4. If you don't see logs immediately, wait a few minutes for them to appear"
echo ""
echo "5. You can also check the Fargate profile configuration:"
echo "   aws eks describe-fargate-profile --cluster-name $CLUSTER_NAME --fargate-profile-name mcp-gateway-fargate"
echo ""
echo "6. To enable detailed logging for future deployments, add this annotation to your pod spec:"
echo "   annotations:"
echo "     eks.amazonaws.com/log-group-name: /aws/eks/mcp-gateway-pods"
echo "     eks.amazonaws.com/log-stream-prefix: fargate"
