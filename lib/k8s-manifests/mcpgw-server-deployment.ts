import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface McpGatewayServerDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  efsFileSystemId?: string;
}

export class McpGatewayServerDeployment extends Construct {
  constructor(scope: Construct, id: string, props: McpGatewayServerDeploymentProps) {
    super(scope, id);

    // MCP Gateway Server Deployment
    props.cluster.addManifest('McpGatewayServerDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'mcpgw-server',
        namespace: props.namespace,
        labels: {
          app: 'mcpgw-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            app: 'mcpgw-server'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'mcpgw-server',
              'managed-by': 'cdk'
            }
          },
          spec: {
            containers: [{
              name: 'mcpgw-server',
              image: 'python:3.12-slim',
              ports: [{
                containerPort: 8003
              }],
              env: [
                {
                  name: 'PORT',
                  value: '8003'
                },
                {
                  name: 'PYTHONUNBUFFERED',
                  value: '1'
                },
                {
                  name: 'MCP_SERVER_NAME',
                  value: 'mcpgw-server'
                },
                {
                  name: 'AUTH_SERVER_URL',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'mcp-gateway-config',
                      key: 'AUTH_SERVER_URL'
                    }
                  }
                },
                {
                  name: 'REGISTRY_URL',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'mcp-gateway-config',
                      key: 'REGISTRY_URL'
                    }
                  }
                }
              ],
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
              command: ['/bin/bash', '-c'],
              args: [`
                echo "Installing MCP Gateway Server dependencies..."
                pip install --no-cache-dir fastapi uvicorn python-multipart aiofiles requests websockets
                
                echo "Creating MCP Gateway Server..."
                cat > /app/mcpgw_server.py << 'EOF'
import asyncio
import json
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import uvicorn
import requests

app = FastAPI(title="MCP Gateway Server", version="1.0.0")

class MCPGatewayServer:
    def __init__(self):
        self.name = "mcpgw-server"
        self.version = "1.0.0"
        self.auth_server_url = os.getenv('AUTH_SERVER_URL', 'http://auth-server:8888')
        self.registry_url = os.getenv('REGISTRY_URL', 'http://registry:7860')
        self.tool_servers = {
            'currenttime': 'http://currenttime-server:8000',
            'fininfo': 'http://fininfo-server:8001',
            'faketools': 'http://faketools-server:8002'
        }
        self.active_connections: List[WebSocket] = []
        
    async def authenticate_request(self, token: str) -> bool:
        """Authenticate request with auth server"""
        try:
            response = requests.get(
                f"{self.auth_server_url}/verify",
                headers={"Authorization": f"Bearer {token}"},
                timeout=5
            )
            return response.status_code == 200
        except:
            return False
    
    async def route_mcp_request(self, server_name: str, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Route MCP request to appropriate server"""
        try:
            if server_name not in self.tool_servers:
                raise ValueError(f"Unknown server: {server_name}")
            
            server_url = self.tool_servers[server_name]
            url = f"{server_url}{endpoint}"
            
            response = requests.post(url, json=data, timeout=10)
            response.raise_for_status()
            
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error routing request: {str(e)}")
    
    async def list_available_tools(self) -> Dict[str, Any]:
        """List all available tools from all servers"""
        all_tools = {}
        
        for server_name, server_url in self.tool_servers.items():
            try:
                response = requests.get(f"{server_url}/mcp/tools", timeout=5)
                if response.status_code == 200:
                    tools_data = response.json()
                    all_tools[server_name] = tools_data.get('tools', [])
            except:
                all_tools[server_name] = []
        
        return {
            "servers": all_tools,
            "total_servers": len(self.tool_servers),
            "gateway_version": self.version
        }
    
    async def get_server_health(self) -> Dict[str, Any]:
        """Check health of all connected servers"""
        health_status = {}
        
        # Check auth server
        try:
            response = requests.get(f"{self.auth_server_url}/health", timeout=5)
            health_status['auth_server'] = {
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "url": self.auth_server_url
            }
        except:
            health_status['auth_server'] = {"status": "unhealthy", "url": self.auth_server_url}
        
        # Check registry
        try:
            response = requests.get(f"{self.registry_url}/health", timeout=5)
            health_status['registry'] = {
                "status": "healthy" if response.status_code == 200 else "unhealthy",
                "url": self.registry_url
            }
        except:
            health_status['registry'] = {"status": "unhealthy", "url": self.registry_url}
        
        # Check tool servers
        for server_name, server_url in self.tool_servers.items():
            try:
                response = requests.get(f"{server_url}/health", timeout=5)
                health_status[server_name] = {
                    "status": "healthy" if response.status_code == 200 else "unhealthy",
                    "url": server_url
                }
            except:
                health_status[server_name] = {"status": "unhealthy", "url": server_url}
        
        return health_status

gateway = MCPGatewayServer()

@app.get("/")
async def root():
    return {"message": "MCP Gateway Server", "version": gateway.version}

@app.get("/health")
async def health():
    return {"status": "healthy", "server": gateway.name}

@app.get("/mcp/servers")
async def list_servers():
    return {
        "servers": list(gateway.tool_servers.keys()),
        "auth_server": gateway.auth_server_url,
        "registry": gateway.registry_url
    }

@app.get("/mcp/tools")
async def list_all_tools():
    result = await gateway.list_available_tools()
    return JSONResponse(content=result)

@app.get("/mcp/health")
async def get_system_health():
    result = await gateway.get_server_health()
    return JSONResponse(content=result)

@app.post("/mcp/route/{server_name}")
async def route_request(server_name: str, request: Dict[str, Any]):
    endpoint = request.get("endpoint", "/")
    data = request.get("data", {})
    
    result = await gateway.route_mcp_request(server_name, endpoint, data)
    return JSONResponse(content=result)

@app.websocket("/mcp/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    gateway.active_connections.append(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle WebSocket MCP requests
            if message.get("type") == "mcp_request":
                server_name = message.get("server")
                endpoint = message.get("endpoint")
                request_data = message.get("data", {})
                
                try:
                    result = await gateway.route_mcp_request(server_name, endpoint, request_data)
                    await websocket.send_text(json.dumps({
                        "type": "mcp_response",
                        "success": True,
                        "data": result
                    }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "type": "mcp_response",
                        "success": False,
                        "error": str(e)
                    }))
            
    except WebSocketDisconnect:
        gateway.active_connections.remove(websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
EOF

                echo "Starting MCP Gateway Server on port 8003..."
                cd /app && python mcpgw_server.py
              `],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8003
                },
                initialDelaySeconds: 60,
                periodSeconds: 30
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8003
                },
                initialDelaySeconds: 30,
                periodSeconds: 10
              },
              ...(props.efsFileSystemId && {
                volumeMounts: [{
                  name: 'efs-storage',
                  mountPath: '/mcp-gateway/mcpgw',
                  subPath: 'mcpgw'
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

    // MCP Gateway Server Service
    props.cluster.addManifest('McpGatewayServerService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'mcpgw-server',
        namespace: props.namespace,
        labels: {
          app: 'mcpgw-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        selector: {
          app: 'mcpgw-server'
        },
        ports: [{
          port: 8003,
          targetPort: 8003,
          protocol: 'TCP',
          name: 'http'
        }],
        type: 'ClusterIP'
      }
    });
  }
}
