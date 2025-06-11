#!/bin/bash

# Set webhook configurations to use failurePolicy: Ignore
echo "Creating webhook configurations with failurePolicy: Ignore"
cat <<EOF | kubectl apply -f -
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: aws-load-balancer-webhook
  annotations:
    cert-manager.io/inject-ca-from: kube-system/aws-load-balancer-serving-cert
spec:
  webhooks:
  - name: validate.ingress.v1.k8s.aws
    failurePolicy: Ignore
    sideEffects: None
    clientConfig:
      service:
        name: aws-load-balancer-webhook-service
        namespace: kube-system
        path: /validate-ingress-v1-k8s-aws
    rules:
    - apiGroups:
      - networking.k8s.io
      apiVersions:
      - v1
      operations:
      - CREATE
      - UPDATE
      resources:
      - ingresses
    admissionReviewVersions: ["v1"]
  - name: validate.targetgroupbinding.elbv2.k8s.aws
    failurePolicy: Ignore
    sideEffects: None
    clientConfig:
      service:
        name: aws-load-balancer-webhook-service
        namespace: kube-system
        path: /validate-elbv2-k8s-aws-targetgroupbinding
    rules:
    - apiGroups:
      - elbv2.k8s.aws
      apiVersions:
      - v1beta1
      operations:
      - CREATE
      - UPDATE
      resources:
      - targetgroupbindings
    admissionReviewVersions: ["v1"]
---
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: aws-load-balancer-webhook
  annotations:
    cert-manager.io/inject-ca-from: kube-system/aws-load-balancer-serving-cert
spec:
  webhooks:
  - name: mutate.ingress.v1.k8s.aws
    failurePolicy: Ignore
    sideEffects: None
    clientConfig:
      service:
        name: aws-load-balancer-webhook-service
        namespace: kube-system
        path: /mutate-ingress-v1-k8s-aws
    rules:
    - apiGroups:
      - networking.k8s.io
      apiVersions:
      - v1
      operations:
      - CREATE
      - UPDATE
      resources:
      - ingresses
    admissionReviewVersions: ["v1"]
  - name: mutate.service.v1.k8s.aws
    failurePolicy: Ignore
    sideEffects: None
    clientConfig:
      service:
        name: aws-load-balancer-webhook-service
        namespace: kube-system
        path: /mutate-v1-service
    rules:
    - apiGroups:
      - ""
      apiVersions:
      - v1
      operations:
      - CREATE
      - UPDATE
      resources:
      - services
    admissionReviewVersions: ["v1"]
EOF

echo "Webhook configurations updated to use failurePolicy: Ignore"
echo "This will allow other operations to proceed while the AWS Load Balancer Controller is not functioning"
echo ""
echo "Next steps:"
echo "1. Create a Fargate profile specifically for the AWS Load Balancer Controller:"
echo "   aws eks create-fargate-profile \\"
echo "     --cluster-name mcp-gateway-eks-cluster \\"
echo "     --fargate-profile-name alb-controller-profile \\"
echo "     --selectors namespace=kube-system,labels={app.kubernetes.io/name=aws-load-balancer-controller} \\"
echo "     --subnets subnet-031f6710f7f128203 subnet-022d1464b76cef18b"
echo ""
echo "2. After creating the Fargate profile, reinstall the AWS Load Balancer Controller:"
echo "   helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \\"
echo "     --set clusterName=mcp-gateway-eks-cluster \\"
echo "     --set serviceAccount.create=false \\"
echo "     --set serviceAccount.name=aws-load-balancer-controller \\"
echo "     -n kube-system"
echo ""
echo "3. Verify the controller is running properly:"
echo "   kubectl get pods -n kube-system | grep aws-load-balancer-controller"