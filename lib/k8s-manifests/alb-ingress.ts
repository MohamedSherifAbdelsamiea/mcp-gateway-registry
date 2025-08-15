import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface AlbIngressProps {
  cluster: eks.ICluster;
  namespace: string;
  domainName: string;
  certificateArn: string;
}

export class AlbIngress extends Construct {
  constructor(scope: Construct, id: string, props: AlbIngressProps) {
    super(scope, id);

    // ALB Ingress for Registry
    props.cluster.addManifest('RegistryIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'registry-ingress',
        namespace: props.namespace,
        labels: {
          app: 'registry',
          'managed-by': 'cdk'
        },
        annotations: {
          'kubernetes.io/ingress.class': 'alb',
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/certificate-arn': props.certificateArn,
          'alb.ingress.kubernetes.io/ssl-redirect': '443',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}, {"HTTPS": 443}]',
          'alb.ingress.kubernetes.io/healthcheck-path': '/health',
          'alb.ingress.kubernetes.io/healthcheck-interval-seconds': '30',
          'alb.ingress.kubernetes.io/healthcheck-timeout-seconds': '5',
          'alb.ingress.kubernetes.io/healthy-threshold-count': '2',
          'alb.ingress.kubernetes.io/unhealthy-threshold-count': '3',
          'alb.ingress.kubernetes.io/load-balancer-attributes': 'idle_timeout.timeout_seconds=60'
        }
      },
      spec: {
        rules: [{
          host: props.domainName,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'registry',
                    port: {
                      number: 7860
                    }
                  }
                }
              },
              {
                path: '/auth',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'auth-server',
                    port: {
                      number: 8888
                    }
                  }
                }
              },
              {
                path: '/mcp',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'mcpgw-server',
                    port: {
                      number: 8003
                    }
                  }
                }
              },
              {
                path: '/api/time',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'currenttime-server',
                    port: {
                      number: 8000
                    }
                  }
                }
              },
              {
                path: '/api/finance',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'fininfo-server',
                    port: {
                      number: 8001
                    }
                  }
                }
              },
              {
                path: '/api/tools',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'faketools-server',
                    port: {
                      number: 8002
                    }
                  }
                }
              }
            ]
          }
        }]
      }
    });
  }
}
