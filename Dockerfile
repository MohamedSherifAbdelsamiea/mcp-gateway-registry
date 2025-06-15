FROM public.ecr.aws/s6b2x6i4/mcp-gateway-registry:latest

# Copy the modified template files
COPY modified-templates/login.html /app/mcp-gateway-registry/registry/templates/login.html

# No need to expose ports or set environment variables as they're inherited from the base image

# No need to change the entrypoint as it's inherited from the base image
