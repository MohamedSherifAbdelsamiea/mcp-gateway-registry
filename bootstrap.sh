#!/bin/bash
set -o xtrace
/etc/eks/bootstrap.sh mcp-gateway-eks-cluster --kubelet-extra-args '--node-labels=eks.amazonaws.com/nodegroup=alb-controller-ng'
