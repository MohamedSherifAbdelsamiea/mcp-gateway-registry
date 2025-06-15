"""
Sample application file for development purposes.
This file demonstrates how to make changes to the MCP Gateway Registry.
"""

from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets

app = FastAPI(title="MCP Gateway Registry Development")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="templates")

# Security
security = HTTPBasic()

# Sample user database
users = {
    "admin": "password123"
}

@app.get("/")
async def root(request: Request):
    """Root endpoint that redirects to login page."""
    return {"message": "Welcome to MCP Gateway Registry Development"}

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.get("/version")
async def version():
    """Version endpoint."""
    return {"version": "0.1.0-dev"}

# Add more endpoints as needed for development
