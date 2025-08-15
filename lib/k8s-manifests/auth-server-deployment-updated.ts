import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

export interface AuthServerDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  adminUser: string;
  adminPassword: string;
  secretKey: string;
  registryUrl: string;
  authServerExternalUrl: string;
  cognitoClientId: string;
  cognitoClientSecret: string;
  cognitoUserPoolId: string;
  awsRegion: string;
}

export class AuthServerDeployment extends Construct {
  constructor(scope: Construct, id: string, props: AuthServerDeploymentProps) {
    super(scope, id);

    // Create auth-server deployment matching reference auth-server.yaml
    const deployment = props.cluster.addManifest('AuthServerDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'auth-server',
        namespace: props.namespace,
        labels: {
          app: 'auth-server'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'auth-server'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'auth-server'
            }
          },
          spec: {
            containers: [{
              name: 'auth-server',
              image: 'python:3.12', // Match reference
              ports: [{
                name: 'auth',
                containerPort: 8888
              }],
              env: [
                { name: 'HOME', value: '/app' },
                { name: 'PYTHONUNBUFFERED', value: '1' },
                { name: 'REGISTRY_URL', value: props.registryUrl },
                { name: 'SECRET_KEY', value: props.secretKey },
                { name: 'ADMIN_USER', value: props.adminUser },
                { name: 'ADMIN_PASSWORD', value: props.adminPassword },
                { name: 'AUTH_SERVER_EXTERNAL_URL', value: props.authServerExternalUrl },
                { name: 'COGNITO_CLIENT_ID', value: props.cognitoClientId },
                { name: 'COGNITO_CLIENT_SECRET', value: props.cognitoClientSecret },
                { name: 'COGNITO_USER_POOL_ID', value: props.cognitoUserPoolId },
                { name: 'AWS_REGION', value: props.awsRegion }
              ],
              command: ['/bin/bash'],
              args: ['-c', `
                # Pre-script setup matching auth-server.yaml
                export PYTHONUNBUFFERED=1
                apt-get update && apt-get install -y --no-install-recommends curl git build-essential
                apt-get clean && rm -rf /var/lib/apt/lists/*
                
                # Debug: Check repository structure after git clone
                echo "Repository structure:"
                ls -la /app/
                echo "Looking for auth server:"
                find /app -name "*auth*" -type d || echo "No auth directories found"
                find /app -name "server.py" -o -name "*server*" | head -10
                
                # Clone repository
                git clone https://github.com/agentic-community/mcp-gateway-registry /app
                
                # Work directly from the cloned repository
                cd /app/auth_server || (echo "auth_server directory not found, using /app" && cd /app)
                
                # Install uv and setup Python environment exactly like Dockerfile.auth
                pip install uv
                uv venv .venv --python 3.12
                . .venv/bin/activate
                
                # Use the auth server's own pyproject.toml for correct dependencies
                pwd && ls -la pyproject.toml
                uv pip install --requirement /app/auth_server/pyproject.toml || uv pip install uvicorn fastapi pydantic python-dotenv boto3 botocore requests httpx itsdangerous 'python-jose[cryptography]' python-multipart PyJWT PyYAML
                
                # Create EFS directories first before symlinking
                mkdir -p /efs/mcp-gateway/logs /efs/mcp-gateway/auth_server
                touch /efs/mcp-gateway/auth_server/scopes.yml || echo "Could not create scopes.yml"
                
                # Create symlinks only if directories exist
                ln -sf /efs/mcp-gateway/logs /app/logs || echo "logs symlink failed"
                ln -sf /efs/mcp-gateway/auth_server/scopes.yml /app/scopes.yml || echo "scopes.yml symlink failed"
                
                # Start auth server with exact command from reference
                cd /app/auth_server || cd /app
                source .venv/bin/activate
                python -c 'import os; print("Working dir:", os.getcwd()); print("Files:", os.listdir())'
                find . -name 'server.py' -o -name '*.py' | head -5
                uvicorn server:app --host 0.0.0.0 --port 8888 || uvicorn main:app --host 0.0.0.0 --port 8888
              `],
              resources: {
                requests: {
                  cpu: '250m',
                  memory: '512Mi'
                },
                limits: {
                  cpu: '500m',
                  memory: '1Gi'
                }
              },
              volumeMounts: [{
                name: 'efs-storage',
                mountPath: '/efs'
              }],
              // Health checks matching reference
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8888
                },
                periodSeconds: 30,
                failureThreshold: 5
              },
              startupProbe: {
                httpGet: {
                  path: '/health',
                  port: 8888
                },
                periodSeconds: 30,
                failureThreshold: 20
              },
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8888
                },
                periodSeconds: 30,
                failureThreshold: 3
              }
            }],
            volumes: [{
              name: 'efs-storage',
              persistentVolumeClaim: {
                claimName: 'efs-claim'
              }
            }]
          }
        }
      }
    });

    // Create auth-server service
    const service = props.cluster.addManifest('AuthServerService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'auth-server',
        namespace: props.namespace,
        labels: {
          app: 'auth-server'
        }
      },
      spec: {
        selector: {
          app: 'auth-server'
        },
        ports: [{
          name: 'auth',
          port: 8888,
          targetPort: 8888
        }],
        type: 'ClusterIP'
      }
    });

    // Add HPA for autoscaling matching reference
    const hpa = props.cluster.addManifest('AuthServerHPA', {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'auth-server-hpa',
        namespace: props.namespace
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'auth-server'
        },
        minReplicas: 1,
        maxReplicas: 2,
        metrics: [{
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: 80
            }
          }
        }]
      }
    });
  }
}
