import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface FakeToolsServerDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  efsFileSystemId?: string;
}

export class FakeToolsServerDeployment extends Construct {
  constructor(scope: Construct, id: string, props: FakeToolsServerDeploymentProps) {
    super(scope, id);

    // Real Server Fake Tools Deployment
    props.cluster.addManifest('FakeToolsServerDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'faketools-server',
        namespace: props.namespace,
        labels: {
          app: 'faketools-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'faketools-server'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'faketools-server',
              'managed-by': 'cdk'
            }
          },
          spec: {
            containers: [{
              name: 'faketools-server',
              image: 'python:3.12-slim',
              ports: [{
                containerPort: 8002
              }],
              env: [
                {
                  name: 'PORT',
                  value: '8002'
                },
                {
                  name: 'PYTHONUNBUFFERED',
                  value: '1'
                },
                {
                  name: 'MCP_SERVER_NAME',
                  value: 'faketools-server'
                }
              ],
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '256Mi'
                },
                limits: {
                  cpu: '250m',
                  memory: '512Mi'
                }
              },
              command: ['/bin/bash', '-c'],
              args: [`
                echo "Installing MCP Fake Tools Server dependencies..."
                pip install --no-cache-dir fastapi uvicorn python-multipart aiofiles
                
                echo "Creating Fake Tools MCP Server..."
                cat > /app/faketools_server.py << 'EOF'
import asyncio
import json
import random
import string
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="MCP Real Server Fake Tools", version="1.0.0")

class MCPFakeToolsServer:
    def __init__(self):
        self.name = "faketools-server"
        self.version = "1.0.0"
        
    async def generate_random_string(self, length: int = 10) -> Dict[str, Any]:
        """Generate a random string"""
        try:
            if length < 1 or length > 1000:
                raise ValueError("Length must be between 1 and 1000")
                
            random_string = ''.join(random.choices(string.ascii_letters + string.digits, k=length))
            return {
                "random_string": random_string,
                "length": length,
                "type": "alphanumeric"
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error generating random string: {str(e)}")
    
    async def generate_uuid(self) -> Dict[str, Any]:
        """Generate a UUID"""
        try:
            import uuid
            generated_uuid = str(uuid.uuid4())
            return {
                "uuid": generated_uuid,
                "version": 4,
                "type": "uuid4"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating UUID: {str(e)}")
    
    async def hash_text(self, text: str, algorithm: str = "sha256") -> Dict[str, Any]:
        """Hash text using specified algorithm"""
        try:
            import hashlib
            
            if algorithm not in ["md5", "sha1", "sha256", "sha512"]:
                raise ValueError("Unsupported hash algorithm")
            
            hash_func = getattr(hashlib, algorithm)
            hash_value = hash_func(text.encode()).hexdigest()
            
            return {
                "original_text": text,
                "hash": hash_value,
                "algorithm": algorithm
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error hashing text: {str(e)}")
    
    async def encode_base64(self, text: str) -> Dict[str, Any]:
        """Encode text to base64"""
        try:
            import base64
            encoded = base64.b64encode(text.encode()).decode()
            return {
                "original_text": text,
                "encoded": encoded,
                "encoding": "base64"
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error encoding to base64: {str(e)}")
    
    async def decode_base64(self, encoded_text: str) -> Dict[str, Any]:
        """Decode base64 text"""
        try:
            import base64
            decoded = base64.b64decode(encoded_text).decode()
            return {
                "encoded_text": encoded_text,
                "decoded": decoded,
                "encoding": "base64"
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error decoding base64: {str(e)}")
    
    async def generate_password(self, length: int = 12, include_symbols: bool = True) -> Dict[str, Any]:
        """Generate a secure password"""
        try:
            if length < 4 or length > 128:
                raise ValueError("Length must be between 4 and 128")
            
            chars = string.ascii_letters + string.digits
            if include_symbols:
                chars += "!@#$%^&*"
            
            password = ''.join(random.choices(chars, k=length))
            
            return {
                "password": password,
                "length": length,
                "includes_symbols": include_symbols,
                "strength": "strong" if length >= 12 else "medium" if length >= 8 else "weak"
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error generating password: {str(e)}")

server = MCPFakeToolsServer()

@app.get("/")
async def root():
    return {"message": "MCP Real Server Fake Tools", "version": server.version}

@app.get("/health")
async def health():
    return {"status": "healthy", "server": server.name}

@app.post("/mcp/tools/random-string")
async def generate_random_string(request: Dict[str, Any] = None):
    length = 10
    if request and "length" in request:
        length = int(request["length"])
    
    result = await server.generate_random_string(length)
    return JSONResponse(content=result)

@app.post("/mcp/tools/uuid")
async def generate_uuid():
    result = await server.generate_uuid()
    return JSONResponse(content=result)

@app.post("/mcp/tools/hash")
async def hash_text(request: Dict[str, Any]):
    if not request or "text" not in request:
        raise HTTPException(status_code=400, detail="text is required")
    
    algorithm = request.get("algorithm", "sha256")
    result = await server.hash_text(request["text"], algorithm)
    return JSONResponse(content=result)

@app.post("/mcp/tools/encode-base64")
async def encode_base64(request: Dict[str, Any]):
    if not request or "text" not in request:
        raise HTTPException(status_code=400, detail="text is required")
    
    result = await server.encode_base64(request["text"])
    return JSONResponse(content=result)

@app.post("/mcp/tools/decode-base64")
async def decode_base64(request: Dict[str, Any]):
    if not request or "encoded_text" not in request:
        raise HTTPException(status_code=400, detail="encoded_text is required")
    
    result = await server.decode_base64(request["encoded_text"])
    return JSONResponse(content=result)

@app.post("/mcp/tools/generate-password")
async def generate_password(request: Dict[str, Any] = None):
    length = 12
    include_symbols = True
    
    if request:
        length = request.get("length", 12)
        include_symbols = request.get("include_symbols", True)
    
    result = await server.generate_password(length, include_symbols)
    return JSONResponse(content=result)

@app.get("/mcp/tools")
async def list_tools():
    return {
        "tools": [
            {
                "name": "generate_random_string",
                "description": "Generate a random alphanumeric string",
                "parameters": {
                    "length": {"type": "integer", "description": "Length of string (1-1000)", "default": 10}
                }
            },
            {
                "name": "generate_uuid",
                "description": "Generate a UUID v4",
                "parameters": {}
            },
            {
                "name": "hash_text",
                "description": "Hash text using specified algorithm",
                "parameters": {
                    "text": {"type": "string", "description": "Text to hash"},
                    "algorithm": {"type": "string", "description": "Hash algorithm (md5, sha1, sha256, sha512)", "default": "sha256"}
                }
            },
            {
                "name": "encode_base64",
                "description": "Encode text to base64",
                "parameters": {
                    "text": {"type": "string", "description": "Text to encode"}
                }
            },
            {
                "name": "decode_base64",
                "description": "Decode base64 text",
                "parameters": {
                    "encoded_text": {"type": "string", "description": "Base64 encoded text to decode"}
                }
            },
            {
                "name": "generate_password",
                "description": "Generate a secure password",
                "parameters": {
                    "length": {"type": "integer", "description": "Password length (4-128)", "default": 12},
                    "include_symbols": {"type": "boolean", "description": "Include symbols", "default": True}
                }
            }
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
EOF

                echo "Starting Fake Tools Server on port 8002..."
                cd /app && python faketools_server.py
              `],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8002
                },
                initialDelaySeconds: 60,
                periodSeconds: 30
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8002
                },
                initialDelaySeconds: 30,
                periodSeconds: 10
              },
              ...(props.efsFileSystemId && {
                volumeMounts: [{
                  name: 'efs-storage',
                  mountPath: '/mcp-gateway/faketools',
                  subPath: 'faketools'
                }]
              })
            }],
            ...(props.efsFileSystemId && {
              volumes: [{
                name: 'efs-storage',
                persistentVolumeClaim: {
                  claimName: 'efs-pvc'
                }
              }]
            })
          }
        }
      }
    });

    // Fake Tools Server Service
    props.cluster.addManifest('FakeToolsServerService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'faketools-server',
        namespace: props.namespace,
        labels: {
          app: 'faketools-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        selector: {
          app: 'faketools-server'
        },
        ports: [{
          port: 8002,
          targetPort: 8002,
          protocol: 'TCP',
          name: 'http'
        }],
        type: 'ClusterIP'
      }
    });
  }
}
