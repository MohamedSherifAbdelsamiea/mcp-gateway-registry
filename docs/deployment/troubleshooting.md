# Troubleshooting MCP Gateway Registry on EKS Fargate

This document provides solutions for common issues encountered when deploying MCP Gateway Registry on EKS Fargate.

## Pod Issues

### OOMKilled Errors

**Symptom**: Pods are being terminated with `OOMKilled` error (Exit Code 137)

**Solution**: Increase memory allocation for Fargate pods

```bash
# Update deployment with more resources
kubectl patch deployment mcp-gateway-registry -n mcp-gateway -p '{"spec":{"template":{"metadata":{"annotations":{"CapacityProvisioned":"1vCPU 2GB"}}}}}'
```

### InvalidImageName Errors

**Symptom**: Pods show `InvalidImageName` status

**Solution**: Fix the image name in the deployment

```bash
# Check the current image
kubectl describe pod -n mcp-gateway <pod-name>

# Update with correct image
kubectl set image deployment/mcp-gateway-registry -n mcp-gateway \
  mcp-gateway-registry=338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:4e41864e857f572380f05aad51145dbf9ddf5a41
```

### ImagePullBackOff Errors

**Symptom**: Pods show `ImagePullBackOff` status

**Solution**: Ensure the image exists and is accessible

```bash
# Check if image exists in ECR
aws ecr describe-images --repository-name mcp-gateway-registry --region us-east-1

# Tag an existing image with "latest" if needed
aws ecr batch-get-image --repository-name mcp-gateway-registry --image-ids imageTag=4e41864e857f572380f05aad51145dbf9ddf5a41 --region us-east-1 --query 'images[].imageManifest' --output text | aws ecr put-image --repository-name mcp-gateway-registry --image-tag latest --region us-east-1 --image-manifest -
```

## Networking Issues

### Cannot Access Pods from ALB

**Symptom**: ALB health checks fail with "Target.Timeout"

**Solution**: Check security group rules and network connectivity

```bash
# Allow traffic from ALB security group to EKS cluster security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-0f31d4112628aa75e \
  --protocol tcp \
  --port 7860 \
  --source-group sg-087c93faf3acbcf13

# Also allow traffic to default security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-03b4feeb0452f42bf \
  --protocol tcp \
  --port 7860 \
  --source-group sg-087c93faf3acbcf13
```

### Cannot Execute Commands in Fargate Pods

**Symptom**: Commands like `kubectl exec` or `kubectl logs` fail with "no preferred addresses found"

**Solution**: This is expected behavior with Fargate. Use port-forwarding instead:

```bash
kubectl port-forward -n mcp-gateway <pod-name> 7860:7860
```

Then access the application at http://localhost:7860

## ALB Issues

### Unhealthy Targets

**Symptom**: Targets remain unhealthy in ALB target group

**Solution**: Modify health check settings to be more lenient

```bash
aws elbv2 modify-target-group \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39 \
  --health-check-path "/" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### Alternative: Use NodePort with ALB

If direct pod IP targeting doesn't work, try using NodePort:

```bash
# Create a target group for NodePort
aws elbv2 create-target-group \
  --name mcp-gateway-np-tg \
  --protocol HTTP \
  --port 31975 \
  --vpc-id vpc-002d11184d052b5ed \
  --target-type ip \
  --health-check-path "/" \
  --health-check-protocol HTTP \
  --health-check-port 31975
```

## AWS Load Balancer Controller Issues

### Webhook Errors

**Symptom**: Error when creating Ingress: "failed calling webhook"

**Solution**: The AWS Load Balancer Controller is not running properly. Check its status:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

If pods are pending, add Fargate toleration:

```bash
kubectl patch deployment -n kube-system aws-load-balancer-controller -p '{"spec":{"template":{"spec":{"tolerations":[{"key":"eks.amazonaws.com/compute-type","operator":"Equal","value":"fargate","effect":"NoSchedule"}]}}}}'
```

### NoCredentialProviders Error

**Symptom**: "NoCredentialProviders: no valid providers in chain" error in events

**Solution**: Set up proper IAM roles and service accounts:

```bash
# Create IAM policy
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# Create service account with IAM role
eksctl create iamserviceaccount \
    --cluster=mcp-gateway-eks-cluster \
    --namespace=kube-system \
    --name=aws-load-balancer-controller \
    --attach-policy-arn=arn:aws:iam::338293206254:policy/AWSLoadBalancerControllerIAMPolicy \
    --override-existing-serviceaccounts \
    --approve
```

## DNS Issues

### Cannot Resolve Domain Name

**Symptom**: `curl: (6) Could not resolve host: mcp-test.v2n2x.com`

**Solution**: Check DNS configuration and wait for propagation

1. Verify the CNAME record is correctly created in Route 53
2. Try accessing the ALB directly using its DNS name
3. Wait for DNS propagation (can take up to 24 hours)

## Certificate Issues

### Certificate Validation Fails

**Symptom**: Certificate remains in "Pending validation" state

**Solution**: Check validation CNAME records

1. Verify the CNAME records are correctly created in Route 53
2. Ensure the record name and value exactly match what ACM provides
3. Wait for validation to complete (can take several hours)