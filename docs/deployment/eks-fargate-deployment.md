# MCP Gateway Registry Deployment on EKS Fargate

This document outlines the steps to deploy the MCP Gateway Registry on Amazon EKS with Fargate.

## Prerequisites

- AWS CLI configured with appropriate permissions
- kubectl installed and configured to work with your EKS cluster
- An EKS cluster with Fargate profiles

## Deployment Steps

### 1. Create Fargate Profile

```bash
# Create a Fargate profile for the mcp-gateway namespace
aws eks create-fargate-profile \
  --cluster-name mcp-gateway-eks-cluster \
  --fargate-profile-name mcp-gateway-fargate \
  --pod-execution-role-arn arn:aws:iam::338293206254:role/AmazonEKSFargatePodExecutionRole \
  --selectors namespace=mcp-gateway,labels={app=mcp-gateway-registry} \
  --subnets subnet-05b991011b46dcebb subnet-0ceffc2d0c013cf1c
```

### 2. Deploy the Application

```bash
# Create namespace
kubectl create namespace mcp-gateway

# Deploy the application
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway-registry
  namespace: mcp-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-gateway-registry
  template:
    metadata:
      labels:
        app: mcp-gateway-registry
      annotations:
        # Request more resources to avoid OOMKilled errors
        CapacityProvisioned: "1vCPU 2GB"
    spec:
      containers:
      - name: mcp-gateway-registry
        image: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:4e41864e857f572380f05aad51145dbf9ddf5a41
        ports:
        - containerPort: 7860
        env:
        - name: ADMIN_USER
          value: "admin"
        - name: ADMIN_PASSWORD
          value: "123"
EOF

# Create NodePort service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: mcp-gateway-registry
  namespace: mcp-gateway
spec:
  selector:
    app: mcp-gateway-registry
  ports:
  - port: 80
    targetPort: 7860
  type: NodePort
EOF
```

### 3. Set Up Application Load Balancer (ALB)

#### 3.1 Create ALB

1. Go to EC2 > Load Balancers > Create Load Balancer
2. Choose Application Load Balancer
3. Configure basic settings:
   - Name: mcp-gateway-alb
   - Scheme: internet-facing
   - IP address type: ipv4
   - VPC: vpc-002d11184d052b5ed
   - Mappings: Select public subnets

#### 3.2 Configure Security Groups

```bash
# Create security group for ALB
aws ec2 create-security-group \
  --group-name mcp-gateway-alb-sg \
  --description "Security group for MCP Gateway ALB" \
  --vpc-id vpc-002d11184d052b5ed

# Allow HTTP and HTTPS traffic
aws ec2 authorize-security-group-ingress \
  --group-id sg-087c93faf3acbcf13 \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-087c93faf3acbcf13 \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow traffic from ALB to EKS cluster
aws ec2 authorize-security-group-ingress \
  --group-id sg-0f31d4112628aa75e \
  --protocol tcp \
  --port 7860 \
  --source-group sg-087c93faf3acbcf13
```

#### 3.3 Configure Target Group

```bash
# Create target group
aws elbv2 create-target-group \
  --name mcp-gateway-tg \
  --protocol HTTP \
  --port 7860 \
  --vpc-id vpc-002d11184d052b5ed \
  --target-type ip \
  --health-check-path "/" \
  --health-check-protocol HTTP \
  --health-check-port 7860

# Register pod IPs as targets
aws elbv2 register-targets \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39 \
  --targets Id=10.0.4.46,Port=7860
```

#### 3.4 Configure Listeners

```bash
# Create HTTP listener
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:loadbalancer/app/mcp-gateway-alb/1589071366 \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39

# Create HTTPS listener (if certificate is available)
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:loadbalancer/app/mcp-gateway-alb/1589071366 \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:338293206254:certificate/your-certificate-id \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39
```

### 4. Configure DNS

Create a CNAME record in Route 53:
- Name: mcp-test.v2n2x.com
- Type: CNAME
- Value: mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com
- TTL: 300 seconds

## Troubleshooting

### Pod OOMKilled Errors

If pods are being terminated with OOMKilled errors, increase the memory allocation:

```bash
kubectl patch deployment mcp-gateway-registry -n mcp-gateway -p '{"spec":{"template":{"metadata":{"annotations":{"CapacityProvisioned":"1vCPU 2GB"}}}}}'
```

### ALB Target Health Issues

If targets are unhealthy:

1. Check security group rules to ensure ALB can reach the pods
2. Verify the application is running on the expected port
3. Adjust health check settings to be more lenient

```bash
aws elbv2 modify-target-group \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39 \
  --health-check-path "/" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### Alternative: Using NodePort with ALB

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