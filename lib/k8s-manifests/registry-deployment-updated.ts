import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

export interface RegistryDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  adminUser: string;
  adminPassword: string;
  secretKey: string;
  domainName: string;
  authServerUrl: string;
  authServerExternalUrl: string;
  registryUrl: string;
  efsFileSystemId: string;
  cognitoClientId: string;
  cognitoClientSecret: string;
  cognitoUserPoolId: string;
  awsRegion: string;
}

export class RegistryDeployment extends Construct {
  constructor(scope: Construct, id: string, props: RegistryDeploymentProps) {
    super(scope, id);

    // Create registry deployment matching reference registry-server.yaml
    const deployment = props.cluster.addManifest('RegistryDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'registry',
        namespace: props.namespace,
        labels: {
          app: 'registry'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'registry'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'registry'
            }
          },
          spec: {
            containers: [{
              name: 'registry',
              image: 'python:3.12-slim', // Match reference
              ports: [
                { name: 'http', containerPort: 80 },
                { name: 'https', containerPort: 443 },
                { name: 'registry', containerPort: 7860 }
              ],
              env: [
                { name: 'HOME', value: '/app' },
                { name: 'PYTHONUNBUFFERED', value: '1' },
                { name: 'DEBIAN_FRONTEND', value: 'noninteractive' },
                { name: 'SECRET_KEY', value: props.secretKey },
                { name: 'ADMIN_USER', value: props.adminUser },
                { name: 'ADMIN_PASSWORD', value: props.adminPassword },
                { name: 'AUTH_SERVER_URL', value: props.authServerUrl },
                { name: 'AUTH_SERVER_EXTERNAL_URL', value: props.authServerExternalUrl },
                { name: 'REGISTRY_URL', value: props.registryUrl },
                { name: 'DOMAIN_NAME', value: props.domainName },
                { name: 'COGNITO_CLIENT_ID', value: props.cognitoClientId },
                { name: 'COGNITO_CLIENT_SECRET', value: props.cognitoClientSecret },
                { name: 'COGNITO_USER_POOL_ID', value: props.cognitoUserPoolId },
                { name: 'AWS_REGION', value: props.awsRegion },
                { name: 'EMBEDDINGS_MODEL_NAME', value: 'all-MiniLM-L6-v2' },
                { name: 'EMBEDDINGS_MODEL_DIMENSIONS', value: '384' }
              ],
              command: ['/bin/bash'],
              args: ['-c', `
                # Comprehensive pre-script setup matching registry-server.yaml
                export DEBIAN_FRONTEND=noninteractive
                chmod a+rwx /tmp
                
                # Install system dependencies including Node.js (mirror dockerfile.registry)
                apt-get update && apt-get install -y --no-install-recommends nginx nginx-extras lua-cjson curl procps openssl git build-essential ca-certificates
                curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                apt-get install -y nodejs
                apt-get clean && rm -rf /var/lib/apt/lists/*
                
                # Clone repository
                git clone https://github.com/agentic-community/mcp-gateway-registry /app
                cd /app
                
                # Build React frontend (mirror dockerfile.registry frontend build process)
                echo "Building React frontend..."
                cd /app/frontend
                if [ ! -f "package.json" ]; then echo "ERROR: frontend/package.json not found"; exit 1; fi
                echo "Installing frontend dependencies..."
                npm install --legacy-peer-deps
                echo "Building React application for production..."
                npm run build
                echo "Frontend build completed successfully"
                cd /app
                
                # Install uv and setup Python environment (mirror dockerfile.registry)
                pip install uv
                cd /app && uv venv .venv --python 3.12
                cd /app && . .venv/bin/activate && uv pip install "fastapi>=0.115.12" "itsdangerous>=2.2.0" "jinja2>=3.1.6" "mcp>=1.6.0" "pydantic>=2.11.3" "httpx>=0.27.0" "python-dotenv>=1.1.0" "python-multipart>=0.0.20" "uvicorn[standard]>=0.34.2" "faiss-cpu>=1.7.4" "sentence-transformers>=2.2.2" "websockets>=15.0.1" "scikit-learn>=1.3.0" "torch>=1.6.0" "huggingface-hub[cli,hf_xet]>=0.31.1" "hf_xet>=0.1.0"
                cd /app && . .venv/bin/activate && uv pip install -e .
                
                # Create logs directory (mirror dockerfile.registry)
                mkdir -p /app/logs
                
                # Environment Variable Setup (from registry-entrypoint.sh)
                echo "Setting up environment variables..."
                if [ -z "$SECRET_KEY" ]; then SECRET_KEY=$(python -c 'import secrets; print(secrets.token_hex(32))'); fi
                ADMIN_USER_VALUE=\${ADMIN_USER:-admin}
                if [ -z "$ADMIN_PASSWORD" ]; then echo "ERROR: ADMIN_PASSWORD environment variable is not set."; exit 1; fi
                
                # Create .env file for registry (from registry-entrypoint.sh)
                REGISTRY_ENV_FILE="/app/registry/.env"
                echo "Creating Registry .env file..."
                echo "SECRET_KEY=\${SECRET_KEY}" > "$REGISTRY_ENV_FILE"
                echo "ADMIN_USER=\${ADMIN_USER_VALUE}" >> "$REGISTRY_ENV_FILE"
                echo "ADMIN_PASSWORD=\${ADMIN_PASSWORD}" >> "$REGISTRY_ENV_FILE"
                echo "Registry .env created."
                
                # SSL Certificate Generation (from registry-entrypoint.sh)
                SSL_CERT_DIR="/etc/ssl/certs"
                SSL_KEY_DIR="/etc/ssl/private"
                SSL_CERT_PATH="$SSL_CERT_DIR/fullchain.pem"
                SSL_KEY_PATH="$SSL_KEY_DIR/privkey.pem"
                echo "Checking for SSL certificates..."
                if [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; then
                  echo "Generating self-signed SSL certificate for Nginx..."
                  mkdir -p "$SSL_CERT_DIR" "$SSL_KEY_DIR"
                  openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "$SSL_KEY_PATH" -out "$SSL_CERT_PATH" -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=localhost"
                  echo "SSL certificate generated."
                else
                  echo "SSL certificates already exist, skipping generation."
                fi
                
                # Lua Module Setup (from registry-entrypoint.sh)
                echo "Setting up Lua support for nginx..."
                LUA_SCRIPTS_DIR="/etc/nginx/lua"
                mkdir -p "$LUA_SCRIPTS_DIR"
                echo 'local cjson = require "cjson"; ngx.req.read_body(); local body_data = ngx.req.get_body_data(); if body_data then ngx.req.set_header("X-Body", body_data); ngx.log(ngx.INFO, "Captured request body"); else ngx.log(ngx.INFO, "No request body found"); end' > "$LUA_SCRIPTS_DIR/capture_body.lua"
                echo "Lua script created."
                
                # Create nginx configuration with proper API routing
                cat > /etc/nginx/conf.d/default.conf << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    root /app/frontend/build;
    index index.html;
    server_name _;
    
    # API auth routes - map /api/auth/* to auth-server
    location /api/auth/providers {
        proxy_pass http://auth-server:8888/oauth2/providers;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }
    
    location /api/auth/login {
        proxy_pass http://auth-server:8888/oauth2/login/cognito;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }
    
    location /api/auth/logout {
        proxy_pass http://auth-server:8888/oauth2/logout/cognito;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }
    
    location /api/auth/me {
        proxy_pass http://auth-server:8888/validate;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }
    
    # OAuth2 direct endpoints (for backward compatibility)
    location /oauth2/ {
        proxy_pass http://auth-server:8888/oauth2/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }
    
    # Registry API routes
    location /api/ {
        proxy_pass http://127.0.0.1:7860/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static files with caching
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
    
    # React SPA - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
NGINX_EOF
                
                # Model Download (from registry-entrypoint.sh)
                EMBEDDINGS_MODEL_NAME="all-MiniLM-L6-v2"
                EMBEDDINGS_MODEL_DIR="/app/registry/models/$EMBEDDINGS_MODEL_NAME"
                echo "Checking for sentence-transformers model..."
                mkdir -p "$EMBEDDINGS_MODEL_DIR"
                echo "Ensuring CA certificates are installed..."
                apt-get update && apt-get install -y ca-certificates && update-ca-certificates
                echo "Downloading model using huggingface-cli..."
                cd /app && ./.venv/bin/huggingface-cli download sentence-transformers/$EMBEDDINGS_MODEL_NAME --local-dir "$EMBEDDINGS_MODEL_DIR" --quiet || echo "Model download failed, will continue"
                echo "Model setup completed"
                
                # Create shared directories on EFS
                mkdir -p /efs/mcp-gateway/servers /efs/mcp-gateway/models /efs/mcp-gateway/logs
                mkdir -p /efs/mcp-gateway/ssl/certs /efs/mcp-gateway/ssl/private
                mkdir -p /efs/mcp-gateway/auth_server /efs/mcp-gateway/secrets/fininfo
                
                # Initialize EFS with repository defaults if files don't exist
                echo "Initializing EFS with repository defaults..."
                if [ ! -f /efs/mcp-gateway/scopes.yml ] && [ -f /app/auth_server/scopes.yml ]; then
                  echo "Copying scopes.yml from repository to EFS..."
                  cp /app/auth_server/scopes.yml /efs/mcp-gateway/scopes.yml
                  echo "scopes.yml copied successfully."
                else
                  echo "scopes.yml already exists in EFS or not found in repository."
                fi
                
                if [ ! -d /efs/mcp-gateway/servers ] || [ -z "$(ls -A /efs/mcp-gateway/servers)" ]; then
                  if [ -d /app/registry/servers ]; then
                    echo "Copying servers directory from repository to EFS..."
                    cp -r /app/registry/servers/* /efs/mcp-gateway/servers/ 2>/dev/null || echo "No servers found in repository to copy."
                    echo "servers directory initialized."
                  else
                    echo "servers directory not found in repository."
                  fi
                else
                  echo "servers directory already populated in EFS."
                fi
                echo "EFS initialization completed."
                
                # Map shared EFS directories to expected application paths
                ln -sf /efs/mcp-gateway/servers /app/registry/servers || echo "servers symlink failed"
                ln -sf /efs/mcp-gateway/models /app/registry/models || echo "models symlink failed"
                ln -sf /efs/mcp-gateway/logs /app/logs || echo "logs symlink failed"
                mkdir -p /app/auth_server
                ln -sf /efs/mcp-gateway/scopes.yml /app/auth_server/scopes.yml || echo "scopes.yml symlink failed"
                
                # Start Background Services (from registry-entrypoint.sh)
                export EMBEDDINGS_MODEL_NAME=$EMBEDDINGS_MODEL_NAME
                export EMBEDDINGS_MODEL_DIMENSIONS=384
                echo "Starting MCP Registry in the background..."
                cd /app && ./.venv/bin/uvicorn registry.main:app --host 0.0.0.0 --port 7860 &
                echo "MCP Registry started."
                
                # Give registry a moment to initialize
                sleep 10
                
                echo "Starting Nginx..."
                nginx
                echo "Nginx started."
                
                echo "Registry service fully started."
                
                # Keep container alive (mirror registry-entrypoint.sh: tail -f /dev/null)
                echo 'Registry service running. Keeping container alive...'
                tail -f /dev/null
              `],
              resources: {
                requests: {
                  cpu: '500m',
                  memory: '2Gi'
                },
                limits: {
                  cpu: '1',
                  memory: '4Gi'
                }
              },
              volumeMounts: [{
                name: 'efs-storage',
                mountPath: '/efs'
              }],
              // Health checks matching reference - use port 7860 for backend
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 7860
                },
                periodSeconds: 30,
                failureThreshold: 5
              },
              startupProbe: {
                httpGet: {
                  path: '/health',
                  port: 7860
                },
                periodSeconds: 40,
                failureThreshold: 20
              },
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 7860
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

    // Create registry service
    const service = props.cluster.addManifest('RegistryService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'registry',
        namespace: props.namespace,
        labels: {
          app: 'registry'
        }
      },
      spec: {
        selector: {
          app: 'registry'
        },
        ports: [
          { name: 'http', port: 80, targetPort: 80 },
          { name: 'https', port: 443, targetPort: 443 },
          { name: 'registry', port: 7860, targetPort: 7860 }
        ],
        type: 'ClusterIP'
      }
    });

    // Add HPA for autoscaling matching reference
    const hpa = props.cluster.addManifest('RegistryHPA', {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'registry-hpa',
        namespace: props.namespace
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'registry'
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
