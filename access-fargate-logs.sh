#!/bin/bash

# Create the log group manually
echo "Creating CloudWatch log group for Fargate pods..."
aws logs create-log-group --log-group-name "/aws/eks/mcp-gateway-pods"

# Get the current cluster name
CLUSTER_NAME=$(kubectl config view --minify -o jsonpath='{.clusters[0].name}' | cut -d'/' -f2)
echo "Cluster name: $CLUSTER_NAME"

# Check for Fargate profile
echo "Checking Fargate profiles..."
FARGATE_PROFILES=$(aws eks list-fargate-profiles --cluster-name $CLUSTER_NAME --query "fargateProfileNames" --output text)
echo "Fargate profiles: $FARGATE_PROFILES"

# Create a Fluent Bit ConfigMap for CloudWatch logging
echo "Creating an updated Fluent Bit ConfigMap for CloudWatch logging..."
cat > fluent-bit-config.yaml << 'EOL'
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-logging
  namespace: mcp-gateway
data:
  flb_log_cw: "true"
  filters.conf: |
    [FILTER]
        Name kubernetes
        Match kube.*
        Merge_Log On
        Keep_Log Off
        K8S-Logging.Parser On
        K8S-Logging.Exclude Off
  output.conf: |
    [OUTPUT]
        Name cloudwatch_logs
        Match kube.*
        region us-east-1
        log_group_name /aws/eks/mcp-gateway-pods
        log_stream_prefix fargate-
        auto_create_group true
EOL

kubectl apply -f fluent-bit-config.yaml

echo "Restarting the deployment to apply logging changes..."
kubectl rollout restart deployment/mcp-gateway-registry-new -n mcp-gateway

echo "Waiting for pods to restart..."
sleep 10
kubectl get pods -n mcp-gateway -l app=mcp-gateway-registry

echo "Logs should now be sent to CloudWatch under /aws/eks/mcp-gateway-pods"
echo "You can view them in the AWS Console or use the following command after a few minutes:"
echo "aws logs get-log-events --log-group-name /aws/eks/mcp-gateway-pods --log-stream-name STREAM_NAME"

echo "To find available log streams, run:"
echo "aws logs describe-log-streams --log-group-name /aws/eks/mcp-gateway-pods --query \"logStreams[*].logStreamName\""
