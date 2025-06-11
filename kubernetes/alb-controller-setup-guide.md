# AWS Load Balancer Controller Setup Guide

This guide provides instructions for properly setting up the AWS Load Balancer Controller to automatically manage ALB target group IPs.

## 1. Fix the AWS Load Balancer Controller

The controller needs proper IAM permissions and service account configuration:

```bash
# Create IAM policy for the ALB controller
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

# Restart the controller to pick up the changes
kubectl rollout restart deployment aws-load-balancer-controller -n kube-system
```

## 2. Configure Your Deployment with Readiness Gates

Add readiness gate annotation to your deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway-registry-new
  namespace: mcp-gateway
spec:
  template:
    metadata:
      annotations:
        alb.ingress.kubernetes.io/pod-readiness-gate-inject: "true"
```

Apply with:
```bash
kubectl patch deployment mcp-gateway-registry-new -n mcp-gateway --patch-file patch-deployment.yaml
```

## 3. Create Ingress Resource for ALB

Create an ingress resource that will automatically manage target group registrations:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mcp-gateway-ingress
  namespace: mcp-gateway
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/healthcheck-path: /login
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/success-codes: "200,302,307,401,404,405"
    alb.ingress.kubernetes.io/target-group-attributes: deregistration_delay.timeout_seconds=30
spec:
  rules:
  - host: mcp-test.v2n2x.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: mcp-gateway-registry-new
            port:
              number: 80
```

## 4. Troubleshooting

If the controller is not automatically registering pod IPs, check:

1. Controller logs:
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

2. Service account permissions:
```bash
kubectl describe sa aws-load-balancer-controller -n kube-system
```

3. Webhook service endpoints:
```bash
kubectl get endpoints -n kube-system aws-load-balancer-webhook-service
```

4. Ingress events:
```bash
kubectl describe ingress mcp-gateway-ingress -n mcp-gateway
```

## 5. Verify Automatic IP Registration

When a pod is created or terminated, the ALB controller should automatically update the target group:

```bash
# Scale the deployment to trigger pod creation/termination
kubectl scale deployment mcp-gateway-registry-new -n mcp-gateway --replicas=3

# Check if new pod IP is registered in the ingress backend
kubectl describe ingress mcp-gateway-ingress -n mcp-gateway
```