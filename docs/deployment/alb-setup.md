# Setting Up Application Load Balancer (ALB) for MCP Gateway Registry

This document provides detailed instructions for setting up an Application Load Balancer (ALB) to expose the MCP Gateway Registry service running on EKS Fargate.

## Prerequisites

- An EKS cluster with Fargate profiles
- MCP Gateway Registry deployed as a NodePort service
- AWS CLI configured with appropriate permissions

## Step 1: Create the Application Load Balancer

### Using AWS Console

1. Go to EC2 > Load Balancers > Create Load Balancer
2. Choose Application Load Balancer
3. Basic Configuration:
   - Name: mcp-gateway-alb
   - Scheme: internet-facing
   - IP address type: ipv4

4. Network Mapping:
   - VPC: vpc-002d11184d052b5ed
   - Mappings: Select public subnets in multiple availability zones

5. Security Groups:
   - Create a new security group or select an existing one
   - Name: mcp-gateway-alb-sg
   - Allow inbound traffic on ports 80 and 443

### Using AWS CLI

```bash
# Create security group for ALB
ALB_SG_ID=$(aws ec2 create-security-group \
  --group-name mcp-gateway-alb-sg \
  --description "Security group for MCP Gateway ALB" \
  --vpc-id vpc-002d11184d052b5ed \
  --query 'GroupId' \
  --output text)

# Allow HTTP and HTTPS traffic
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Create the ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name mcp-gateway-alb \
  --subnets subnet-022d1464b76cef18b subnet-031f6710f7f128203 \
  --security-groups $ALB_SG_ID \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)
```

## Step 2: Create Target Group

### Using AWS Console

1. Go to EC2 > Target Groups > Create Target Group
2. Basic Configuration:
   - Choose a target type: IP addresses
   - Target group name: mcp-gateway-tg
   - Protocol: HTTP
   - Port: 7860
   - VPC: vpc-002d11184d052b5ed

3. Health Check Settings:
   - Health check protocol: HTTP
   - Health check path: /
   - Advanced health check settings:
     - Port: 7860
     - Healthy threshold: 2
     - Unhealthy threshold: 3
     - Timeout: 10 seconds
     - Interval: 30 seconds

4. Register Targets:
   - Add the pod IPs: 10.0.3.136, 10.0.4.46, 10.0.3.104
   - Port: 7860
   - Include as pending below
   - Register pending targets

### Using AWS CLI

```bash
# Create target group
TG_ARN=$(aws elbv2 create-target-group \
  --name mcp-gateway-tg \
  --protocol HTTP \
  --port 7860 \
  --vpc-id vpc-002d11184d052b5ed \
  --target-type ip \
  --health-check-path "/" \
  --health-check-protocol HTTP \
  --health-check-port 7860 \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Register targets
aws elbv2 register-targets \
  --target-group-arn $TG_ARN \
  --targets Id=10.0.4.46,Port=7860
```

## Step 3: Configure Listeners

### Using AWS Console

1. Go back to your ALB
2. Add Listener:
   - Protocol: HTTP
   - Port: 80
   - Default action: Forward to target group mcp-gateway-tg

3. Add another Listener:
   - Protocol: HTTPS
   - Port: 443
   - Default action: Forward to target group mcp-gateway-tg
   - Secure listener settings:
     - Select your ACM certificate

### Using AWS CLI

```bash
# Create HTTP listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Create HTTPS listener (if certificate is available)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:us-east-1:338293206254:certificate/your-certificate-id \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

## Step 4: Configure Security Group Rules

Allow traffic from the ALB security group to the EKS cluster security group:

```bash
# Allow traffic from ALB to EKS cluster
aws ec2 authorize-security-group-ingress \
  --group-id sg-0f31d4112628aa75e \
  --protocol tcp \
  --port 7860 \
  --source-group $ALB_SG_ID

# Also allow traffic to default security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-03b4feeb0452f42bf \
  --protocol tcp \
  --port 7860 \
  --source-group $ALB_SG_ID
```

## Step 5: Configure SSL Certificate

### Using AWS Certificate Manager (ACM)

1. Go to AWS Certificate Manager > Request a certificate
2. Request a public certificate
3. Add domain names:
   - mcp-test.v2n2x.com
4. Choose DNS validation
5. Request the certificate
6. Create the validation CNAME records in Route 53
7. Wait for validation to complete

## Step 6: Configure DNS

Create a CNAME record in Route 53:

1. Go to Route 53 > Hosted zones > Your domain
2. Create record:
   - Record name: mcp-test
   - Record type: CNAME
   - Value: mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com
   - TTL: 300 seconds
   - Click Create records

## Troubleshooting

### Target Health Issues

If targets show as unhealthy:

1. Check security group rules
2. Verify the application is running on port 7860
3. Check if the health check path is correct
4. Adjust health check settings to be more lenient

### SSL Certificate Issues

If the certificate validation is taking too long:

1. Verify the CNAME records are correctly created
2. Try requesting a new certificate

### Connection Issues

If you can't connect to the ALB:

1. Check if the ALB security group allows inbound traffic
2. Verify the DNS record is correctly pointing to the ALB
3. Check if the targets are healthy