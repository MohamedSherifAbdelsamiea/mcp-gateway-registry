# MCP Gateway Registry Troubleshooting Guide

## Common Issues and Solutions

### 1. OOMKilled Errors

**Symptoms:**
- Pods are frequently restarting
- Pod status shows "OOMKilled" in the container status
- High restart count on pods

**Diagnosis:**
```bash
# Check if pods are being OOMKilled
kubectl get pods -n mcp-gateway -o json | grep -A 3 "OOMKilled"

# Check pod resource usage
kubectl top pods -n mcp-gateway
```

**Solution:**
- Increase memory allocation in the deployment:
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "0.5"
  limits:
    memory: "2Gi"
    cpu: "1"
```

### 2. ALB Health Check Failures

**Symptoms:**
- ALB shows targets as unhealthy
- 502 Bad Gateway errors when accessing the application
- Target health status shows "Target.FailedHealthChecks" or "Target.Timeout"

**Diagnosis:**
```bash
# Check target health
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39

# Check if pods are responding on the health check port
curl -I http://<pod-ip>:7860/login
```

**Solution:**
- Adjust health check settings to match application behavior:
```bash
aws elbv2 modify-target-group \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39 \
  --health-check-path "/login" \
  --matcher '{"HttpCode": "200,302,307,401,404,405"}'
```

### 3. DNS Resolution Issues

**Symptoms:**
- Unable to resolve domain name
- "This site can't be reached" errors in browser
- DNS lookup returns NXDOMAIN

**Diagnosis:**
```bash
# Check if DNS record exists
dig mcp-test.v2n2x.com

# Check DNS propagation
dig mcp-test.v2n2x.com +trace
```

**Solution:**
- Create or update the DNS record:
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z00677396IM7D3SZ8WND \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "mcp-test.v2n2x.com.",
          "Type": "CNAME",
          "TTL": 300,
          "ResourceRecords": [
            {
              "Value": "mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com"
            }
          ]
        }
      }
    ]
  }' \
  --profile personal
```

### 4. Security Group Issues

**Symptoms:**
- Connection timeouts
- ALB health checks failing with "Target.Timeout"
- Unable to connect to pods from ALB

**Diagnosis:**
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids sg-0f31d4112628aa75e sg-087c93faf3acbcf13
```

**Solution:**
- Ensure ALB security group can access EKS cluster security group on port 7860:
```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-0f31d4112628aa75e \
  --protocol tcp \
  --port 7860 \
  --source-group sg-087c93faf3acbcf13
```

### 5. Mixed Content Warnings

**Symptoms:**
- Browser console shows mixed content warnings
- Some resources fail to load
- Broken images or styles

**Diagnosis:**
- Check the HTML source for http:// URLs instead of https://

**Solution:**
- Update application code to use relative URLs or https:// URLs
- Add Content-Security-Policy headers
- Configure ALB to redirect HTTP to HTTPS

## Monitoring Commands

### Pod Status
```bash
# Get pod status
kubectl get pods -n mcp-gateway -o wide

# Get pod details
kubectl describe pod -n mcp-gateway <pod-name>

# Check pod logs
kubectl logs -n mcp-gateway <pod-name>
```

### Network Connectivity
```bash
# Test connectivity to pods
curl -I http://<pod-ip>:7860

# Test ALB connectivity
curl -I https://mcp-test.v2n2x.com

# Test authenticated access
curl -u admin:123 https://mcp-test.v2n2x.com/api/server_details/all
```

### ALB and Target Group
```bash
# Check ALB status
aws elbv2 describe-load-balancers --query 'LoadBalancers[?contains(LoadBalancerName, `mcp-gateway`)]'

# Check target group health
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39
```

### DNS
```bash
# Check DNS resolution
dig mcp-test.v2n2x.com

# Check DNS propagation
dig mcp-test.v2n2x.com +trace

# Check DNS record in Route 53
aws route53 list-resource-record-sets --hosted-zone-id Z00677396IM7D3SZ8WND --query "ResourceRecordSets[?Name=='mcp-test.v2n2x.com.']" --profile personal
```